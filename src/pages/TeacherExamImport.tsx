import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { matchTopicByName, parseExamFromPdfPages, type ParsedExam } from "../lib/ai";
import { AUTO_CANCEL_THRESHOLD } from "../lib/proctoring";
import { renderPdfToImages } from "../lib/pdfImport";
import { MathText } from "../components/MathText";
import { ImageUploadField } from "../components/ImageUploadField";
import { SolutionField } from "../components/SolutionField";
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
  // THÊM 25/08/2026: đường xuất bản đề qua AI (import PDF/Word) trước giờ
  // KHÔNG có ô chọn "Chế độ phòng thi" như màn tạo đề thủ công
  // (TeacherExamEditor.tsx) — mọi đề tạo qua đây đều âm thầm rơi vào mặc định
  // "thoải mái" của database (migration_010), không có cách nào bật "nghiêm
  // túc" ngay lúc xuất bản, phải đi vòng qua màn Sửa đề sau đó mới đổi được.
  // Giáo viên dùng đường AI import làm cách chính nên đây là thiếu sót thật,
  // không phải bug — bổ sung để 2 đường tạo đề nhất quán với nhau.
  const [mode, setMode] = useState<"thoai_mai" | "nghiem_tuc">("thoai_mai");
  // THÊM 25/08/2026: cùng lý do với "mode" ở trên — "Giao đề theo lịch"
  // (mở khoá/khoá đúng giờ, hiện nổi bật ở trang chủ học sinh qua
  // .featured-assigned-card) cũng chỉ có ở màn tạo đề thủ công, chưa có ở đây.
  const [assignEnabled, setAssignEnabled] = useState(false);
  const [unlockAt, setUnlockAt] = useState("");
  const [lockAt, setLockAt] = useState("");
  // Tính điểm linh hoạt (Đợt 3, mục 2) — mirror y hệt TeacherExamEditor.tsx.
  // Điểm tuỳ chỉnh nhập theo id CỤC BỘ (q.id, dạng "local-N") vì câu hỏi chỉ
  // thật sự có question_id sau khi api.createQuestion() chạy lúc xuất bản.
  const [scoringMode, setScoringMode] = useState<"chuan_thpt" | "tuy_chinh">("chuan_thpt");
  const [customScoringMethod, setCustomScoringMethod] = useState<"tu_dong" | "thu_cong" | null>(
    null,
  );
  const [customPoints, setCustomPoints] = useState<Record<string, string>>({});
  const [customPart2Points, setCustomPart2Points] = useState<
    Record<string, { a: string; b: string; c: string; d: string }>
  >({});
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

  // Làm mới giao diện (Nhóm 5, "quản lý lớp học", 28/08/2026 — demo đã duyệt):
  // câu hỏi thu gọn mặc định, bấm 1 câu để mở form sửa đầy đủ — chỉ 1 câu mở
  // cùng lúc trên toàn trang, đỡ phải cuộn qua hàng chục form cùng hiện như
  // trước. Không đổi logic chấm điểm/dữ liệu gì, chỉ đổi cách trình bày.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  function questionKey(part: 1 | 2 | 3, id: string) {
    return `p${part}-${id}`;
  }
  function jumpToQuestion(part: 1 | 2 | 3, id: string) {
    const key = questionKey(part, id);
    setExpandedKey(key);
    setTimeout(() => {
      document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }
  /** Xem trước ngắn gọn 1 dòng cho hàng câu hỏi thu gọn — không render MathText ở đây (tránh KaTeX phá dòng khi cắt bằng ellipsis), chỉ hiện chữ thô. */
  function previewText(raw: string, max = 90) {
    const flat = raw.trim().replace(/\s+/g, " ");
    if (!flat) return "(chưa có nội dung)";
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

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
      const startedAt = Date.now();
      const { parsed, failedChunks, totalChunks, chunkErrors } = await parseExamFromPdfPages(
        pageImages,
        undefined,
        // Các đợt chạy SONG SONG nên "đợt 2/4 xong" không có nghĩa là đã đi
        // được nửa đường về thời gian — hiện thêm số giây đã trôi để biết
        // thật sự đang nhanh hay chậm, thay vì đoán qua con số đợt.
        (done, total) =>
          setAnalyzingProgress(
            `Đã xong ${done}/${total} đợt (${Math.round((Date.now() - startedAt) / 1000)} giây)...`,
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

      const createdIds: {
        question_id: string;
        order_index: number;
        part: 1 | 2 | 3;
        custom_points?: number | null;
        custom_part2_points?: { a: number; b: number; c: number; d: number } | null;
      }[] = [];

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
        createdIds.push({
          question_id: created.id,
          order_index: i,
          part: 1,
          ...(includeCustom ? { custom_points: parsePoint(customPoints[q.id]) } : {}),
        });
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
        const part2Sub = parsePart2(customPart2Points[q.id]);
        createdIds.push({
          question_id: created.id,
          order_index: i,
          part: 2,
          ...(includeCustom
            ? {
                custom_part2_points: part2Sub,
                custom_points: part2Sub ? null : parsePoint(customPoints[q.id]),
              }
            : {}),
        });
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
        // Phần 3 đã có sẵn ô "điểm" ngay trong form (q.points, dùng làm
        // default_points) — không thêm ô nhập điểm tuỳ chỉnh trùng lặp ở
        // đây, chỉ dùng lại đúng giá trị đó làm custom_points khi cần.
        createdIds.push({
          question_id: created.id,
          order_index: i,
          part: 3,
          ...(includeCustom ? { custom_points: q.points } : {}),
        });
      }

      const exam = await api.createExam({
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: durationMinutes.trim() ? Number(durationMinutes) : null,
        grade: grade ? (Number(grade) as 10 | 11 | 12) : null,
        folder_id: folderId,
        term_id: termId,
        drive_link: driveLink.trim() || null,
        mode,
        assigned_unlock_at: assignEnabled && unlockAt ? new Date(unlockAt).toISOString() : null,
        assigned_lock_at: assignEnabled && lockAt ? new Date(lockAt).toISOString() : null,
        scoring_mode: scoringMode,
        custom_scoring_method: scoringMode === "tuy_chinh" ? customScoringMethod : null,
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
          Tải lên file <strong>PDF</strong> của đề thi (xuất từ Word ra PDF, giữ nguyên công
          thức MathType — không cần chỉnh sửa gì thêm). AI đọc trực tiếp từng trang như đọc ảnh
          nên không bỏ sót công thức MathType, và tự nhận diện đáp án đúng qua mọi tín hiệu
          thường gặp (tô màu, gạch chân, in đậm, dấu "*", ghi chú "Đáp án:", hoặc đáp số nằm
          trong phần lời giải) — nhưng bạn vẫn cần xem lại và xác nhận từng câu ở bước tiếp theo
          trước khi xuất bản. Hai thứ AI <strong>không</strong> tự lấy, bạn tự thêm ở bước xem
          trước: <em>ảnh minh hoạ</em> (đồ thị, bảng biến thiên — AI sẽ đánh dấu câu nào có hình)
          và <em>lời giải chi tiết</em> (ô nhập lời giải có sẵn xem trước LaTeX và cho dán ảnh
          chụp màn hình bằng Ctrl+V).
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

  const missingP1 = part1.filter((q) => !q.correct_choice);
  const missingP2 = part2.filter((q) => !q.correct);
  const missingP3 = part3.filter((q) => !q.correct_value);

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

      {missingAnswerCount > 0 ? (
        <div className="status-banner status-banner--warn">
          <span>⚠️ Còn <strong>{missingAnswerCount} câu</strong> chưa xác nhận đáp án đúng:</span>
          <div className="status-banner-jump">
            {missingP1.map((q, i) => (
              <button key={q.id} onClick={() => jumpToQuestion(1, q.id)}>
                P1 câu {part1.indexOf(q) + 1}
              </button>
            ))}
            {missingP2.map((q) => (
              <button key={q.id} onClick={() => jumpToQuestion(2, q.id)}>
                P2 câu {part2.indexOf(q) + 1}
              </button>
            ))}
            {missingP3.map((q) => (
              <button key={q.id} onClick={() => jumpToQuestion(3, q.id)}>
                P3 câu {part3.indexOf(q) + 1}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="empty-hint">Tất cả câu hỏi đã có đáp án.</p>
      )}

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
                  {part1.length + part2.length + part3.length > 0
                    ? `Mỗi câu tự động được ${(
                        Math.round((10 / (part1.length + part2.length + part3.length)) * 100) / 100
                      ).toFixed(2)} điểm (10đ / ${part1.length + part2.length + part3.length} câu).`
                    : "Chưa có câu hỏi nào."}
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
                Thủ công — tự nhập điểm từng câu bên dưới (Phần 2 nhập riêng từng ý)
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="hover-card section-card">
        <div className="section-card-head">
          <h3>Chương & phân loại</h3>
          <div className="section-card-head-sub">AI đã gợi ý sẵn theo nội dung từng câu — xem lại trước khi xuất bản</div>
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
            <label>Chương mà đề này bao phủ (đã tự chọn sẵn theo gợi ý AI — xem lại/đổi nếu cần)</label>
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
          <div className="field field-span2">
            <label>Link Google Drive chứa file đề gốc (không bắt buộc)</label>
            <input
              type="url"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </div>
        </div>
      </div>

      {part1.length > 0 && (
        <section>
          <h3 className="part-title">Phần 1 — Trắc nghiệm 4 phương án ({part1.length} câu)</h3>
          <div className="q-list">
            {part1.map((q, idx) => {
              const key = questionKey(1, q.id);
              const missing = !q.correct_choice;
              if (expandedKey !== key) {
                return (
                  <button
                    key={q.id}
                    type="button"
                    id={key}
                    className="q-row"
                    onClick={() => setExpandedKey(key)}
                  >
                    <span className="q-row-num">{idx + 1}</span>
                    <span className="q-row-preview">{previewText(q.content_latex)}</span>
                    {q.ai_suggested_topic_id && <span className="ai-tag">✨ AI gợi ý</span>}
                    <span className={`q-row-status ${missing ? "q-row-status--missing" : "q-row-status--ok"}`}>
                      {missing ? "Chưa có đáp án" : "Đã có đáp án"}
                    </span>
                    <span className="q-row-chevron">▾</span>
                  </button>
                );
              }
              return (
                <div key={q.id} id={key} className="hover-card q-editor">
                  <div className="q-editor-head">
                    <div className="q-editor-head-left">
                      <span className="q-row-num">{idx + 1}</span>
                      <strong>Câu {idx + 1}</strong>
                      {q.ai_suggested_topic_id && <span className="ai-tag">✨ AI gợi ý chương</span>}
                    </div>
                    <button type="button" className="btn-link" onClick={() => setExpandedKey(null)}>
                      Thu gọn ▲
                    </button>
                  </div>
                  <div className="form-row">
                    <label>Nội dung câu hỏi (LaTeX)</label>
                    <textarea
                      rows={2}
                      value={q.content_latex}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPart1((prev) => prev.map((x) => (x.id === q.id ? { ...x, content_latex: v } : x)));
                      }}
                    />
                    <div className="q-editor-preview">
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
                    <SolutionField
                      value={q.solution_latex ?? ""}
                      onChange={(v) =>
                        setPart1((prev) =>
                          prev.map((x) => (x.id === q.id ? { ...x, solution_latex: v || null } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="form-row">
                    <label>Chương</label>
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
                  <div className="opt-grid">
                    {(["A", "B", "C", "D"] as const).map((c) => (
                      <div key={c} className={`opt-row ${q.correct_choice === c ? "opt-row--correct" : ""}`}>
                        <input
                          type="radio"
                          checked={q.correct_choice === c}
                          onChange={() =>
                            setPart1((prev) =>
                              prev.map((x) => (x.id === q.id ? { ...x, correct_choice: c } : x)),
                            )
                          }
                        />
                        <span className="opt-letter">{c}</span>
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
                  </div>
                  {scoringMode === "tuy_chinh" && customScoringMethod === "thu_cong" && (
                    <div className="form-row">
                      <label>Điểm câu này</label>
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
                    </div>
                  )}
                  <div className="q-editor-foot">
                    <button
                      type="button"
                      className="btn-link btn-danger"
                      onClick={() => setPart1((prev) => prev.filter((x) => x.id !== q.id))}
                    >
                      Xoá câu này
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {part2.length > 0 && (
        <section>
          <h3 className="part-title">Phần 2 — Đúng/Sai ({part2.length} câu)</h3>
          <div className="q-list">
            {part2.map((q, idx) => {
              const key = questionKey(2, q.id);
              const missing = !q.correct;
              if (expandedKey !== key) {
                return (
                  <button
                    key={q.id}
                    type="button"
                    id={key}
                    className="q-row"
                    onClick={() => setExpandedKey(key)}
                  >
                    <span className="q-row-num">{idx + 1}</span>
                    <span className="q-row-preview">{previewText(q.content_latex)}</span>
                    {q.ai_suggested_topic_id && <span className="ai-tag">✨ AI gợi ý</span>}
                    <span className={`q-row-status ${missing ? "q-row-status--missing" : "q-row-status--ok"}`}>
                      {missing ? "Chưa có đáp án" : "Đã có đáp án"}
                    </span>
                    <span className="q-row-chevron">▾</span>
                  </button>
                );
              }
              return (
                <div key={q.id} id={key} className="hover-card q-editor">
                  <div className="q-editor-head">
                    <div className="q-editor-head-left">
                      <span className="q-row-num">{idx + 1}</span>
                      <strong>Câu {idx + 1}</strong>
                      {q.ai_suggested_topic_id && <span className="ai-tag">✨ AI gợi ý chương</span>}
                    </div>
                    <button type="button" className="btn-link" onClick={() => setExpandedKey(null)}>
                      Thu gọn ▲
                    </button>
                  </div>
                  <div className="form-row">
                    <label>Nội dung câu hỏi (LaTeX)</label>
                    <textarea
                      rows={2}
                      value={q.content_latex}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPart2((prev) => prev.map((x) => (x.id === q.id ? { ...x, content_latex: v } : x)));
                      }}
                    />
                    <div className="q-editor-preview">
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
                    <SolutionField
                      value={q.solution_latex ?? ""}
                      onChange={(v) =>
                        setPart2((prev) =>
                          prev.map((x) => (x.id === q.id ? { ...x, solution_latex: v || null } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="form-row">
                    <label>Chương</label>
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
                  <div className="opt-grid">
                    {(["a", "b", "c", "d"] as const).map((k) => (
                      <div key={k} className="opt-row">
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
                  </div>
                  {scoringMode === "tuy_chinh" && customScoringMethod === "thu_cong" && (
                    <div className="form-row">
                      <label>Điểm riêng từng ý a/b/c/d</label>
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
                    </div>
                  )}
                  <div className="q-editor-foot">
                    <button
                      type="button"
                      className="btn-link btn-danger"
                      onClick={() => setPart2((prev) => prev.filter((x) => x.id !== q.id))}
                    >
                      Xoá câu này
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {part3.length > 0 && (
        <section>
          <h3 className="part-title">Phần 3 — Trả lời ngắn ({part3.length} câu)</h3>
          <div className="q-list">
            {part3.map((q, idx) => {
              const key = questionKey(3, q.id);
              const missing = !q.correct_value;
              if (expandedKey !== key) {
                return (
                  <button
                    key={q.id}
                    type="button"
                    id={key}
                    className="q-row"
                    onClick={() => setExpandedKey(key)}
                  >
                    <span className="q-row-num">{idx + 1}</span>
                    <span className="q-row-preview">{previewText(q.content_latex)}</span>
                    {q.ai_suggested_topic_id && <span className="ai-tag">✨ AI gợi ý</span>}
                    <span className={`q-row-status ${missing ? "q-row-status--missing" : "q-row-status--ok"}`}>
                      {missing ? "Chưa có đáp án" : "Đã có đáp án"}
                    </span>
                    <span className="q-row-chevron">▾</span>
                  </button>
                );
              }
              return (
                <div key={q.id} id={key} className="hover-card q-editor">
                  <div className="q-editor-head">
                    <div className="q-editor-head-left">
                      <span className="q-row-num">{idx + 1}</span>
                      <strong>Câu {idx + 1}</strong>
                      {q.ai_suggested_topic_id && <span className="ai-tag">✨ AI gợi ý chương</span>}
                    </div>
                    <button type="button" className="btn-link" onClick={() => setExpandedKey(null)}>
                      Thu gọn ▲
                    </button>
                  </div>
                  <div className="form-row">
                    <label>Nội dung câu hỏi (LaTeX)</label>
                    <textarea
                      rows={2}
                      value={q.content_latex}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPart3((prev) => prev.map((x) => (x.id === q.id ? { ...x, content_latex: v } : x)));
                      }}
                    />
                    <div className="q-editor-preview">
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
                    <SolutionField
                      value={q.solution_latex ?? ""}
                      onChange={(v) =>
                        setPart3((prev) =>
                          prev.map((x) => (x.id === q.id ? { ...x, solution_latex: v || null } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="form-row">
                    <label>Chương</label>
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
                  <div className="opt-row">
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
                  <div className="q-editor-foot">
                    <button
                      type="button"
                      className="btn-link btn-danger"
                      onClick={() => setPart3((prev) => prev.filter((x) => x.id !== q.id))}
                    >
                      Xoá câu này
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="hover-card sticky-footer">
        <div className="sticky-footer-info">
          {part1.length + part2.length + part3.length} câu ·{" "}
          {missingAnswerCount > 0
            ? `còn ${missingAnswerCount} câu chưa có đáp án`
            : "đã xác nhận đủ đáp án"}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-secondary" onClick={() => setStage("upload")}>
            ← Tải file khác
          </button>
          <button className="btn-primary" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Đang xuất bản..." : "Xuất bản đề thi"}
          </button>
        </div>
      </div>
    </div>
  );
}
