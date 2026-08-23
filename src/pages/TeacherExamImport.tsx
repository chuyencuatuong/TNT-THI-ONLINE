import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { extractDocx } from "../lib/wordImport";
import { matchTopicByName, parseExamFromDocument, parseExamFromPdfPages, type ParsedExam } from "../lib/ai";
import { renderPdfToImages } from "../lib/pdfImport";
import { MathText } from "../components/MathText";
import { ImageUploadField } from "../components/ImageUploadField";
import { TagPicker } from "../components/TagPicker";
import type { ExamTag, Topic } from "../lib/types";

let localIdCounter = 0;
function nextLocalId() {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}

interface EditableP1 {
  id: string;
  content_latex: string;
  choices: { A: string; B: string; C: string; D: string };
  correct_choice: "A" | "B" | "C" | "D" | null;
  image_url: string | null;
  /** Lời giải chi tiết — không bắt buộc, chỉ hiện cho học sinh SAU khi nộp bài. */
  solution_latex: string | null;
  /** Chương — mặc định lấy theo gợi ý AI (topic_name), giáo viên xem lại/đổi ngay ở màn hình này. */
  topic_id: string | null;
  ai_suggested_topic_id: string | null;
}
interface EditableP2 {
  id: string;
  content_latex: string;
  items: { a: string; b: string; c: string; d: string };
  correct: { a: boolean; b: boolean; c: boolean; d: boolean } | null;
  image_url: string | null;
  solution_latex: string | null;
  topic_id: string | null;
  ai_suggested_topic_id: string | null;
}
interface EditableP3 {
  id: string;
  content_latex: string;
  correct_value: string | null;
  points: number;
  image_url: string | null;
  solution_latex: string | null;
  topic_id: string | null;
  ai_suggested_topic_id: string | null;
}

function withIds(parsed: ParsedExam, topics: Topic[]) {
  return {
    part1: parsed.part1.map((q) => {
      const suggested = matchTopicByName(q.topic_name, topics);
      return {
        ...q,
        id: nextLocalId(),
        image_url: null,
        solution_latex: q.solution_latex ?? null,
        topic_id: suggested,
        ai_suggested_topic_id: suggested,
      };
    }) as EditableP1[],
    part2: parsed.part2.map((q) => {
      const suggested = matchTopicByName(q.topic_name, topics);
      return {
        ...q,
        id: nextLocalId(),
        image_url: null,
        solution_latex: q.solution_latex ?? null,
        topic_id: suggested,
        ai_suggested_topic_id: suggested,
      };
    }) as EditableP2[],
    part3: parsed.part3.map((q) => {
      const suggested = matchTopicByName(q.topic_name, topics);
      return {
        ...q,
        id: nextLocalId(),
        image_url: null,
        solution_latex: q.solution_latex ?? null,
        topic_id: suggested,
        ai_suggested_topic_id: suggested,
      };
    }) as EditableP3[],
  };
}

