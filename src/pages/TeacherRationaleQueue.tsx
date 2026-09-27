import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { RationaleQueueQuestion } from "../lib/api";
import {
  RATIONALE_BATCH_SIZE,
  suggestOptionRationale,
  suggestOptionRationaleBatch,
  type AiRationaleSuggestion,
} from "../lib/ai";
import {
  DISTRACTOR_ERROR_TYPE_LABELS,
  rankLabelingQueue,
  summarizeLabelingCoverage,
} from "../lib/errorIntelligence";
import { DIFFICULTY_LABELS } from "../lib/types";
import type { Part1Options, QuestionOptionRationaleRow, Topic } from "../lib/types";
import { MathText } from "../components/MathText";
import {
  blankDrafts,
  correctKeyOf,
  draftsFromRows,
  labelOptionsFromRows,
  missingErrorTypes,
  OPTION_KEYS,
  RationaleRowsEditor,
  toSaveRows,
  wrongKeysOf,
  type RationaleDraftRow,
} from "../components/RationaleRowsEditor";
import { RATIONALE_STATUS_LABEL } from "../components/DistractorRationaleEditor";

type StatusFilter = "can_lam" | "none" | "draft" | "verified" | "all";

const FILTER_LABELS: Record<StatusFilter, string> = {
  can_lam: "Cần làm (chưa có nhãn + nháp AI)",
  none: "Chưa có nhãn",
  draft: "Nháp AI chờ duyệt",
  verified: "Đã xác nhận",
  all: "Tất cả",
};

const PAGE = 15;

/**
 * Trang "Gắn nhãn lỗi nhanh" (27/09/2026) — trả lời yêu cầu "làm nhanh nhất có
 * thể" của Thầy Tường:
 *  1. Chỉ làm câu CẦN làm: xếp câu Phần 1 theo số lượt học sinh THỰC SỰ chọn
 *     sai (nhiều nhất trước). Error DNA tính on-demand nên nhãn gắn hôm nay áp
 *     dụng ngược cho mọi bài làm cũ — gắn 15-20 câu đầu thường đã phủ phần lớn
 *     lỗi thực tế (xem thanh "Độ phủ").
 *  2. AI soạn nháp THEO LÔ (5 câu/1 lượt gọi) và lưu nháp — tiết kiệm hạn mức
 *     miễn phí ~20 lượt/ngày; nháp chưa xác nhận KHÔNG ảnh hưởng chẩn đoán.
 *  3. Thầy chỉ duyệt: xem, sửa nếu cần, bấm "Xác nhận" — hoặc xác nhận hàng
 *     loạt các nháp đã xem.
 */
