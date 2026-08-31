import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { MathText } from "../components/MathText";
import { TagPicker } from "../components/TagPicker";
import { AUTO_CANCEL_THRESHOLD } from "../lib/proctoring";
import type { ExamQuestionRow, ExamTag, QuestionRow, Topic } from "../lib/types";

/**
 * (Sửa 31/08/2026, theo yêu cầu Thầy Tường) Trang này giờ có 2 chế độ khác
 * nhau tuỳ isNew:
 * - TẠO MỚI thủ công (isNew, /giao-vien/de-thi/moi — hiện không còn nút vào
 *   thẳng từ đâu, chỉ còn truy cập qua URL, xem TeacherExamList.tsx): vẫn
 *   giữ nguyên giao diện chọn câu từ Ngân hàng câu hỏi như trước.
 * - SỬA đề đã có (!isNew): KHÔNG còn hiện toàn bộ ngân hàng câu hỏi + tick
 *   chọn nữa — chỉ hiện đúng các câu ĐANG CÓ trong đề đó (từ
 *   api.getExamQuestions), có nút "Xoá khỏi đề" cho từng câu. Không có cách
 *   thêm câu MỚI vào 1 đề đã tạo qua trang này (thêm câu mới giờ chỉ qua
 *   luồng AI import lúc tạo đề) — nếu cần thêm câu vào đề cũ, tạo lại đề qua
 *   "Tạo đề thi mới" (AI import).
 */

