import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { MathText } from "../components/MathText";
import { QuestionEditorForm } from "../components/QuestionEditorForm";
import { DIFFICULTY_LABELS } from "../lib/types";
import type { QuestionRow, QuestionType, Topic } from "../lib/types";

export function TeacherQuestionBank() {
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterPart, setFilterPart] = useState<0 | 1 | 2 | 3>(0);
  const [loading, setLoading] = useState(true);

  async function reloadQuestions() {
    const data = await api.listQuestions(
      filterPart ? { part: filterPart as 1 | 2 | 3 } : undefined,
    );
    setQuestions(data);
  }

  async function reloadTopics() {
    setTopics(await api.listTopics());
  }

  async function reloadQuestionTypes() {
    setQuestionTypes(await api.listQuestionTypes());
  }

  useEffect(() => {
    Promise.all([reloadQuestions(), reloadTopics(), reloadQuestionTypes()]).then(() =>
      setLoading(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPart]);

  async function handleDelete(id: string) {
    if (!confirm("Xoá câu hỏi này khỏi ngân hàng?")) return;
    await api.deleteQuestion(id);
    reloadQuestions();
  }

  const typeNameOf = (id: string | null) =>
    questionTypes.find((t) => t.id === id)?.name ?? "(chưa gán dạng bài)";

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <h2>Ngân hàng câu hỏi</h2>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Đóng form" : "+ Thêm câu hỏi"}
        </button>
      </div>

      {showForm && (
        <QuestionEditorForm
          topics={topics}
          questionTypes={questionTypes}
          onCreated={reloadQuestions}
          onTopicsChanged={reloadTopics}
          onQuestionTypesChanged={reloadQuestionTypes}
        />
      )}

      <div className="filter-row">
        <label>Lọc theo phần:</label>
        <select
          value={filterPart}
          onChange={(e) => setFilterPart(Number(e.target.value) as 0 | 1 | 2 | 3)}
        >
          <option value={0}>Tất cả</option>
          <option value={1}>Phần 1</option>
          <option value={2}>Phần 2</option>
          <option value={3}>Phần 3</option>
        </select>
      </div>

      {loading ? (
        <div className="page-loading">Đang tải...</div>
      ) : questions.length === 0 ? (
        <p className="empty-hint">Chưa có câu hỏi nào. Bấm "+ Thêm câu hỏi" để bắt đầu.</p>
      ) : (
        <div className="question-list">
          {questions.map((q) => (
            <div key={q.id} className="question-list-item">
              <div className="question-list-meta">
                <span className="tag">Phần {q.part}</span>
                {q.difficulty && (
                  <span className="tag tag--muted">{DIFFICULTY_LABELS[q.difficulty]}</span>
                )}
                <span className="tag tag--muted">{typeNameOf(q.question_type_id)}</span>
                {q.source === "word_import" && (
                  <span className="tag tag--muted">Từ file Word</span>
                )}
              </div>
              <MathText text={q.content_latex} />
              <button className="btn-link btn-danger" onClick={() => handleDelete(q.id)}>
                Xoá
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