export function TeacherExamImport() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [stage, setStage] = useState<"upload" | "analyzing" | "review">("upload");
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pasteJson, setPasteJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyzingProgress, setAnalyzingProgress] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [grade, setGrade] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [termId, setTermId] = useState<string | null>(null);
  const [selectedExamTopicIds, setSelectedExamTopicIds] = useState<Set<string>>(new Set());
  const [driveLink, setDriveLink] = useState("");
  const [part1, setPart1] = useState<EditableP1[]>([]);
  const [part2, setPart2] = useState<EditableP2[]>([]);
  const [part3, setPart3] = useState<EditableP3[]>([]);
  const [publishing, setPublishing] = useState(false);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [folders, setFolders] = useState<ExamTag[]>([]);
  const [terms, setTerms] = useState<ExamTag[]>([]);

  useEffect(() => {
    api.listTopics().then(setTopics).catch(console.error);
    api.listExamTags("folder").then(setFolders).catch(console.error);
    api.listExamTags("term").then(setTerms).catch(console.error);
  }, []);

  function toggleExamTopic(id: string) {
    setSelectedExamTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function loadParsed(parsed: ParsedExam, suggestedTitle?: string) {
    const withLocalIds = withIds(parsed, topics);
    setPart1(withLocalIds.part1);
    setPart2(withLocalIds.part2);
    setPart3(withLocalIds.part3);
    setWarnings(parsed.warnings);
    if (suggestedTitle && !title) setTitle(suggestedTitle);
    // Gợi ý sẵn "Chương mà đề bao phủ" = hợp các chương AI đã gợi ý cho từng
    // câu — giáo viên xem lại/đổi ở bước xem trước, không tự động chốt.
    const suggested = new Set(
      [...withLocalIds.part1, ...withLocalIds.part2, ...withLocalIds.part3]
        .map((q) => q.topic_id)
        .filter((id): id is string => !!id),
    );
    setSelectedExamTopicIds(suggested);
    setStage("review");
  }

  /**
   * Cách tạo đề CHÍNH (khuyến nghị): tải file PDF lên → với mỗi trang, lấy
   * ĐỒNG THỜI văn bản thật (pdf.js đọc lớp text nhúng sẵn, chính xác tuyệt
   * đối, không tốn AI) và ảnh render cả trang (chỉ để AI đọc công thức đã
   * thành hình + nhận diện hình vẽ + xác định đáp án qua tín hiệu thị giác).
   * Cách này né được hoàn toàn giới hạn "không đọc được công thức MathType"
   * của việc đọc thẳng file .docx, vì PDF chỉ lưu lại hình ảnh cuối cùng của
   * công thức — không phụ thuộc định dạng lưu trữ gốc — đồng thời nhẹ và
   * chính xác hơn so với để AI tự đọc lại toàn bộ chữ từ ảnh độ phân giải cao.
   */
  async function handlePdfSelected(file: File) {
    setError(null);
    setFileName(file.name);
    setStage("analyzing");
    try {
      setAnalyzingProgress("Đang đọc văn bản và render từng trang PDF...");
      const pageImages = await renderPdfToImages(file);
      if (pageImages.length === 0) {
        setError("Không đọc được trang nào từ file PDF này. Hãy kiểm tra lại file rồi thử lại.");
        setStage("upload");
        return;
      }
      setAnalyzingProgress(`Đang gửi ${pageImages.length} trang cho AI phân tích...`);
      const { parsed, failedChunks, totalChunks, chunkErrors } = await parseExamFromPdfPages(
        pageImages,
        undefined,
        (done, total) =>
          setAnalyzingProgress(
            `Đang phân tích đợt ${done}/${total} (mỗi đợt khoảng 20-40 giây)...`,
          ),
        topics,
      );
      if (!parsed) {
        // Hiện đúng lý do thật (vd. "Google đang quá tải", "hết thời gian chờ"...)
        // thay vì 1 câu chung chung, để biết nên thử lại ngay hay chờ vài phút.
        const reason = chunkErrors[0] ?? "không rõ lý do";
        setError(
          `AI chưa phân tích được đề này: ${reason} Bạn có thể bấm thử lại (nhiều khả năng qua ngay nếu là lỗi tạm thời từ Google), hoặc dán JSON đã xử lý sẵn ở ô bên dưới.`,
        );
        setStage("upload");
        return;
      }
      if (failedChunks > 0) {
        console.warn(`parseExamFromPdfPages: ${failedChunks}/${totalChunks} đợt lỗi.`, chunkErrors);
      }
      loadParsed(parsed, file.name.replace(/\.pdf$/i, ""));
    } catch (err) {
      console.error(err);
      setError("Có lỗi khi đọc file PDF. Hãy chắc chắn đây là file PDF hợp lệ, không bị hỏng hoặc đặt mật khẩu.");
      setStage("upload");
    } finally {
      setAnalyzingProgress("");
    }
  }

  /** Cách dự phòng: đọc thẳng .docx bằng mammoth.js — không đọc được công thức MathType (xem wordImport.ts). */
  async function handleFileSelected(file: File) {
    setError(null);
    setFileName(file.name);
    setStage("analyzing");
    try {
      const { plainText, images } = await extractDocx(file);
      if (!plainText.trim() && images.length === 0) {
        setError("Không đọc được nội dung nào từ file này. Hãy thử lưu lại file .docx rồi tải lên lại.");
        setStage("upload");
        return;
      }
      const parsed = await parseExamFromDocument(plainText, images, topics);
      if (!parsed) {
        setError(
          "AI chưa phân tích được đề này (có thể do thiếu API key hoặc lỗi kết nối). Bạn có thể dán JSON đã xử lý sẵn ở ô bên dưới, hoặc thử lại.",
        );
        setStage("upload");
        return;
      }
      loadParsed(parsed, file.name.replace(/\.docx$/i, ""));
    } catch (err) {
      console.error(err);
      setError("Có lỗi khi đọc file .docx. Hãy chắc chắn đây là file Word hợp lệ (.docx, không phải .doc cũ).");
      setStage("upload");
    }
  }

  function handlePasteJsonSubmit() {
    setError(null);
    try {
      const parsed = JSON.parse(pasteJson) as ParsedExam;
      loadParsed({
        part1: parsed.part1 ?? [],
        part2: parsed.part2 ?? [],
        part3: parsed.part3 ?? [],
        warnings: parsed.warnings ?? [],
      });
    } catch {
      setError("Nội dung dán vào không phải JSON hợp lệ.");
    }
  }

  const missingAnswerCount =
    part1.filter((q) => !q.correct_choice).length +
    part2.filter((q) => !q.correct).length +
    part3.filter((q) => !q.correct_value).length;

  async function handlePublish() {
    if (!profile || !title.trim()) {
      alert("Cần nhập tên đề thi.");
      return;
    }
    if (missingAnswerCount > 0) {
      alert(`Còn ${missingAnswerCount} câu chưa xác nhận đáp án đúng — vui lòng điền đủ trước khi xuất bản.`);
      return;
    }
    if (part1.length + part2.length + part3.length === 0) {
      alert("Chưa có câu hỏi nào để xuất bản.");
      return;
    }
    setPublishing(true);
    try {
      const createdIds: { question_id: string; order_index: number; part: 1 | 2 | 3 }[] = [];

      for (let i = 0; i < part1.length; i++) {
        const q = part1[i];
        const created = await api.createQuestion({
          part: 1,
          question_type_id: null,
          topic_id: q.topic_id,
          ai_suggested_topic_id: q.ai_suggested_topic_id,
          difficulty: null,
          content_latex: q.content_latex,
          image_url: q.image_url,
          options: { choices: q.choices },
          correct_answer: { choice: q.correct_choice },
          solution_latex: q.solution_latex,
          default_points: null,
          ai_suggested_type_id: null,
          created_by: profile.id,
          source: "word_import",
        });
        createdIds.push({ question_id: created.id, order_index: i, part: 1 });
      }
      for (let i = 0; i < part2.length; i++) {
        const q = part2[i];
        const created = await api.createQuestion({
          part: 2,
          question_type_id: null,
          topic_id: q.topic_id,
          ai_suggested_topic_id: q.ai_suggested_topic_id,
          difficulty: null,
          content_latex: q.content_latex,
          image_url: q.image_url,
          options: { items: q.items },
          correct_answer: q.correct,
          solution_latex: q.solution_latex,
          default_points: null,
          ai_suggested_type_id: null,
          created_by: profile.id,
          source: "word_import",
        });
        createdIds.push({ question_id: created.id, order_index: i, part: 2 });
      }
      for (let i = 0; i < part3.length; i++) {
        const q = part3[i];
        const created = await api.createQuestion({
          part: 3,
          question_type_id: null,
          topic_id: q.topic_id,
          ai_suggested_topic_id: q.ai_suggested_topic_id,
          difficulty: null,
          content_latex: q.content_latex,
          image_url: q.image_url,
          options: {},
          correct_answer: { value: q.correct_value },
          solution_latex: q.solution_latex,
          default_points: q.points,
          ai_suggested_type_id: null,
          created_by: profile.id,
          source: "word_import",
        });
        createdIds.push({ question_id: created.id, order_index: i, part: 3 });
      }

      const exam = await api.createExam({
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: durationMinutes.trim() ? Number(durationMinutes) : null,
        grade: grade ? (Number(grade) as 10 | 11 | 12) : null,
        folder_id: folderId,
        term_id: termId,
        drive_link: driveLink.trim() || null,
        created_by: profile.id,
      });
      await api.setExamQuestions(exam.id, createdIds);
      await api.setExamTopics(exam.id, Array.from(selectedExamTopicIds));
      navigate("/giao-vien/de-thi");
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi xuất bản đề thi, vui lòng thử lại.");
    } finally {
      setPublishing(false);
    }
  }

  if (stage === "upload") {
    return (
      <div className="teacher-page">
        <h2>Tạo đề thi mới</h2>
        <p className="empty-hint">
          Cách nhanh và chính xác nhất: tải lên file <strong>PDF</strong> của đề thi (xuất từ Word
          ra PDF, giữ nguyên công thức MathType — không cần chỉnh sửa gì thêm). AI đọc trực tiếp
          từng trang như đọc ảnh, nên không bị giới hạn "bỏ sót công thức MathType" như khi đọc
          thẳng file .docx. AI cũng tự nhận diện đáp án đúng (tô màu/gạch chân/in đậm/dấu "*"/ghi
          chú "Đáp án:"...) và lời giải chi tiết nếu đề có ghi sẵn — nhưng bạn vẫn cần xem lại và
          xác nhận từng câu ở bước tiếp theo trước khi xuất bản. Ảnh minh hoạ (đồ thị, bảng biến
          thiên...) chưa tự động lấy được — AI sẽ đánh dấu câu nào có hình để bạn dán tay lại bằng
          Ctrl+V ở bước xem trước.
        </p>
        {error && <p className="form-error">{error}</p>}

        <div className="form-row">
          <label>Chọn file PDF</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfSelected(f);
            }}
          />
          {fileName && <span className="empty-hint">Đã chọn: {fileName}</span>}
        </div>

        <details style={{ marginTop: 28 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Cách khác</summary>
          <div style={{ marginTop: 12 }}>
            <div className="form-row">
              <label>Dán JSON đã xử lý sẵn</label>
              <textarea
                rows={5}
                value={pasteJson}
                onChange={(e) => setPasteJson(e.target.value)}
                placeholder='{"part1": [{"content_latex": "...", "choices": {...}, "correct_choice": "A", "solution_latex": "..."}], "part2": [...], "part3": [...], "warnings": []}'
              />
              <button className="btn-primary" onClick={handlePasteJsonSubmit} disabled={!pasteJson.trim()}>
                Dùng JSON này
              </button>
            </div>

            <details style={{ marginTop: 20 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Đọc thẳng file Word (.docx) — kém chính xác hơn với công thức MathType
              </summary>
              <div style={{ marginTop: 12 }}>
                <p className="ai-hint">
                  Nếu đề dùng công cụ gõ công thức có sẵn của Word (Equation/MathType), cách này có
                  thể bỏ sót công thức (giới hạn kỹ thuật của thư viện đọc file .docx, không đọc
                  được đối tượng OLE mà MathType tạo ra) — bạn sẽ thấy rõ ở bước xem trước và cần
                  gõ tay lại bằng LaTeX cho câu đó. Nên ưu tiên tải PDF ở trên thay vì cách này.
                </p>
                <div className="form-row">
                  <label>Chọn file .docx</label>
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelected(f);
                    }}
                  />
                </div>
              </div>
            </details>
          </div>
        </details>
      </div>
    );
  }

  if (stage === "analyzing") {
    return (
      <div className="page-loading">
        {analyzingProgress || "Đang đọc file và phân tích bằng AI..."}
      </div>
    );
  }

  return (
    <div className="teacher-page">
      <h2>Xem trước & xác nhận đề thi</h2>

      {warnings.length > 0 && (
        <div className="ai-hint">
          <strong>AI lưu ý:</strong>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

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
        <label>
          Chương mà đề này bao phủ (đã tự chọn sẵn theo gợi ý AI của từng câu — xem lại/đổi nếu cần,
          dùng để lọc ở Kho đề)
        </label>
        <div className="pickable-list" style={{ maxHeight: 180, overflowY: "auto" }}>
          {topics.map((t) => (
            <label key={t.id} className="pickable-item">
              <input
                type="checkbox"
                checked={selectedExamTopicIds.has(t.id)}
                onChange={() => toggleExamTopic(t.id)}
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

      <p className={missingAnswerCount > 0 ? "form-error" : "empty-hint"}>
        {missingAnswerCount > 0
          ? `Còn ${missingAnswerCount} câu chưa có đáp án đúng — cần chọn trước khi xuất bản.`
          : "Tất cả câu hỏi đã có đáp án."}
      </p>

      {part1.length > 0 && (
        <section>
          <h3 className="part-title">Phần 1 — Trắc nghiệm 4 phương án ({part1.length} câu)</h3>
          {part1.map((q, idx) => (
            <div key={q.id} className="question-form">
              <div className="form-row">
                <label>Câu {idx + 1} (LaTeX)</label>
                <textarea
                  rows={2}
                  value={q.content_latex}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPart1((prev) => prev.map((x) => (x.id === q.id ? { ...x, content_latex: v } : x)));
                  }}
                />
                <div className="latex-preview">
                  <MathText text={q.content_latex} />
                </div>
              </div>
              <div className="form-row">
                <label>Hình minh hoạ (không bắt buộc)</label>
                <ImageUploadField
                  value={q.image_url}
                  onChange={(url) =>
                    setPart1((prev) => prev.map((x) => (x.id === q.id ? { ...x, image_url: url } : x)))
                  }
                />
              </div>
              <div className="form-row">
                <label>Lời giải chi tiết (không bắt buộc — chỉ hiện cho học sinh SAU khi nộp bài)</label>
                <textarea
                  rows={2}
                  value={q.solution_latex ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPart1((prev) =>
                      prev.map((x) => (x.id === q.id ? { ...x, solution_latex: v || null } : x)),
                    );
                  }}
                />
              </div>
              <div className="form-row">
                <label>
                  Chương{q.ai_suggested_topic_id ? " (AI gợi ý — xem lại/đổi nếu cần)" : ""}
                </label>
                <select
                  value={q.topic_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setPart1((prev) => prev.map((x) => (x.id === q.id ? { ...x, topic_id: v } : x)));
                  }}
                >
                  <option value="">— Chưa chọn —</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {(["A", "B", "C", "D"] as const).map((c) => (
                <div key={c} className="option-row">
                  <input
                    type="radio"
                    checked={q.correct_choice === c}
                    onChange={() =>
                      setPart1((prev) =>
                        prev.map((x) => (x.id === q.id ? { ...x, correct_choice: c } : x)),
                      )
                    }
                  />
                  <span>{c}</span>
                  <input
                    type="text"
                    value={q.choices[c]}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPart1((prev) =>
                        prev.map((x) =>
                          x.id === q.id ? { ...x, choices: { ...x.choices, [c]: v } } : x,
                        ),
                      );
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn-link btn-danger"
                onClick={() => setPart1((prev) => prev.filter((x) => x.id !== q.id))}
              >
                Xoá câu này
              </button>
            </div>
          ))}
        </section>
      )}

      {part2.length > 0 && (
        <section>
          <h3 className="part-title">Phần 2 — Đúng/Sai ({part2.length} câu)</h3>
          {part2.map((q, idx) => (
            <div key={q.id} className="question-form">
              <div className="form-row">
                <label>Câu {idx + 1} (LaTeX)</label>
                <textarea
                  rows={2}
                  value={q.content_latex}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPart2((prev) => prev.map((x) => (x.id === q.id ? { ...x, content_latex: v } : x)));
                  }}
                />
                <div className="latex-preview">
                  <MathText text={q.content_latex} />
                </div>
              </div>
              <div className="form-row">
                <label>Hình minh hoạ (không bắt buộc)</label>
                <ImageUploadField
                  value={q.image_url}
                  onChange={(url) =>
                    setPart2((prev) => prev.map((x) => (x.id === q.id ? { ...x, image_url: url } : x)))
                  }
                />
              </div>
              <div className="form-row">
                <label>Lời giải chi tiết (không bắt buộc — chỉ hiện cho học sinh SAU khi nộp bài)</label>
                <textarea
                  rows={2}
                  value={q.solution_latex ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPart2((prev) =>
                      prev.map((x) => (x.id === q.id ? { ...x, solution_latex: v || null } : x)),
                    );
                  }}
                />
              </div>
              <div className="form-row">
                <label>
                  Chương{q.ai_suggested_topic_id ? " (AI gợi ý — xem lại/đổi nếu cần)" : ""}
                </label>
                <select
                  value={q.topic_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setPart2((prev) => prev.map((x) => (x.id === q.id ? { ...x, topic_id: v } : x)));
                  }}
                >
                  <option value="">— Chưa chọn —</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {(["a", "b", "c", "d"] as const).map((k) => (
                <div key={k} className="option-row">
                  <input
                    type="text"
                    value={q.items[k]}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPart2((prev) =>
                        prev.map((x) => (x.id === q.id ? { ...x, items: { ...x.items, [k]: v } } : x)),
                      );
                    }}
                  />
                  <label className="inline-choice">
                    <input
                      type="radio"
                      name={`p2-${q.id}-${k}`}
                      checked={q.correct?.[k] === true}
                      onChange={() =>
                        setPart2((prev) =>
                          prev.map((x) =>
                            x.id === q.id
                              ? { ...x, correct: { a: false, b: false, c: false, d: false, ...x.correct, [k]: true } }
                              : x,
                          ),
                        )
                      }
                    />
                    Đúng
                  </label>
                  <label className="inline-choice">
                    <input
                      type="radio"
                      name={`p2-${q.id}-${k}`}
                      checked={q.correct?.[k] === false}
                      onChange={() =>
                        setPart2((prev) =>
                          prev.map((x) =>
                            x.id === q.id
                              ? { ...x, correct: { a: false, b: false, c: false, d: false, ...x.correct, [k]: false } }
                              : x,
                          ),
                        )
                      }
                    />
                    Sai
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="btn-link btn-danger"
                onClick={() => setPart2((prev) => prev.filter((x) => x.id !== q.id))}
              >
                Xoá câu này
              </button>
            </div>
          ))}
        </section>
      )}

      {part3.length > 0 && (
        <section>
          <h3 className="part-title">Phần 3 — Trả lời ngắn ({part3.length} câu)</h3>
          {part3.map((q, idx) => (
            <div key={q.id} className="question-form">
              <div className="form-row">
                <label>Câu {idx + 1} (LaTeX)</label>
                <textarea
                  rows={2}
                  value={q.content_latex}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPart3((prev) => prev.map((x) => (x.id === q.id ? { ...x, content_latex: v } : x)));
                  }}
                />
                <div className="latex-preview">
                  <MathText text={q.content_latex} />
                </div>
              </div>
              <div className="form-row">
                <label>Hình minh hoạ (không bắt buộc)</label>
                <ImageUploadField
                  value={q.image_url}
                  onChange={(url) =>
                    setPart3((prev) => prev.map((x) => (x.id === q.id ? { ...x, image_url: url } : x)))
                  }
                />
              </div>
              <div className="form-row">
                <label>Lời giải chi tiết (không bắt buộc — chỉ hiện cho học sinh SAU khi nộp bài)</label>
                <textarea
                  rows={2}
                  value={q.solution_latex ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPart3((prev) =>
                      prev.map((x) => (x.id === q.id ? { ...x, solution_latex: v || null } : x)),
                    );
                  }}
                />
              </div>
              <div className="form-row">
                <label>
                  Chương{q.ai_suggested_topic_id ? " (AI gợi ý — xem lại/đổi nếu cần)" : ""}
                </label>
                <select
                  value={q.topic_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setPart3((prev) => prev.map((x) => (x.id === q.id ? { ...x, topic_id: v } : x)));
                  }}
                >
                  <option value="">— Chưa chọn —</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="option-row">
                <input
                  type="text"
                  placeholder="Đáp án đúng"
                  value={q.correct_value ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPart3((prev) => prev.map((x) => (x.id === q.id ? { ...x, correct_value: v } : x)));
                  }}
                />
                <input
                  type="number"
                  step="0.05"
                  style={{ width: 90 }}
                  value={q.points}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPart3((prev) => prev.map((x) => (x.id === q.id ? { ...x, points: v } : x)));
                  }}
                />
                <span>điểm</span>
              </div>
              <button
                type="button"
                className="btn-link btn-danger"
                onClick={() => setPart3((prev) => prev.filter((x) => x.id !== q.id))}
              >
                Xoá câu này
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="page-header-row" style={{ marginTop: 20 }}>
        <button className="btn-secondary" onClick={() => setStage("upload")}>
          ← Tải file khác
        </button>
        <button className="btn-primary" onClick={handlePublish} disabled={publishing}>
          {publishing ? "Đang xuất bản..." : "Xuất bản đề thi"}
        </button>
      </div>
    </div>
  );
}
