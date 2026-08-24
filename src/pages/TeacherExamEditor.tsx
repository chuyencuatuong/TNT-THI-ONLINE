import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { MathText } from "../components/MathText";
import { TagPicker } from "../components/TagPicker";
import { AUTO_CANCEL_THRESHOLD } from "../lib/proctoring";
import type { ExamTag, QuestionRow, Topic } from "../lib/types";

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
  const [folders, setFolders] = useState<ExamTag[]>([]);
  const [terms, setTerms] = useState<ExamTag[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuestionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentExamId, setCurrentExamId] = useState<string | null>(
    isNew ? null : examId ?? null,
  );

  useEffect(() => {
    (async () => {
      const [questions, folderTags, termTags, topicList] = await Promise.all([
        api.listQuestions(),
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
        setSelected(new Set(existing.map((e) => e.question_id)));
        setSelectedTopicIds(new Set(examTopicIds));
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

  async function handleSave() {
    if (!profile || !title.trim() || selected.size === 0) {
      alert("Cần nhập tên đề và chọn ít nhất 1 câu hỏi.");
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
        });
      }

      const selectedQuestions = allQuestions.filter((q) => selected.has(q.id));
      const byPart: Record<1 | 2 | 3, QuestionRow[]> = { 1: [], 2: [], 3: [] };
      for (const q of selectedQuestions) byPart[q.part].push(q);

      const examQuestions = [
        ...byPart[1].map((q, i) => ({ question_id: q.id, order_index: i, part: 1 as const })),
        ...byPart[2].map((q, i) => ({ question_id: q.id, order_index: i, part: 2 as const })),
        ...byPart[3].map((q, i) => ({ question_id: q.id, order_index: i, part: 3 as const })),
      ];

      await api.setExamQuestions(examIdToUse, examQuestions);
      await api.setExamTopics(examIdToUse, Array.from(selectedTopicIds));
      navigate("/giao-vien/de-thi");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  const questionsByPart = (part: 1 | 2 | 3) => allQuestions.filter((q) => q.part === part);
  const summary = { 1: 0, 2: 0, 3: 0 };
  for (const id of selected) {
    const q = allQuestions.find((x) => x.id === id);
    if (q) summary[q.part]++;
  }

  return (
    <div className="teacher-page">
      <h2>{isNew ? "Tạo đề thi mới" : "Chỉnh sửa đề thi"}</h2>

      <div className="form-row">
        <label>Tên đề thi</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="form-row">
        <label>Mô tả (không bắt buộc)</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Thời gian làm bài (phút, để trống = không giới hạn)</label>
        <input
          type="number"
          min={1}
          style={{ maxWidth: 140 }}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          placeholder="vd: 90"
        />
      </div>
      <div className="form-row">
        <label>Khối (không bắt buộc — dùng để lọc ở Kho đề)</label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="">— Chọn khối —</option>
          <option value="10">Lớp 10</option>
          <option value="11">Lớp 11</option>
          <option value="12">Lớp 12</option>
        </select>
      </div>
      <div className="form-row">
        <label>Chương trình / kỳ thi (không bắt buộc — VD: Giữa kỳ 1, Luyện đề tổng ôn...)</label>
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
      <div className="form-row">
        <label>Thư mục / tuyển tập (không bắt buộc — để trống = "Chưa phân loại")</label>
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
      <div className="form-row">
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
      <div className="form-row">
        <label>Link Google Drive chứa file đề gốc (không bắt buộc — để học sinh tải về)</label>
        <input
          type="url"
          value={driveLink}
          onChange={(e) => setDriveLink(e.target.value)}
          placeholder="https://drive.google.com/..."
        />
      </div>

      <div className="form-row">
        <label>Chế độ phòng thi</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "thoai_mai" | "nghiem_tuc")}
          style={{ maxWidth: 280 }}
        >
          <option value="thoai_mai">Thoải mái — luyện tập bình thường</option>
          <option value="nghiem_tuc">
            Nghiêm túc — bắt buộc toàn màn hình, tự huỷ nếu rời trang quá {AUTO_CANCEL_THRESHOLD} lần
          </option>
        </select>
      </div>

      <div className="form-row">
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
        <div className="form-row" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <label>Mở khoá lúc</label>
            <input
              type="datetime-local"
              value={unlockAt}
              onChange={(e) => setUnlockAt(e.target.value)}
            />
          </div>
          <div>
            <label>Khoá lúc (không bắt buộc — để trống = không tự khoá)</label>
            <input
              type="datetime-local"
              value={lockAt}
              onChange={(e) => setLockAt(e.target.value)}
            />
          </div>
        </div>
      )}

      <p className="exam-summary">
        Đã chọn: {summary[1]} câu Phần 1 · {summary[2]} câu Phần 2 · {summary[3]} câu Phần 3
      </p>

      {([1, 2, 3] as const).map((part) => (
        <section key={part}>
          <h3 className="part-title">Phần {part}</h3>
          {questionsByPart(part).length === 0 && (
            <p className="empty-hint">
              Chưa có câu hỏi Phần {part} trong ngân hàng. Vào "Ngân hàng câu hỏi" để thêm.
            </p>
          )}
          <div className="pickable-list">
            {questionsByPart(part).map((q) => (
              <label key={q.id} className="pickable-item">
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  onChange={() => toggle(q.id)}
                />
                <MathText text={q.content_latex} />
              </label>
            ))}
          </div>
        </section>
      ))}

      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? "Đang lưu..." : "Lưu đề thi"}
      </button>
    </div>
  );
}
