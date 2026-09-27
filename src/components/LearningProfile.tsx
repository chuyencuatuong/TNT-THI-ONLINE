import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as api from "../lib/api";
import { MASTERY_COLOR, MASTERY_LABELS, TREND_DIRECTION_LABEL } from "../lib/diagnosis";
import { ERROR_TYPE_COLOR, ERROR_TYPE_SHORT_LABELS } from "../lib/errorIntelligence";
import { buildLessonEvidence, type PrereqEdge } from "../lib/knowledgeGraph";
import {
  buildLearningProfile,
  computeMasteryDelta,
  type LearningProfile as Profile,
  type ProfileAudience,
  type ProfileNode,
  type ProgressStoryItem,
  type TimelineGranularity,
} from "../lib/learningState";
import { DIFFICULTY_LABELS } from "../lib/types";
import { RootCauseTree } from "./RootCauseTree";

function pct(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

function ProgressList({ items }: { items: ProgressStoryItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="li-rows">
      {items.map((p) => (
        <p key={p.patternLabel} className={`li-narrative ${p.kind === "tang" ? "li-narrative--warn" : ""}`}>
          {p.narrative}
        </p>
      ))}
    </div>
  );
}

function NodeRow({ node, open, onClick }: { node: ProfileNode; open: boolean; onClick: () => void }) {
  const ratio = node.sampleCount > 0 ? node.mastery.avgScoreRatio : null;
  return (
    <button type="button" className={`li-node ${open ? "li-node--open" : ""}`} onClick={onClick} aria-expanded={open}>
      <span className="li-node-name">
        {node.name}
        <span className="li-row-count">
          {node.sampleCount} câu · {TREND_DIRECTION_LABEL[node.trend.direction]}
          {node.trend.isRecurring ? " · lỗi lặp lại ở 2 lần gần nhất" : ""}
        </span>
      </span>
      <span className="li-bar" aria-hidden>
        <span
          className="li-bar-fill"
          style={{ display: "block", width: `${(ratio ?? 0) * 100}%`, background: MASTERY_COLOR[node.mastery.label] }}
        />
      </span>
      <span className="li-node-pct">{pct(ratio)}</span>
      <span className="diagnosis-badge" style={{ background: MASTERY_COLOR[node.mastery.label] }}>
        {MASTERY_LABELS[node.mastery.label]}
      </span>
    </button>
  );
}

/** Phần "giải trình" khi bấm vào 1 Chương/Bài: Bloom, nhận định, loại lỗi, lỗi lặp lại, tiến bộ. */
function DrillDown({ node }: { node: ProfileNode }) {
  const unclassified = node.errorDna.find((c) => c.errorType === "unclassified")?.count ?? 0;
  const totalErrors = node.errorDna.reduce((s, c) => s + c.count, 0);
  return (
    <>
      <div>
        <p className="li-subtitle">Độ chính xác theo mức độ tư duy</p>
        <div className="li-bloom">
          {node.bloom.map((b) => (
            <div key={b.difficulty} className="li-bloom-cell" style={{ borderTopColor: MASTERY_COLOR[b.label] }}>
              <div className="li-bloom-value">{pct(b.accuracy)}</div>
              <div className="li-bloom-label">
                {DIFFICULTY_LABELS[b.difficulty]} · {b.sampleCount} câu
              </div>
            </div>
          ))}
        </div>
      </div>
      {node.insight && <p className="li-narrative">{node.insight}</p>}
      {totalErrors > 0 && (
        <div>
          <p className="li-subtitle">Các lỗi đã mắc ({totalErrors} câu sai)</p>
          <div className="li-chips">
            {node.errorDna.map((c) => (
              <span key={c.errorType} className="li-chip" style={{ ["--li-chip-color" as string]: ERROR_TYPE_COLOR[c.errorType] }}>
                <strong>{ERROR_TYPE_SHORT_LABELS[c.errorType]}</strong> {c.count}
                {c.patternLabels.length > 0 &&
                  ` · ${c.patternLabels.map((p) => `${p.label} ×${p.count}`).join(", ")}`}
              </span>
            ))}
          </div>
          {unclassified > 0 && (
            <p className="li-summary-line">
              {unclassified} câu sai chưa xác định được loại lỗi (phương án đã chọn chưa được thầy gắn nhãn, hoặc câu
              Phần 2/3).
            </p>
          )}
        </div>
      )}
      {node.recurring.length > 0 && (
        <div>
          <p className="li-subtitle">Lỗi lặp lại qua nhiều đề</p>
          {node.recurring.map((r) => (
            <p key={r.patternLabel} className="li-narrative li-narrative--warn">
              "{r.patternLabel}" — {r.totalCount} lần trên {r.distinctExamCount} đề khác nhau (gần nhất{" "}
              {new Date(r.lastOccurredAt).toLocaleDateString("vi-VN")}).
            </p>
          ))}
        </div>
      )}
      {node.progress.length > 0 && (
        <div>
          <p className="li-subtitle">Tiến bộ theo lỗi cụ thể</p>
          <ProgressList items={node.progress} />
        </div>
      )}
    </>
  );
}

/**
 * Hồ sơ năng lực giải trình được (Module 2) — dùng chung cho học sinh
 * (/hoc-sinh/ho-so-nang-luc) và giáo viên (TeacherStudentDetail). Trung tâm là
 * hồ sơ theo Chương -> Bài, KHÔNG có điểm tổng hợp kiểu "78/100".
 */
export function LearningProfile({ studentId, audience }: { studentId: string; audience: ProfileAudience }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [instancesByLesson, setInstancesByLesson] = useState<ReturnType<typeof buildLessonEvidence>>(new Map());
  const [edges, setEdges] = useState<PrereqEdge[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [lessonNames, setLessonNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<TimelineGranularity>("week");

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
    Promise.all([api.getStudentLearningBundle(studentId), api.listSkillPrerequisites(), api.listLessons()])
      .then(([bundle, prereq, lessons]) => {
        if (cancelled) return;
        const p = buildLearningProfile(bundle.facts, bundle.instances, {
          now: new Date(),
          audience,
          patternQuestions: bundle.patternQuestions,
        });
        setProfile(p);
        setEdges(prereq.edges);
        setTableMissing(prereq.tableMissing);
        setLessonNames(new Map(lessons.map((l) => [l.id, l.name])));
        setInstancesByLesson(
          buildLessonEvidence(
            p.topics.flatMap((t) => t.lessons).map((l) => ({ lessonId: l.id, name: l.name, diagnosis: l.mastery })),
            bundle.instances,
          ),
        );
      })
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [studentId, audience]);

  const timeline = useMemo(
    () => (profile ? (granularity === "week" ? profile.weekly : profile.monthly) : []),
    [profile, granularity],
  );
  const delta = useMemo(() => computeMasteryDelta(timeline), [timeline]);

  if (error) return <p className="ai-hint">Không tải được hồ sơ năng lực: {error}</p>;
  if (!profile) return <p className="empty-hint">Đang tổng hợp hồ sơ năng lực...</p>;
  if (profile.totalQuestions === 0) {
    return <p className="empty-hint">Chưa có bài làm nào để lập hồ sơ năng lực.</p>;
  }

  const who = audience === "student" ? "Em" : "Học sinh";
  const periodWord = granularity === "week" ? "tuần" : "tháng";
  const chartData = timeline.map((b) => ({ name: b.label, accuracy: Math.round(b.accuracy * 100), n: b.sampleCount }));

  return (
    <div className="li-rows" style={{ gap: 20 }}>
      <p className="empty-hint" style={{ margin: 0 }}>
        Dựa trên {profile.totalQuestions} câu trong {profile.totalAttempts} lượt làm bài. Mọi nhận định đều kèm số liệu
        để kiểm chứng — đây là gợi ý hướng ôn tập, không phải kết luận cuối cùng.
      </p>

      <section>
        <h3>Câu chuyện tiến bộ</h3>
        <div className="li-toolbar">
          <span className="li-summary-line">Độ chính xác theo</span>
          {(["week", "month"] as TimelineGranularity[]).map((g) => (
            <button
              key={g}
              type="button"
              className={g === granularity ? "btn-primary" : "btn-secondary"}
              onClick={() => setGranularity(g)}
            >
              {g === "week" ? "Tuần" : "Tháng"}
            </button>
          ))}
        </div>
        {delta ? (
          <p className={`li-narrative ${delta.deltaPoints < 0 ? "li-narrative--warn" : ""}`}>
            {delta.latest.label}: {Math.round(delta.latest.accuracy * 100)}% ({delta.latest.sampleCount} câu) —{" "}
            {delta.deltaPoints > 0
              ? `tăng ${delta.deltaPoints} điểm %`
              : delta.deltaPoints < 0
                ? `giảm ${-delta.deltaPoints} điểm %`
                : "giữ nguyên"}{" "}
            so với {delta.previous.label} ({Math.round(delta.previous.accuracy * 100)}%, {delta.previous.sampleCount} câu).
          </p>
        ) : (
          <p className="li-summary-line">Cần ít nhất 2 {periodWord} có từ 2 câu trở lên để so sánh.</p>
        )}
        {chartData.length > 1 && (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ left: 0, right: 16, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis domain={[0, 100]} unit="%" fontSize={11} width={44} />
              <Tooltip formatter={(v: number, _n, item) => [`${v}% (${(item?.payload as { n: number }).n} câu)`, "Độ chính xác"]} />
              <Line type="monotone" dataKey="accuracy" stroke="#9c1420" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        )}
        {profile.progress.length > 0 ? (
          <ProgressList items={profile.progress} />
        ) : (
          <p className="li-summary-line">
            Chưa đủ dữ liệu để kể tiến bộ theo lỗi cụ thể (cần lỗi đã gắn nhãn xuất hiện ≥ 2 lần trong 3 tuần trước và{" "}
            {who.toLowerCase()} vẫn luyện phần đó trong 3 tuần gần đây).
          </p>
        )}
      </section>

      <section>
        <h3>Hồ sơ theo Chương</h3>
        <p className="li-summary-line">Bấm vào 1 Chương/Bài để xem vì sao — theo mức độ tư duy, loại lỗi, lỗi lặp lại.</p>
        <div className="li-node-list">
          {profile.topics.map((t) => {
            const open = openTopic === t.id;
            return (
              <div key={t.id}>
                <NodeRow
                  node={t}
                  open={open}
                  onClick={() => {
                    setOpenTopic(open ? null : t.id);
                    setOpenLesson(null);
                  }}
                />
                {open && (
                  <div className="li-drill">
                    <DrillDown node={t} />
                    {t.lessons.length > 0 && (
                      <div>
                        <p className="li-subtitle">Theo từng Bài</p>
                        <div className="li-node-list">
                          {t.lessons.map((l) => {
                            const lOpen = openLesson === l.id;
                            return (
                              <div key={l.id}>
                                <NodeRow node={l} open={lOpen} onClick={() => setOpenLesson(lOpen ? null : l.id)} />
                                {lOpen && (
                                  <div className="li-drill">
                                    <DrillDown node={l} />
                                    <div>
                                      <p className="li-subtitle">Bài nền tảng &amp; gốc rễ khả dĩ</p>
                                      <RootCauseTree
                                        lessonId={l.id}
                                        edges={edges}
                                        tableMissing={tableMissing}
                                        lessonNames={lessonNames}
                                        evidence={instancesByLesson}
                                        audience={audience}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