/** Chuyển 1 mốc ISO (lưu UTC trong CSDL) sang định dạng input datetime-local
 * (theo GIỜ ĐỊA PHƯƠNG của trình duyệt) để hiện đúng giờ giáo viên đã chọn. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TeacherExamEditor() {
  const { examId } = useParams<{ examId?: string }>();
  const isNew = !examId || examId === "moi";
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [termId, setTermId] = useState<string | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [driveLink, setDriveLink] = useState("");
  const [mode, setMode] = useState<"thoai_mai" | "nghiem_tuc">("thoai_mai");
  const [assignEnabled, setAssignEnabled] = useState(false);
  const [unlockAt, setUnlockAt] = useState("");
  const [lockAt, setLockAt] = useState("");
  // Tính điểm linh hoạt (Đợt 3, mục 2) — mặc định "chuan_thpt" giữ nguyên
  // hành vi cũ. "tuy_chinh" mở thêm 2 lựa chọn: tự động chia đều 10đ (không
  // cần nhập gì) hoặc thủ công (nhập điểm từng câu/từng ý bên dưới).
  const [scoringMode, setScoringMode] = useState<"chuan_thpt" | "tuy_chinh">("chuan_thpt");
  const [customScoringMethod, setCustomScoringMethod] = useState<"tu_dong" | "thu_cong" | null>(
    null,
  );
  const [customPoints, setCustomPoints] = useState<Record<string, string>>({});
  const [customPart2Points, setCustomPart2Points] = useState<
    Record<string, { a: string; b: string; c: string; d: string }>
  >({});
  const [folders, setFolders] = useState<ExamTag[]>([]);
  const [terms, setTerms] = useState<ExamTag[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuestionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Chỉ dùng khi !isNew (sửa đề đã có) — đúng các câu ĐANG thuộc đề này,
   * thay cho việc tick chọn từ toàn bộ ngân hàng (xem doc comment đầu file). */
  const [examQuestionRows, setExamQuestionRows] = useState<(ExamQuestionRow & { question: QuestionRow })[]>([]);
  // Làm mới giao diện (Nhóm 5, "quản lý lớp học", 28/08/2026 — demo đã duyệt):
  // thêm tìm kiếm + lọc theo chương cho ngân hàng câu hỏi — trước đây phải
  // cuộn qua toàn bộ danh sách mới tìm được câu cần. Không đổi logic chọn
  // câu (selected vẫn giữ nguyên id kể cả khi câu đang bị lọc khỏi tầm nhìn).
  const [qSearch, setQSearch] = useState("");
  const [qTopicFilter, setQTopicFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentExamId, setCurrentExamId] = useState<string | null>(
    isNew ? null : examId ?? null,
  );

  useEffect(() => {
    (async () => {
      // Chỉ tải TOÀN BỘ ngân hàng câu hỏi khi tạo mới thủ công (isNew) — sửa
      // đề đã có không cần, chỉ cần đúng các câu của riêng đề đó (tải ở
      // nhánh !isNew bên dưới), tránh tải thừa + tránh lẫn câu của đề khác.
      const [questions, folderTags, termTags, topicList] = await Promise.all([
        isNew ? api.listQuestions() : Promise.resolve([]),
        api.listExamTags("folder"),
        api.listExamTags("term"),
        api.listTopics(),
      ]);
      setAllQuestions(questions);
      setFolders(folderTags);
      setTerms(termTags);
      setTopics(topicList);
      if (!isNew && examId) {
        const [existing, examRow, examTopicIds] = await Promise.all([
          api.getExamQuestions(examId),
          api.getExam(examId),
          api.getExamTopicIds(examId),
        ]);
        setExamQuestionRows(existing);
        setSelectedTopicIds(new Set(examTopicIds));
        // Nạp lại điểm tuỳ chỉnh đã nhập trước đó (nếu có) cho từng câu.
        const cp: Record<string, string> = {};
        const cp2: Record<string, { a: string; b: string; c: string; d: string }> = {};
        for (const eq of existing) {
          if (eq.custom_points != null) cp[eq.question_id] = String(eq.custom_points);
          if (eq.custom_part2_points) {
            const p = eq.custom_part2_points;
            cp2[eq.question_id] = { a: String(p.a), b: String(p.b), c: String(p.c), d: String(p.d) };
          }
        }
        setCustomPoints(cp);
        setCustomPart2Points(cp2);
        if (examRow) {
          setTitle(examRow.title);
          setDescription(examRow.description ?? "");
          setDurationMinutes(
            examRow.duration_minutes ? String(examRow.duration_minutes) : "",
          );
          setGrade(examRow.grade ? String(examRow.grade) : "");
          setFolderId(examRow.folder_id);
          setTermId(examRow.term_id);
          setDriveLink(examRow.drive_link ?? "");
          setMode(examRow.mode);
          setAssignEnabled(!!examRow.assigned_unlock_at || !!examRow.assigned_lock_at);
          setUnlockAt(examRow.assigned_unlock_at ? toDatetimeLocalValue(examRow.assigned_unlock_at) : "");
          setLockAt(examRow.assigned_lock_at ? toDatetimeLocalValue(examRow.assigned_lock_at) : "");
          setScoringMode(examRow.scoring_mode);
          setCustomScoringMethod(examRow.custom_scoring_method);
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  function toggleTopic(id: string) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Chỉ dùng khi !isNew — bỏ 1 câu ra khỏi đề đang sửa (không xoá câu khỏi
   * ngân hàng, chỉ bỏ khỏi đề này). Có hiệu lực thật khi bấm "Lưu đề thi". */
  function handleRemoveFromExam(questionId: string) {
    setExamQuestionRows((prev) => prev.filter((eq) => eq.question_id !== questionId));
  }

  async function handleSave() {
    const questionCount = isNew ? selected.size : examQuestionRows.length;
    if (!profile || !title.trim() || questionCount === 0) {
      alert("Cần nhập tên đề và có ít nhất 1 câu hỏi.");
      return;
    }
    setSaving(true);
    try {
      const duration = durationMinutes.trim() ? Number(durationMinutes) : null;
      const gradeValue = grade ? (Number(grade) as 10 | 11 | 12) : null;
      const assignedUnlockAt = assignEnabled && unlockAt ? new Date(unlockAt).toISOString() : null;
      const assignedLockAt = assignEnabled && lockAt ? new Date(lockAt).toISOString() : null;
      let examIdToUse = currentExamId;
      if (!examIdToUse) {
        const created = await api.createExam({
          title: title.trim(),
          description: description.trim() || null,
          duration_minutes: duration,
          grade: gradeValue,
          folder_id: folderId,
          term_id: termId,
          drive_link: driveLink.trim() || null,
          mode,
          assigned_unlock_at: assignedUnlockAt,
          assigned_lock_at: assignedLockAt,
          scoring_mode: scoringMode,
          custom_scoring_method: scoringMode === "tuy_chinh" ? customScoringMethod : null,
          created_by: profile.id,
        });
        examIdToUse = created.id;
        setCurrentExamId(created.id);
      } else {
        await api.updateExam(examIdToUse, {
          title: title.trim(),
          description: description.trim() || null,
          duration_minutes: duration,
          grade: gradeValue,
          folder_id: folderId,
          term_id: termId,
          drive_link: driveLink.trim() || null,
          mode,
          assigned_unlock_at: assignedUnlockAt,
          assigned_lock_at: assignedLockAt,
          scoring_mode: scoringMode,
          custom_scoring_method: scoringMode === "tuy_chinh" ? customScoringMethod : null,
        });
      }

      const selectedQuestions: QuestionRow[] = isNew
        ? allQuestions.filter((q) => selected.has(q.id))
        : examQuestionRows.map((eq) => eq.question);
      const byPart: Record<1 | 2 | 3, QuestionRow[]> = { 1: [], 2: [], 3: [] };
      for (const q of selectedQuestions) byPart[q.part].push(q);

      // Điểm tuỳ chỉnh (Đợt 3) chỉ thực sự ghi khi đang ở chế độ tuỳ
      // chỉnh/thủ công — chế độ tự động không cần lưu gì (tính động lúc chấm
      // điểm dựa trên tổng số câu), chế độ chuẩn cũng không cần.
      const includeCustom = scoringMode === "tuy_chinh" && customScoringMethod === "thu_cong";
      const parsePoint = (raw: string | undefined): number | null =>
        raw && raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;
      const parsePart2 = (
        raw: { a: string; b: string; c: string; d: string } | undefined,
      ): { a: number; b: number; c: number; d: number } | null => {
        if (!raw) return null;
        const vals = [raw.a, raw.b, raw.c, raw.d].map((v) => parsePoint(v));
        if (vals.some((v) => v === null)) return null; // chưa nhập đủ 4 ý -> coi như chưa nhập
        return { a: vals[0]!, b: vals[1]!, c: vals[2]!, d: vals[3]! };
      };

      const examQuestions = [
        ...byPart[1].map((q, i) => ({
          question_id: q.id,
          order_index: i,
          part: 1 as const,
          ...(includeCustom ? { custom_points: parsePoint(customPoints[q.id]) } : {}),
        })),
        ...byPart[2].map((q, i) => ({
          question_id: q.id,
          order_index: i,
          part: 2 as const,
          ...(includeCustom
            ? {
                custom_part2_points: parsePart2(customPart2Points[q.id]),
                custom_points: parsePart2(customPart2Points[q.id])
                  ? null
                  : parsePoint(customPoints[q.id]),
              }
            : {}),
        })),
        ...byPart[3].map((q, i) => ({
          question_id: q.id,
          order_index: i,
          part: 3 as const,
          ...(includeCustom ? { custom_points: parsePoint(customPoints[q.id]) } : {}),
        })),
      ];

      await api.setExamQuestions(examIdToUse, examQuestions);
      await api.setExamTopics(examIdToUse, Array.from(selectedTopicIds));
      navigate("/giao-vien/de-thi");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  const questionsByPart = (part: 1 | 2 | 3) =>
    allQuestions
      .filter((q) => q.part === part)
      .filter((q) => !qTopicFilter || q.topic_id === qTopicFilter)
      .filter(
        (q) => !qSearch.trim() || q.content_latex.toLowerCase().includes(qSearch.trim().toLowerCase()),
      );
  /** Câu của đề đang sửa, theo từng Phần — chỉ dùng khi !isNew. */
  const examQuestionsByPart = (part: 1 | 2 | 3) => examQuestionRows.filter((eq) => eq.part === part);
  const summary = { 1: 0, 2: 0, 3: 0 };
  if (isNew) {
    for (const id of selected) {
      const q = allQuestions.find((x) => x.id === id);
      if (q) summary[q.part]++;
    }
  } else {
    for (const eq of examQuestionRows) summary[eq.part]++;
  }

  return (
    <div className="teacher-page">
      <h2>{isNew ? "Tạo đề thi mới" : "Chỉnh sửa đề thi"}</h2>

      <div className="hover-card section-card">
        <div className="section-card-head">
          <h3>Thông tin đề thi</h3>
        </div>
        <div className="field-grid">
          <div className="field field-span2">
            <label>Tên đề thi</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field field-span2">
            <label>Mô tả (không bắt buộc)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>Thời gian làm bài (phút, để trống = không giới hạn)</label>
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="vd: 90"
            />
          </div>
          <div className="field">
            <label>Khối (không bắt buộc — dùng để lọc ở Kho đề)</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">— Chọn khối —</option>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>
          </div>
        </div>
      </div>

      <div className="hover-card section-card">
        <div className="section-card-head">
          <h3>Lịch thi & chế độ tính điểm</h3>
        </div>
        <div className="field-grid">
          <div className="field">
            <label>Chế độ phòng thi</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "thoai_mai" | "nghiem_tuc")}>
              <option value="thoai_mai">Thoải mái — luyện tập bình thường</option>
              <option value="nghiem_tuc">
                Nghiêm túc — bắt buộc toàn màn hình, tự huỷ nếu rời trang quá {AUTO_CANCEL_THRESHOLD} lần
              </option>
            </select>
          </div>
          <div className="field">
            <label>Chế độ tính điểm</label>
            <select
              value={scoringMode}
              onChange={(e) => {
                const next = e.target.value as "chuan_thpt" | "tuy_chinh";
                setScoringMode(next);
                if (next === "tuy_chinh" && !customScoringMethod) setCustomScoringMethod("tu_dong");
              }}
            >
              <option value="chuan_thpt">Chuẩn THPT — barem chính thức (Phần 1/2/3)</option>
              <option value="tuy_chinh">Tuỳ chỉnh — cho đề không theo cấu trúc chuẩn (kiểm tra 15 phút...)</option>
            </select>
          </div>
          <div className="field field-span2">
            <label>
              <input
                type="checkbox"
                checked={assignEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAssignEnabled(checked);
                  // Mặc định chuyển sang nghiêm túc khi bật giao đề theo lịch —
                  // giáo viên vẫn có thể đổi lại ở ô chọn phía trên nếu muốn.
                  if (checked && mode === "thoai_mai") setMode("nghiem_tuc");
                }}
                style={{ marginRight: 8 }}
              />
              Giao đề theo lịch (mở khoá/khoá đúng giờ) — hiện nổi bật ở trang chủ học sinh
            </label>
          </div>
          {assignEnabled && (
            <>
              <div className="field">
                <label>Mở khoá lúc</label>
                <input type="datetime-local" value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)} />
              </div>
              <div className="field">
                <label>Khoá lúc (không bắt buộc — để trống = không tự khoá)</label>
                <input type="datetime-local" value={lockAt} onChange={(e) => setLockAt(e.target.value)} />
              </div>
            </>
          )}
          {scoringMode === "tuy_chinh" && (
            <div className="field field-span2">
              <label style={{ fontWeight: 400 }}>
                <input
                  type="radio"
                  name="customScoringMethod"
                  checked={customScoringMethod === "tu_dong"}
                  onChange={() => setCustomScoringMethod("tu_dong")}
                  style={{ marginRight: 6 }}
                />
                Tự động chia đều 10 điểm theo số câu
              </label>
              {customScoringMethod === "tu_dong" && (
                <p className="empty-hint" style={{ marginLeft: 22 }}>
                  {selected.size > 0
                    ? `Mỗi câu tự động được ${(Math.round((10 / selected.size) * 100) / 100).toFixed(2)} điểm (10đ / ${selected.size} câu).`
                    : "Chọn câu hỏi bên dưới để xem điểm mỗi câu."}
                </p>
              )}
              <label style={{ display: "block", marginTop: 8, fontWeight: 400 }}>
                <input
                  type="radio"
                  name="customScoringMethod"
                  checked={customScoringMethod === "thu_cong"}
                  onChange={() => setCustomScoringMethod("thu_cong")}
                  style={{ marginRight: 6 }}
                />
                Thủ công — tự nhập điểm từng câu (Phần 2 nhập riêng từng ý)
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="hover-card section-card">
        <div className="section-card-head">
          <h3>Chương & phân loại</h3>
        </div>
        <div className="field-grid">
          <div className="field">
            <label>Chương trình / kỳ thi (không bắt buộc)</label>
            <TagPicker
              kind="term"
              label="Chương trình"
              tags={terms}
              value={termId}
              onChange={setTermId}
              onCreated={(t) => setTerms((prev) => [...prev, t])}
              createdBy={profile?.id ?? ""}
              placeholder="— Chọn chương trình —"
            />
          </div>
          <div className="field">
            <label>Thư mục / tuyển tập (không bắt buộc)</label>
            <TagPicker
              kind="folder"
              label="Thư mục"
              tags={folders}
              value={folderId}
              onChange={setFolderId}
              onCreated={(t) => setFolders((prev) => [...prev, t])}
              createdBy={profile?.id ?? ""}
              placeholder="— Chọn thư mục —"
            />
          </div>
          <div className="field field-span2">
            <label>Chương mà đề này bao phủ (không bắt buộc — có thể chọn nhiều, dùng để lọc ở Kho đề)</label>
            <div className="pickable-list" style={{ maxHeight: 180, overflowY: "auto" }}>
              {topics.length === 0 && <p className="empty-hint">Chưa có chương nào trong khung kiến thức.</p>}
              {topics.map((t) => (
                <label key={t.id} className="pickable-item">
                  <input
                    type="checkbox"
                    checked={selectedTopicIds.has(t.id)}
                    onChange={() => toggleTopic(t.id)}
                  />
                  Lớp {t.grade} · {t.name}
                </label>
              ))}
            </div>
          </div>
          <div className="field field-span2">
            <label>Link Google Drive chứa file đề gốc (không bắt buộc — để học sinh tải về)</label>
            <input
              type="url"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </div>
        </div>
      </div>

      <p className="exam-summary">
        Đã chọn: {summary[1]} câu Phần 1 · {summary[2]} câu Phần 2 · {summary[3]} câu Phần 3
      </p>

      {isNew && (
        <>
          <div className="qbank-toolbar">
            <input
              type="text"
              value={qSearch}
              onChange={(e) => setQSearch(e.target.value)}
              placeholder="Tìm câu hỏi theo nội dung..."
            />
            <select value={qTopicFilter} onChange={(e) => setQTopicFilter(e.target.value)}>
              <option value="">Tất cả chương</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  Lớp {t.grade} · {t.name}
                </option>
              ))}
            </select>
          </div>
          {(qSearch.trim() || qTopicFilter) && (
            <p className="qbank-more-hint">
              Đang lọc ngân hàng câu hỏi — câu đã chọn trước đó vẫn được giữ dù đang bị ẩn khỏi danh sách.
            </p>
          )}

          {([1, 2, 3] as const).map((part) => (
            <section key={part}>
              <h3 className="part-title">Phần {part}</h3>
              {questionsByPart(part).length === 0 && (
                <p className="empty-hint">
                  {qSearch.trim() || qTopicFilter
                    ? "Không có câu nào khớp với bộ lọc hiện tại."
                    : `Chưa có câu hỏi Phần ${part} trong ngân hàng.`}
                </p>
              )}
              <div className="pickable-list">
                {questionsByPart(part).map((q) => {
                  const showCustomInput =
                    scoringMode === "tuy_chinh" && customScoringMethod === "thu_cong" && selected.has(q.id);
                  return (
                    <div key={q.id} className="pickable-item">
                      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={selected.has(q.id)}
                          onChange={() => toggle(q.id)}
                        />
                        <MathText text={q.content_latex} />
                      </label>
                      {showCustomInput && part !== 2 && (
                        <input
                          type="number"
                          step="0.05"
                          min={0}
                          placeholder="Điểm"
                          value={customPoints[q.id] ?? ""}
                          onChange={(e) =>
                            setCustomPoints((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          style={{ maxWidth: 90 }}
                        />
                      )}
                      {showCustomInput && part === 2 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(["a", "b", "c", "d"] as const).map((k) => (
                            <input
                              key={k}
                              type="number"
                              step="0.05"
                              min={0}
                              placeholder={k}
                              value={customPart2Points[q.id]?.[k] ?? ""}
                              onChange={(e) =>
                                setCustomPart2Points((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    a: prev[q.id]?.a ?? "",
                                    b: prev[q.id]?.b ?? "",
                                    c: prev[q.id]?.c ?? "",
                                    d: prev[q.id]?.d ?? "",
                                    [k]: e.target.value,
                                  },
                                }))
                              }
                              style={{ maxWidth: 60 }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {!isNew && (
        <>
          <p className="empty-hint">
            Chỉ hiện đúng các câu đang thuộc đề này. Muốn thêm câu mới vào đề, tạo lại đề qua
            "Tạo đề thi mới" (nạp từ file). Xoá 1 câu ở đây rồi bấm "Lưu đề thi" để có hiệu lực.
          </p>
          {([1, 2, 3] as const).map((part) => (
            <section key={part}>
              <h3 className="part-title">Phần {part}</h3>
              {examQuestionsByPart(part).length === 0 && (
                <p className="empty-hint">Đề này chưa có câu hỏi Phần {part}.</p>
              )}
              <div className="pickable-list">
                {examQuestionsByPart(part).map((eq) => {
                  const q = eq.question;
                  const showCustomInput = scoringMode === "tuy_chinh" && customScoringMethod === "thu_cong";
                  return (
                    <div key={q.id} className="pickable-item">
                      <div style={{ flex: 1 }}>
                        <MathText text={q.content_latex} />
                      </div>
                      {showCustomInput && part !== 2 && (
                        <input
                          type="number"
                          step="0.05"
                          min={0}
                          placeholder="Điểm"
                          value={customPoints[q.id] ?? ""}
                          onChange={(e) =>
                            setCustomPoints((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          style={{ maxWidth: 90 }}
                        />
                      )}
                      {showCustomInput && part === 2 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(["a", "b", "c", "d"] as const).map((k) => (
                            <input
                              key={k}
                              type="number"
                              step="0.05"
                              min={0}
                              placeholder={k}
                              value={customPart2Points[q.id]?.[k] ?? ""}
                              onChange={(e) =>
                                setCustomPart2Points((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    a: prev[q.id]?.a ?? "",
                                    b: prev[q.id]?.b ?? "",
                                    c: prev[q.id]?.c ?? "",
                                    d: prev[q.id]?.d ?? "",
                                    [k]: e.target.value,
                                  },
                                }))
                              }
                              style={{ maxWidth: 60 }}
                            />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn-link btn-danger"
                        onClick={() => handleRemoveFromExam(q.id)}
                      >
                        Xoá khỏi đề
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <div className="hover-card sticky-footer">
        <div className="sticky-footer-info">
          Đã chọn: {summary[1]} câu Phần 1 · {summary[2]} câu Phần 2 · {summary[3]} câu Phần 3
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu đề thi"}
        </button>
      </div>
    </div>
  );
}
