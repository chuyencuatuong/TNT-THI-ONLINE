import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { suggestQuestionTopic } from "../lib/ai";
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
  const [filterTopic, setFilterTopic] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyProgress, setReclassifyProgress] = useState("");

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
  const topicNameOf = (id: string | null) => topics.find((t) => t.id === id)?.name ?? null;

  async function handleConfirmTopicSuggestion(q: QuestionRow) {
    if (!q.ai_suggested_topic_id) return;
    await api.updateQuestion(q.id, { topic_id: q.ai_suggested_topic_id });
    reloadQuestions();
  }

  async function handleDismissTopicSuggestion(q: QuestionRow) {
    await api.updateQuestion(q.id, { ai_suggested_topic_id: null });
    reloadQuestions();
  }

  /** Gợi ý chương bằng AI hàng loạt cho các câu chưa có chương — chỉ ghi ai_suggested_topic_id,
   * giáo viên xác nhận từng câu (đúng nguyên tắc "AI gợi ý, giáo viên duyệt"). */
  async function handleBulkReclassify() {
    const targets = questions.filter((q) => !q.topic_id);
    if (targets.length === 0) {
      alert("Tất cả câu hỏi đã có chương rồi.");
      return;
    }
    if (
      !confirm(
        `Nhờ AI gợi ý chương cho ${targets.length} câu chưa phân loại? Bạn vẫn cần xác nhận từng câu sau đó.`,
      )
    )
      return;
    setReclassifying(true);
    try {
      for (let i = 0; i < targets.length; i++) {
        setReclassifyProgress(`Đang xử lý câu ${i + 1}/${targets.length}...`);
        const q = targets[i];
        try {
          const result = await suggestQuestionTopic(q.content_latex, topics);
          if (result.topic_id) {
            await api.updateQuestion(q.id, { ai_suggested_topic_id: result.topic_id });
          }
        } catch (err) {
          console.error(`Lỗi gợi ý chương cho câu ${q.id}:`, err);
        }
      }
      await reloadQuestions();
    } finally {
      setReclassifying(false);
      setReclassifyProgress("");
    }
  }

  const filteredQuestions = questions.filter((q) => {
    if (filterTopic && q.topic_id !== filterTopic) return false;
    if (search.trim() && !q.content_latex.toLowerCase().includes(search.trim().toLowerCase()))
      return false;
    return true;
  });

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
        <input
          type="text"
          placeholder="Tìm trong nội dung câu hỏi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <label>Phần:</label>
        <select
          value={filterPart}
          onChange={(e) => setFilterPart(Number(e.target.value) as 0 | 1 | 2 | 3)}
        >
          <option value={0}>Tất cả</option>
          <option value={1}>Phần 1</option>
          <option value={2}>Phần 2</option>
          <option value={3}>Phần 3</option>
        </select>
        <label>Chương:</label>
        <select value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)}>
          <option value="">Tất cả</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleBulkReclassify}
          disabled={reclassifying}
        >
          {reclassifying ? reclassifyProgress || "Đang xử lý..." : "Phân loại lại chương bằng AI"}
        </button>
      </div>

      {loading ? (
        <div className="page-loading">Đang tải...</div>
      ) : filteredQuestions.length === 0 ? (
        <p className="empty-hint">
          {questions.length === 0
            ? 'Chưa có câu hỏi nào. Bấm "+ Thêm câu hỏi" để bắt đầu.'
            : "Không có câu nào khớp với bộ lọc/tìm kiếm hiện tại."}
        </p>
      ) : (
        <div className="question-list">
          {filteredQuestions.map((q) => {
            const suggestedName = topicNameOf(q.ai_suggested_topic_id);
            const showSuggestion =
              q.ai_suggested_topic_id && q.ai_suggested_topic_id !== q.topic_id;
            return (
              <div key={q.id} className="question-list-item">
                <div className="question-list-meta">
                  <span className="tag">Phần {q.part}</span>
                  {q.difficulty && (
                    <span className="tag tag--muted">{DIFFICULTY_LABELS[q.difficulty]}</span>
                  )}
                  <span className="tag tag--muted">{typeNameOf(q.question_type_id)}</span>
                  <span className="tag tag--muted">
                    {topicNameOf(q.topic_id) ?? "(chưa gán chương)"}
                  </span>
                  {q.source === "word_import" && (
                    <span className="tag tag--muted">Từ file Word</span>
                  )}
                </div>
                <MathText text={q.content_latex} />
                {showSuggestion && (
                  <p className="ai-hint">
                    AI gợi ý chương: "{suggestedName}".{" "}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => handleConfirmTopicSuggestion(q)}
                    >
                      Xác nhận
                    </button>{" "}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => handleDismissTopicSuggestion(q)}
                    >
                      Bỏ qua
                    </button>
                  </p>
                )}
                <button className="btn-link btn-danger" onClick={() => handleDelete(q.id)}>
                  Xoá
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
