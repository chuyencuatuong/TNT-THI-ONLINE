import { useState } from "react";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { suggestQuestionLesson, suggestQuestionTopic } from "../lib/ai";
import { MathText } from "./MathText";
import { ImageUploadField } from "./ImageUploadField";
import type { Difficulty, Lesson, Topic } from "../lib/types";
import { DIFFICULTY_LABELS } from "../lib/types";

const DIFFICULTIES: Difficulty[] = [
  "nhan_biet",
  "thong_hieu",
  "van_dung",
  "van_dung_cao",
];

export function QuestionEditorForm({
  topics,
  lessons,
  onCreated,
  onTopicsChanged,
  onLessonsChanged,
}: {
  topics: Topic[];
  lessons: Lesson[];
  onCreated: () => void;
  onTopicsChanged: () => void;
  onLessonsChanged: () => void;
}) {
  const { profile } = useAuth();
  const [part, setPart] = useState<1 | 2 | 3>(1);
  const [content, setContent] = useState("");
  const [solution, setSolution] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("thong_hieu");
  const [lessonId, setLessonId] = useState<string>("");
  const [topicId, setTopicId] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiTopicLoading, setAiTopicLoading] = useState(false);
  const [aiTopicSuggestion, setAiTopicSuggestion] = useState<string | null>(null);
  const [aiTopicSuggestedId, setAiTopicSuggestedId] = useState<string | null>(null);

  // Phần 1
  const [choices, setChoices] = useState({ A: "", B: "", C: "", D: "" });
  const [correctChoice, setCorrectChoice] = useState<"A" | "B" | "C" | "D">("A");

  // Phần 2
  const [items, setItems] = useState({ a: "", b: "", c: "", d: "" });
  const [correctItems, setCorrectItems] = useState({
    a: true,
    b: true,
    c: true,
    d: true,
  });

  // Phần 3
  const [shortAnswer, setShortAnswer] = useState("");
  const [points, setPoints] = useState(0.5);

  // Thêm nhanh chủ đề / Bài mới
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicGrade, setNewTopicGrade] = useState<10 | 11 | 12>(12);
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [newLessonName, setNewLessonName] = useState("");
  const [newLessonTopicId, setNewLessonTopicId] = useState("");

  async function handleAddTopic() {
    if (!newTopicName.trim()) return;
    await api.createTopic({
      name: newTopicName.trim(),
      chapter: null,
      grade: newTopicGrade,
    });
    setNewTopicName("");
    setShowNewTopic(false);
    onTopicsChanged();
  }

  async function handleAddLesson() {
    if (!newLessonName.trim() || !newLessonTopicId) return;
    const created = await api.createLesson({
      topic_id: newLessonTopicId,
      name: newLessonName.trim(),
      description: null,
    });
    setNewLessonName("");
    setShowNewLesson(false);
    onLessonsChanged();
    setLessonId(created.id);
  }

  async function handleAiSuggest() {
    if (!content.trim()) return;
    setAiLoading(true);
    setAiSuggestion(null);
    const result = await suggestQuestionLesson(content, lessons);
    setAiLoading(false);
    if (result.lesson_id) {
      setAiSuggestion(`AI gợi ý: "${result.lesson_name}" — ${result.reasoning}`);
    } else {
      setAiSuggestion(`AI chưa chắc chắn: ${result.reasoning}`);
    }
  }

  function applyAiSuggestion(lessonIdValue: string) {
    setLessonId(lessonIdValue);
  }

  async function handleAiTopicSuggest() {
    if (!content.trim()) return;
    setAiTopicLoading(true);
    setAiTopicSuggestion(null);
    setAiTopicSuggestedId(null);
    const result = await suggestQuestionTopic(content, topics);
    setAiTopicLoading(false);
    if (result.topic_id) {
      setAiTopicSuggestion(`AI gợi ý: "${result.topic_name}" — ${result.reasoning}`);
      setAiTopicSuggestedId(result.topic_id);
    } else {
      setAiTopicSuggestion(`AI chưa chắc chắn: ${result.reasoning}`);
    }
  }

  function applyAiTopicSuggestion(topicIdValue: string) {
    setTopicId(topicIdValue);
  }

  function resetForm() {
    setContent("");
    setSolution("");
    setChoices({ A: "", B: "", C: "", D: "" });
    setItems({ a: "", b: "", c: "", d: "" });
    setShortAnswer("");
    setAiSuggestion(null);
    setAiTopicSuggestion(null);
    setAiTopicSuggestedId(null);
    setTopicId("");
    setImageUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      let options: unknown = {};
      let correctAnswer: unknown = {};
      let defaultPoints: number | null = null;

      if (part === 1) {
        options = { choices };
        correctAnswer = { choice: correctChoice };
      } else if (part === 2) {
        options = { items };
        correctAnswer = correctItems;
      } else {
        correctAnswer = { value: shortAnswer };
        defaultPoints = points;
      }

      await api.createQuestion({
        part,
        lesson_id: lessonId || null,
        topic_id: topicId || null,
        ai_suggested_topic_id: aiTopicSuggestedId,
        difficulty,
        content_latex: content,
        image_url: imageUrl,
        options,
        correct_answer: correctAnswer,
        solution_latex: solution.trim() || null,
        default_points: defaultPoints,
        ai_suggested_lesson_id: null,
        created_by: profile.id,
      });
      resetForm();
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="question-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>Phần</label>
        <select value={part} onChange={(e) => setPart(Number(e.target.value) as 1 | 2 | 3)}>
          <option value={1}>Phần 1 — Trắc nghiệm 4 phương án</option>
          <option value={2}>Phần 2 — Đúng/sai (4 ý)</option>
          <option value={3}>Phần 3 — Trả lời ngắn</option>
        </select>
      </div>

      <div className="form-row">
        <label>Nội dung câu hỏi (dùng $...$ cho công thức)</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Ví dụ: Giải phương trình $x^2 - 5x + 6 = 0$."
          required
        />
        {content && (
          <div className="latex-preview">
            <MathText text={content} />
          </div>
        )}
      </div>

      <div className="form-row">
        <label>Hình minh hoạ (bảng biến thiên, đồ thị... — không bắt buộc)</label>
        <ImageUploadField value={imageUrl} onChange={setImageUrl} />
      </div>

      <div className="form-row">
        <label>Lời giải chi tiết (không bắt buộc — chỉ hiện cho học sinh SAU khi nộp bài)</label>
        <textarea
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          rows={3}
          placeholder="Các bước giải, dùng $...$ cho công thức."
        />
        {solution && (
          <div className="latex-preview">
            <MathText text={solution} />
          </div>
        )}
      </div>

      {part === 1 && (
        <div className="form-row">
          <label>4 phương án (chọn phương án đúng)</label>
          {(["A", "B", "C", "D"] as const).map((c) => (
            <div key={c} className="option-row">
              <input
                type="radio"
                checked={correctChoice === c}
                onChange={() => setCorrectChoice(c)}
              />
              <span>{c}</span>
              <input
                type="text"
                value={choices[c]}
                onChange={(e) => setChoices({ ...choices, [c]: e.target.value })}
                placeholder={`Nội dung phương án ${c}`}
                required
              />
            </div>
          ))}
        </div>
      )}

      {part === 2 && (
        <div className="form-row">
          <label>4 ý (đánh dấu Đúng/Sai cho từng ý)</label>
          {(["a", "b", "c", "d"] as const).map((k) => (
            <div key={k} className="option-row">
              <input
                type="text"
                value={items[k]}
                onChange={(e) => setItems({ ...items, [k]: e.target.value })}
                placeholder={`Nội dung ý ${k}`}
                required
              />
              <label className="inline-choice">
                <input
                  type="radio"
                  name={`correct-${k}`}
                  checked={correctItems[k] === true}
                  onChange={() => setCorrectItems({ ...correctItems, [k]: true })}
                />
                Đúng
              </label>
              <label className="inline-choice">
                <input
                  type="radio"
                  name={`correct-${k}`}
                  checked={correctItems[k] === false}
                  onChange={() => setCorrectItems({ ...correctItems, [k]: false })}
                />
                Sai
              </label>
            </div>
          ))}
        </div>
      )}

      {part === 3 && (
        <div className="form-row">
          <label>Đáp án đúng & thang điểm</label>
          <div className="option-row">
            <input
              type="text"
              value={shortAnswer}
              onChange={(e) => setShortAnswer(e.target.value)}
              placeholder="Đáp án (số hoặc chuỗi ngắn)"
              required
            />
            <input
              type="number"
              step="0.05"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              style={{ width: 90 }}
            />
            <span>điểm</span>
          </div>
        </div>
      )}

      <div className="form-row">
        <label>Mức độ tư duy</label>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>Chương</label>
        <div className="option-row">
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">-- Chưa gán --</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (Lớp {t.grade})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAiTopicSuggest}
            disabled={aiTopicLoading || !content.trim()}
          >
            {aiTopicLoading ? "Đang hỏi AI..." : "Gợi ý bằng AI"}
          </button>
        </div>
        {aiTopicSuggestion && (
          <p className="ai-hint">
            {aiTopicSuggestion}
            {aiTopicSuggestedId && aiTopicSuggestedId !== topicId && (
              <>
                {" "}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => applyAiTopicSuggestion(aiTopicSuggestedId)}
                >
                  Dùng gợi ý này
                </button>
              </>
            )}
          </p>
        )}
      </div>

      <div className="form-row">
        <label>Bài</label>
        <div className="option-row">
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">-- Chưa gán --</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => setShowNewLesson((s) => !s)}>
            + Bài mới
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAiSuggest}
            disabled={aiLoading || !content.trim()}
          >
            {aiLoading ? "Đang hỏi AI..." : "Gợi ý bằng AI"}
          </button>
        </div>
        {aiSuggestion && <p className="ai-hint">{aiSuggestion}</p>}
      </div>

      {showNewLesson && (
        <div className="inline-create-box">
          <select value={newLessonTopicId} onChange={(e) => setNewLessonTopicId(e.target.value)}>
            <option value="">-- Chọn chủ đề --</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (Lớp {t.grade})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newLessonName}
            onChange={(e) => setNewLessonName(e.target.value)}
            placeholder="Tên Bài mới"
          />
          <button type="button" className="btn-secondary" onClick={() => setShowNewTopic((s) => !s)}>
            + Chủ đề mới
          </button>
          <button type="button" className="btn-primary" onClick={handleAddLesson}>
            Lưu Bài
          </button>
        </div>
      )}

      {showNewTopic && (
        <div className="inline-create-box">
          <input
            type="text"
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            placeholder="Tên chủ đề mới (vd: Phương trình mũ - logarit)"
          />
          <select
            value={newTopicGrade}
            onChange={(e) => setNewTopicGrade(Number(e.target.value) as 10 | 11 | 12)}
          >
            <option value={10}>Lớp 10</option>
            <option value={11}>Lớp 11</option>
            <option value={12}>Lớp 12</option>
          </select>
          <button type="button" className="btn-primary" onClick={handleAddTopic}>
            Lưu chủ đề
          </button>
        </div>
      )}

      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? "Đang lưu..." : "Thêm câu hỏi vào ngân hàng"}
      </button>
    </form>
  );
}
