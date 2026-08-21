import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { MathText } from "../components/MathText";
import type { QuestionRow } from "../lib/types";

export function TeacherExamEditor() {
  const { examId } = useParams<{ examId?: string }>();
  const isNew = !examId || examId === "moi";
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allQuestions, setAllQuestions] = useState<QuestionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentExamId, setCurrentExamId] = useState<string | null>(
    isNew ? null : examId ?? null,
  );

  useEffect(() => {
    (async () => {
      const questions = await api.listQuestions();
      setAllQuestions(questions);
      if (!isNew && examId) {
        const existing = await api.getExamQuestions(examId);
        setSelected(new Set(existing.map((e) => e.question_id)));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

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
      let examIdToUse = currentExamId;
      if (!examIdToUse) {
        const created = await api.createExam({
          title: title.trim(),
          description: description.trim() || null,
          created_by: profile.id,
        });
        examIdToUse = created.id;
        setCurrentExamId(created.id);
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