export function TeacherRationaleQueue() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string>("");
  const [items, setItems] = useState<RationaleQueueQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RationaleDraftRow[]>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [aiOneIds, setAiOneIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openSolution, setOpenSolution] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<StatusFilter>("can_lam");
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [batchCount, setBatchCount] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  /** Câu đang nằm trong lô AI đang chạy — khoá sửa/xác nhận để không giẫm lên nhau. */
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.listTopics().then((ts) => {
      const sorted = [...ts].sort(
        (a, b) => b.grade - a.grade || (a.order_index ?? 99) - (b.order_index ?? 99),
      );
      setTopics(sorted);
      const pilot = sorted.find((t) => t.grade === 12 && t.order_index === 1);
      setTopicId(pilot?.id ?? "");
    });
  }, []);

  async function reload(id: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRationaleQueue(id || null);
      setItems(data);
      setDrafts(Object.fromEntries(data.map((it) => [it.question.id, initialDrafts(it)])));
      setEditing(new Set());
      setVisibleCount(PAGE);
    } catch (err) {
      setItems(null);
      setError(
        api.isMissingTableError(err)
          ? "Chưa chạy migration_019_error_intelligence_core.sql trên Supabase (SQL Editor) — chạy xong tải lại trang."
          : `Không tải được dữ liệu: ${(err as Error).message}`,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (topics.length > 0) reload(topicId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, topics.length]);

  function initialDrafts(it: RationaleQueueQuestion): RationaleDraftRow[] {
    return it.rationale.length > 0 ? draftsFromRows(it.question, it.rationale) : blankDrafts(it.question);
  }

  const itemById = useMemo(() => new Map((items ?? []).map((it) => [it.question.id, it])), [items]);
  const ranked = useMemo(
    () =>
      rankLabelingQueue(
        (items ?? []).map((it) => ({
          questionId: it.question.id,
          correctOption: correctKeyOf(it.question),
          choiceCounts: it.choiceCounts,
          status: it.status,
        })),
      ),
    [items],
  );
  const rankOf = useMemo(() => new Map(ranked.map((r, i) => [r.questionId, i + 1])), [ranked]);
  const coverage = useMemo(() => summarizeLabelingCoverage(ranked), [ranked]);
  const allRows = useMemo(() => (items ?? []).flatMap((it) => it.rationale), [items]);
  const labelOptions = useMemo(() => labelOptionsFromRows(allRows), [allRows]);
  const labelsByLesson = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const it of items ?? []) {
      if (!it.question.lesson_id) continue;
      const labels = it.rationale.filter((r) => r.verified_by_teacher && r.pattern_label).map((r) => r.pattern_label as string);
      map.set(it.question.lesson_id, Array.from(new Set([...(map.get(it.question.lesson_id) ?? []), ...labels])));
    }
    return map;
  }, [items]);

  const filtered = ranked.filter((r) => {
    if (filter === "all") return true;
    if (filter === "can_lam") return r.status !== "verified";
    return r.status === filter;
  });
  const visible = filtered.slice(0, visibleCount);
  const visibleDraftIds = visible.filter((r) => r.status === "draft").map((r) => r.questionId);

  function patchItem(questionId: string, rationale: QuestionOptionRationaleRow[]) {
    setItems((prev) =>
      (prev ?? []).map((it) =>
        it.question.id === questionId
          ? {
              ...it,
              rationale,
              status:
                rationale.length === 0 ? "none" : rationale.every((r) => r.verified_by_teacher) ? "verified" : "draft",
            }
          : it,
      ),
    );
  }

  function setBusy(setter: typeof setSavingIds, id: string, on: boolean) {
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function applySuggestions(questionId: string, suggestions: AiRationaleSuggestion[]): RationaleDraftRow[] {
    const it = itemById.get(questionId);
    if (!it) return [];
    return wrongKeysOf(it.question).map((key) => {
      const s = suggestions.find((x) => x.option_key === key);
      return {
        option_key: key,
        error_type: s && s.error_type !== "n_a" ? s.error_type : "",
        pattern_label: s?.pattern_label ?? "",
        rationale_text: s?.rationale_text ?? "",
        ai_suggested: !!s,
      };
    });
  }

  async function confirmOne(questionId: string, silent = false): Promise<boolean> {
    const it = itemById.get(questionId);
    if (!it) return false;
    const missing = missingErrorTypes(drafts[questionId] ?? []);
    if (missing.length > 0) {
      setNotes((prev) => ({
        ...prev,
        [questionId]: `Chọn loại lỗi cho phương án ${missing.join(", ")} trước khi xác nhận.`,
      }));
      return false;
    }
    setBusy(setSavingIds, questionId, true);
    try {
      await api.upsertOptionRationale(questionId, toSaveRows(it.question, drafts[questionId] ?? []), {
        verified: true,
      });
      patchItem(questionId, await api.listOptionRationale(questionId));
      setEditing((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
      setNotes((prev) => ({ ...prev, [questionId]: "" }));
      return true;
    } catch (err) {
      if (!silent) setNotes((prev) => ({ ...prev, [questionId]: `Lưu thất bại: ${(err as Error).message}` }));
      return false;
    } finally {
      setBusy(setSavingIds, questionId, false);
    }
  }

  async function confirmAllVisibleDrafts() {
    if (visibleDraftIds.length === 0) return;
    if (
      !window.confirm(
        `Xác nhận ${visibleDraftIds.length} câu đang có nháp AI trên màn hình? Chỉ nên bấm khi thầy đã lướt xem các nháp này.`,
      )
    )
      return;
    let failed = 0;
    for (const id of visibleDraftIds) {
      if (!(await confirmOne(id, true))) failed += 1;
    }
    if (failed > 0) {
      window.alert(`${failed} câu chưa được xác nhận (còn phương án chưa chọn loại lỗi hoặc lỗi lưu) — xem ghi chú dưới từng câu.`);
    }
  }

  async function runAiBatch() {
    const targets = ranked.filter((r) => r.status === "none").slice(0, batchCount);
    if (targets.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < targets.length; i += RATIONALE_BATCH_SIZE) {
      chunks.push(targets.slice(i, i + RATIONALE_BATCH_SIZE).map((t) => t.questionId));
    }
    setBatchRunning(true);
    setBatchIds(new Set(targets.map((t) => t.questionId)));
    let done = 0;
    let skipped = 0;
    try {
      for (let c = 0; c < chunks.length; c++) {
        setBatchProgress(`AI đang soạn lô ${c + 1}/${chunks.length} (đã xong ${done} câu)...`);
        const questions = chunks[c].map((id) => itemById.get(id)!.question);
        const { byQuestionId, errorMessage } = await suggestOptionRationaleBatch(questions, labelsByLesson);
        if (errorMessage) {
          setBatchProgress(`Dừng ở lô ${c + 1}: ${errorMessage} (đã soạn xong ${done} câu, phần đã soạn vẫn được giữ).`);
          return;
        }
        for (const id of chunks[c]) {
          const suggestions = byQuestionId.get(id);
          if (!suggestions) {
            skipped += 1;
            continue;
          }
          const it = itemById.get(id)!;
          const rows = applySuggestions(id, suggestions);
          // onlyIfAbsent: không bao giờ ghi đè nhãn đã có trong DB.
          await api.upsertOptionRationale(id, toSaveRows(it.question, rows), { verified: false, onlyIfAbsent: true });
          const fresh = await api.listOptionRationale(id);
          patchItem(id, fresh);
          setDrafts((prev) => ({ ...prev, [id]: draftsFromRows(it.question, fresh) }));
          done += 1;
        }
      }
      setBatchProgress(
        `Xong: AI đã soạn nháp ${done} câu${skipped ? `, ${skipped} câu AI bỏ sót (bấm "AI soạn nháp" riêng từng câu)` : ""}. Lọc "Nháp AI chờ duyệt" để duyệt.`,
      );
    } catch (err) {
      setBatchProgress(`Lỗi khi lưu nháp: ${(err as Error).message} (đã soạn xong ${done} câu).`);
    } finally {
      setBatchRunning(false);
      setBatchIds(new Set());
    }
  }

  async function aiOne(questionId: string) {
    const it = itemById.get(questionId);
    if (!it) return;
    setBusy(setAiOneIds, questionId, true);
    setNotes((prev) => ({ ...prev, [questionId]: "" }));
    try {
      const labels = it.question.lesson_id ? labelsByLesson.get(it.question.lesson_id) ?? [] : [];
      const { suggestions, errorMessage } = await suggestOptionRationale(it.question, labels);
      if (errorMessage) {
        setNotes((prev) => ({ ...prev, [questionId]: errorMessage }));
        return;
      }
      setDrafts((prev) => ({ ...prev, [questionId]: applySuggestions(questionId, suggestions) }));
    } finally {
      setBusy(setAiOneIds, questionId, false);
    }
  }

  function quickFill(questionId: string) {
    const it = itemById.get(questionId);
    if (!it) return;
    const lessonLabels = it.question.lesson_id ? labelsByLesson.get(it.question.lesson_id) ?? [] : [];
    const top = labelOptions.find((o) => lessonLabels.includes(o.label)) ?? labelOptions[0] ?? null;
    setDrafts((prev) => ({ ...prev, [questionId]: blankDrafts(it.question, top) }));
  }

  const noneCount = ranked.filter((r) => r.status === "none").length;
  const aiCallsNeeded = Math.ceil(Math.min(batchCount, noneCount) / RATIONALE_BATCH_SIZE);

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <h2>Gắn nhãn lỗi nhanh</h2>
      </div>
      <p className="empty-hint">
        Quy trình 3 bước: (1) câu được xếp theo số lượt học sinh chọn sai — làm từ trên xuống; (2) bấm AI soạn
        nháp cho cả lô; (3) thầy xem, sửa nếu cần rồi "Xác nhận". Nhãn đã xác nhận áp dụng ngay cho mọi bài làm
        cũ lẫn mới — không cần gắn đủ trước khi giao đề.
      </p>

      <div className="filter-row">
        <label>Chương:</label>
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Tất cả chương</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              Lớp {t.grade} · {t.name}
            </option>
          ))}
        </select>
        <label>Trạng thái:</label>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as StatusFilter);
            setVisibleCount(PAGE);
          }}
        >
          {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((f) => (
            <option key={f} value={f}>
              {FILTER_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="ai-hint">{error}</p>}
      {loading && <div className="page-loading">Đang tải...</div>}

      {!loading && items && (
        <>
          <div className="li-card" style={{ marginBottom: 12 }}>
            <div className="li-stats">
              <span>
                Đã xác nhận <strong>{coverage.verifiedQuestions}</strong>/{coverage.totalQuestions} câu
              </span>
              <span>
                Nháp AI chờ duyệt <strong>{coverage.draftQuestions}</strong>
              </span>
              <span>
                Độ phủ lỗi thực tế{" "}
                <strong>{coverage.coveragePercent === null ? "—" : `${coverage.coveragePercent}%`}</strong>
                {coverage.totalWrongChoices > 0 &&
                  ` (${coverage.coveredWrongChoices}/${coverage.totalWrongChoices} lượt chọn sai)`}
              </span>
            </div>
            <div className="li-progress">
              <div className="li-progress-fill" style={{ width: `${coverage.coveragePercent ?? 0}%` }} />
            </div>
            <p className="li-summary-line" style={{ margin: 0 }}>
              Độ phủ = tỉ lệ lượt học sinh chọn sai (mọi bài đã làm) đã tra được loại lỗi từ nhãn thầy xác nhận.
              {coverage.totalWrongChoices === 0 && " Chương này chưa có lượt làm bài nào — vẫn gắn trước được."}
            </p>
            <div className="li-actions">
              <label>AI soạn nháp cho</label>
              <select value={batchCount} onChange={(e) => setBatchCount(Number(e.target.value))} disabled={batchRunning}>
                {[5, 10, 20, 40].map((n) => (
                  <option key={n} value={n}>
                    {n} câu
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary"
                onClick={runAiBatch}
                disabled={batchRunning || noneCount === 0}
              >
                {batchRunning
                  ? "Đang chạy..."
                  : noneCount === 0
                    ? "Không còn câu chưa có nhãn"
                    : `Soạn nháp ${Math.min(batchCount, noneCount)} câu tiếp theo (${aiCallsNeeded} lượt AI)`}
              </button>
              {visibleDraftIds.length > 0 && (
                <button type="button" className="btn-secondary" onClick={confirmAllVisibleDrafts} disabled={batchRunning}>
                  Xác nhận {visibleDraftIds.length} nháp đang hiện
                </button>
              )}
            </div>
            {batchProgress && <p className="ai-hint" style={{ marginBottom: 0 }}>{batchProgress}</p>}
          </div>

          {visible.length === 0 ? (
            <p className="empty-hint">
              {items.length === 0
                ? "Chương này chưa có câu Phần 1 nào trong ngân hàng."
                : "Không còn câu nào ở trạng thái này."}
            </p>
          ) : (
            <div className="li-node-list">
              {visible.map((r) => {
                const it = itemById.get(r.questionId)!;
                const q = it.question;
                const choices = (q.options as Part1Options).choices;
                const correct = correctKeyOf(q);
                const isEditing = r.status !== "verified" || editing.has(q.id);
                const saving = savingIds.has(q.id) || batchIds.has(q.id);
                return (
                  <div key={q.id} className="li-card">
                    <div className="li-card-head">
                      <div className="li-meta">
                        <strong>#{rankOf.get(q.id)}</strong>
                        {it.lessonName && <span className="tag tag--muted">{it.lessonName}</span>}
                        {q.difficulty && <span className="tag tag--muted">{DIFFICULTY_LABELS[q.difficulty]}</span>}
                        <span>{r.wrongChoiceTotal} lượt chọn sai</span>
                      </div>
                      <span className={`li-status li-status--${r.status}`}>{RATIONALE_STATUS_LABEL[r.status]}</span>
                    </div>
                    <MathText text={q.content_latex} />
                    {q.image_url && (
                      <img src={q.image_url} alt="" style={{ maxWidth: "100%", maxHeight: 220, display: "block", marginTop: 6 }} />
                    )}
                    <div className="li-options">
                      {OPTION_KEYS.map((k) => (
                        <div key={k} className="li-option">
                          <span className={`li-key ${k === correct ? "li-key--correct" : ""}`}>{k}</span>
                          <span>
                            <MathText text={choices[k]} />{" "}
                            <span className="li-row-count" style={{ display: "inline" }}>
                              ({it.choiceCounts[k] ?? 0})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {q.solution_latex && (
                      <>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() =>
                            setOpenSolution((prev) => {
                              const next = new Set(prev);
                              if (next.has(q.id)) next.delete(q.id);
                              else next.add(q.id);
                              return next;
                            })
                          }
                        >
                          {openSolution.has(q.id) ? "Ẩn lời giải" : "Xem lời giải"}
                        </button>
                        {openSolution.has(q.id) && (
                          <div className="latex-preview">
                            <MathText text={q.solution_latex} />
                          </div>
                        )}
                      </>
                    )}

                    {isEditing ? (
                      <>
                        <RationaleRowsEditor
                          question={q}
                          drafts={drafts[q.id] ?? []}
                          labelOptions={labelOptions}
                          choiceCounts={it.choiceCounts}
                          disabled={saving}
                          onChange={(key, patch) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [q.id]: (prev[q.id] ?? []).map((d) => (d.option_key === key ? { ...d, ...patch } : d)),
                            }))
                          }
                        />
                        <div className="li-actions">
                          <button type="button" className="btn-primary" onClick={() => confirmOne(q.id)} disabled={saving}>
                            {batchIds.has(q.id) ? "Đang chờ AI..." : saving ? "Đang lưu..." : "Xác nhận"}
                          </button>
                          <button type="button" className="btn-link" onClick={() => aiOne(q.id)} disabled={aiOneIds.has(q.id) || saving}>
                            {aiOneIds.has(q.id) ? "AI đang soạn..." : "AI soạn nháp câu này"}
                          </button>
                          {labelOptions.length > 0 && (
                            <button type="button" className="btn-link" onClick={() => quickFill(q.id)} disabled={saving}>
                              Gợi ý nhanh
                            </button>
                          )}
                          {r.status === "verified" && (
                            <button
                              type="button"
                              className="btn-link"
                              onClick={() => {
                                setDrafts((prev) => ({ ...prev, [q.id]: initialDrafts(it) }));
                                setEditing((prev) => {
                                  const next = new Set(prev);
                                  next.delete(q.id);
                                  return next;
                                });
                              }}
                            >
                              Huỷ sửa
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="li-actions">
                        <span className="li-summary-line">
                          {draftsFromRows(q, it.rationale)
                            .map(
                              (d) =>
                                `${d.option_key}: ${d.error_type ? DISTRACTOR_ERROR_TYPE_LABELS[d.error_type] : "chưa chọn loại lỗi"}${d.pattern_label ? ` · ${d.pattern_label}` : ""}`,
                            )
                            .join("  |  ")}
                        </span>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setEditing((prev) => new Set(prev).add(q.id))}
                        >
                          Sửa
                        </button>
                      </div>
                    )}
                    {notes[q.id] && <p className="ai-hint">{notes[q.id]}</p>}
                  </div>
                );
              })}
            </div>
          )}
          {filtered.length > visibleCount && (
            <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={() => setVisibleCount((n) => n + PAGE)}>
              Xem thêm ({filtered.length - visibleCount} câu)
            </button>
          )}
        </>
      )}
    </div>
  );
}
