import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { extractDocx } from "../lib/wordImport";
import {
  classifyExamQuestions,
  matchLessonByName,
  matchTopicByName,
  parseExamFromDocument,
  parseExamFromPdfPages,
  type ParsedExam,
  type QuestionClassificationInput,
  type QuestionClassificationResult,
} from "../lib/ai";
import { AUTO_CANCEL_THRESHOLD } from "../lib/proctoring";
import { renderPdfToImages, type PdfPageImage } from "../lib/pdfImport";
import { ImportBenchmarkRecorder, isBenchmarkEnabled, type ImportBenchmarkRecord } from "../lib/importBenchmark";
import { MathText } from "../components/MathText";
import { ImageUploadField } from "../components/ImageUploadField";
import { TagPicker } from "../components/TagPicker";
import type { ExamTag, Lesson, Topic } from "../lib/types";

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
  /** Bài — mặc định lấy theo gợi ý AI (lesson_name, TRONG chương đã gợi ý ở trên), giáo viên xem lại/đổi ngay ở màn hình này (migration_016). */
  lesson_id: string | null;
  ai_suggested_lesson_id: string | null;
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
  lesson_id: string | null;
  ai_suggested_lesson_id: string | null;
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
  lesson_id: string | null;
  ai_suggested_lesson_id: string | null;
}

function withIds(parsed: ParsedExam, topics: Topic[], lessons: Lesson[]) {
  return {
    part1: parsed.part1.map((q) => {
      const suggested = matchTopicByName(q.topic_name, topics);
      const suggestedLesson = matchLessonByName(q.lesson_name, suggested, lessons);
      return {
        ...q,
        id: nextLocalId(),
        image_url: null,
        solution_latex: q.solution_latex ?? null,
        topic_id: suggested,
        ai_suggested_topic_id: suggested,
        lesson_id: suggestedLesson,
        ai_suggested_lesson_id: suggestedLesson,
      };
    }) as EditableP1[],
    part2: parsed.part2.map((q) => {
      const suggested = matchTopicByName(q.topic_name, topics);
      const suggestedLesson = matchLessonByName(q.lesson_name, suggested, lessons);
      return {
        ...q,
        id: nextLocalId(),
        image_url: null,
        solution_latex: q.solution_latex ?? null,
        topic_id: suggested,
        ai_suggested_topic_id: suggested,
        lesson_id: suggestedLesson,
        ai_suggested_lesson_id: suggestedLesson,
      };
    }) as EditableP2[],
    part3: parsed.part3.map((q) => {
      const suggested = matchTopicByName(q.topic_name, topics);
      const suggestedLesson = matchLessonByName(q.lesson_name, suggested, lessons);
      return {
        ...q,
        id: nextLocalId(),
        image_url: null,
        solution_latex: q.solution_latex ?? null,
        topic_id: suggested,
        ai_suggested_topic_id: suggested,
        lesson_id: suggestedLesson,
        ai_suggested_lesson_id: suggestedLesson,
      };
    }) as EditableP3[],
  };
}

// ---------------------------------------------------------------------------
// (Thêm 31/08/2026) Hiển thị 1 câu ở màn "Xem trước đề thi" — CHỈ ĐỌC, đáp án
// đúng được đánh dấu rõ để Thầy Tường soát lại lần cuối trước khi ghi thật
// vào CSDL. Cùng CSS class với QuestionReview.tsx (màn học sinh xem lại bài
// sau khi nộp) để giao diện nhất quán, nhưng KHÔNG so với "học sinh chọn gì"
// (chưa có học sinh nào làm đề — chỉ có đáp án đúng).
// ---------------------------------------------------------------------------
function PreviewMeta({ topicName, lessonName }: { topicName: string | null; lessonName: string | null }) {
  if (!topicName && !lessonName) return null;
  return (
    <p className="empty-hint" style={{ margin: "2px 0 8px" }}>
      {topicName && <>Chương: {topicName}</>}
      {topicName && lessonName && " · "}
      {lessonName && <>Bài: {lessonName}</>}
    </p>
  );
}

function Part1PreviewCard({
  number,
  q,
  topicName,
  lessonName,
  pointsLabel,
}: {
  number: number;
  q: EditableP1;
  topicName: string | null;
  lessonName: string | null;
  pointsLabel: string | null;
}) {
  const choices: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
  return (
    <div className="question-card">
      <div className="question-header question-review-header">
        <span>
          Câu {number}. <MathText text={q.content_latex} />
        </span>
        {pointsLabel && <span className="badge">{pointsLabel}</span>}
      </div>
      <PreviewMeta topicName={topicName} lessonName={lessonName} />
      {q.image_url && <img className="question-image" src={q.image_url} alt="" />}
      <div className="choice-list">
        {choices.map((c) => (
          <div
            key={c}
            className={`choice-item choice-item--readonly ${c === q.correct_choice ? "choice-item--correct-answer" : ""}`}
          >
            <span className="choice-letter">{c}</span>
            <MathText text={q.choices[c]} />
            {c === q.correct_choice && <span className="choice-tag choice-tag--correct">Đáp án đúng</span>}
          </div>
        ))}
      </div>
      {q.solution_latex && (
        <div className="question-solution">
          <div className="question-solution-title">Lời giải chi tiết</div>
          <MathText text={q.solution_latex} />
        </div>
      )}
    </div>
  );
}

function Part2PreviewCard({
  number,
  q,
  topicName,
  lessonName,
  pointsLabel,
}: {
  number: number;
  q: EditableP2;
  topicName: string | null;
  lessonName: string | null;
  pointsLabel: string | null;
}) {
  const subKeys: ("a" | "b" | "c" | "d")[] = ["a", "b", "c", "d"];
  return (
    <div className="question-card">
      <div className="question-header question-review-header">
        <span>
          Câu {number}. <MathText text={q.content_latex} />
        </span>
        {pointsLabel && <span className="badge">{pointsLabel}</span>}
      </div>
      <PreviewMeta topicName={topicName} lessonName={lessonName} />
      {q.image_url && <img className="question-image" src={q.image_url} alt="" />}
      <table className="truefalse-table truefalse-table--review">
        <thead>
          <tr>
            <th>Ý</th>
            <th>Nội dung</th>
            <th>Đáp án đúng</th>
          </tr>
        </thead>
        <tbody>
          {subKeys.map((k) => (
            <tr key={k}>
              <td className="truefalse-label">{k})</td>
              <td>
                <MathText text={q.items[k]} />
              </td>
              <td>{q.correct?.[k] ? "Đúng" : "Sai"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.solution_latex && (
        <div className="question-solution">
          <div className="question-solution-title">Lời giải chi tiết</div>
          <MathText text={q.solution_latex} />
        </div>
      )}
    </div>
  );
}

function Part3PreviewCard({
  number,
  q,
  topicName,
  lessonName,
}: {
  number: number;
  q: EditableP3;
  topicName: string | null;
  lessonName: string | null;
}) {
  return (
    <div className="question-card">
      <div className="question-header question-review-header">
        <span>
          Câu {number}. <MathText text={q.content_latex} />
        </span>
        <span className="badge">{q.points.toFixed(2)} điểm</span>
      </div>
      <PreviewMeta topicName={topicName} lessonName={lessonName} />
      {q.image_url && <img className="question-image" src={q.image_url} alt="" />}
      <p>
        <strong>Đáp án đúng:</strong> {q.correct_value ?? "— chưa nhập —"}
      </p>
      {q.solution_latex && (
        <div className="question-solution">
          <div className="question-solution-title">Lời giải chi tiết</div>
          <MathText text={q.solution_latex} />
        </div>
      )}
    </div>
  );
}

export function TeacherExamImport() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [stage, setStage] = useState<"upload" | "analyzing" | "review" | "pdf-partial" | "preview">("upload");
  /**
   * Kết quả phân tích PDF khi có ĐỢT LỖI (thêm 31/08/2026) — giữ lại ảnh
   * từng trang + kết quả thô từng đợt để cho phép "Thử lại các đợt lỗi" mà
   * không phải render/gửi lại các đợt đã đọc đúng (xem runPdfAnalysis).
   */
  const [pdfPartialState, setPdfPartialState] = useState<{
    pageImages: PdfPageImage[];
    chunkResults: ParsedExam[];
    merged: ParsedExam;
    totalChunks: number;
    chunkErrors: string[];
    fileBaseName: string;
  } | null>(null);
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pasteJson, setPasteJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyzingProgress, setAnalyzingProgress] = useState("");

  /**
   * PHASE 0 (01/09/2026) — đo benchmark, KHÔNG đổi hành vi import cho giáo
   * viên khác: chỉ bật ở `npm run dev`, hoặc bản deploy thật khi Thầy Tường tự
   * thêm `?debug=1` vào URL (xem importBenchmark.ts). `benchmarkEnabledRef`
   * tính 1 lần khi mount (không đổi giữa chừng 1 phiên) để tránh đọc lại
   * window.location mỗi lần render.
   */
  const benchmarkEnabledRef = useRef(isBenchmarkEnabled(import.meta.env.DEV, window.location.search));
  const [debugBenchmark, setDebugBenchmark] = useState<ImportBenchmarkRecord | null>(null);

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
  const [lessons, setLessons] = useState<Lesson[]>([]);
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
    api.listLessons().then(setLessons).catch(console.error);
    api.listExamTags("folder").then(setFolders).catch(console.error);
    api.listExamTags("term").then(setTerms).catch(console.error);
  }, []);

  // Lọc Chương/Bài hiển thị theo Lớp của đề đang nhập (1 đề chỉ thuộc 1 khối)
  // — trước đây (migration_016) trộn lẫn cả 3 khối, khó chọn đúng khi đề dài.
  // Chưa chọn Khối thì vẫn hiện đủ cả 3 (giáo viên có thể chọn Khối sau).
  const displayTopics = grade ? topics.filter((t) => t.grade === Number(grade)) : topics;

  function toggleExamTopic(id: string) {
    setSelectedExamTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * ĐỔI 01/09/2026 (theo yêu cầu Thầy Tường — không tự chạy nền nữa, tách
   * hẳn thành nút bấm riêng ở màn "Xem trước & xác nhận"): trước đây gọi tự
   * động ngay sau loadParsed, giờ giáo viên chủ động bấm khi cần — vd đề đã
   * tự chọn Chương/Bài tay xong không cần tốn thêm lượt gọi AI, hoặc muốn
   * bấm lại sau khi sửa câu hỏi. Đọc THẲNG state hiện tại (part1/part2/part3)
   * tại thời điểm bấm, không phải bản snapshot lúc mới tạo.
   *
   * AN TOÀN (giữ nguyên như bản chạy nền cũ): chỉ ghi kết quả vào câu nào
   * topic_id VẪN CÒN null — không ghi đè Chương/Bài Thầy đã tự chọn tay.
   */
  const [classifyingChapters, setClassifyingChapters] = useState(false);
  const [classifyStatus, setClassifyStatus] = useState<string | null>(null);

  async function handleClassifyChapters() {
    const items: QuestionClassificationInput[] = [
      ...part1.map((q) => ({ id: `p1:${q.id}`, content_latex: q.content_latex })),
      ...part2.map((q) => ({ id: `p2:${q.id}`, content_latex: q.content_latex })),
      ...part3.map((q) => ({ id: `p3:${q.id}`, content_latex: q.content_latex })),
    ];
    if (items.length === 0) {
      setClassifyStatus("Chưa có câu hỏi nào để phân loại.");
      return;
    }
    if (topics.length === 0) {
      setClassifyStatus("Chưa có Chương nào trong hệ thống để gợi ý — vào Ngân hàng câu hỏi tạo Chương trước.");
      return;
    }

    setClassifyingChapters(true);
    setClassifyStatus(null);
    let results: QuestionClassificationResult[];
    try {
      results = await classifyExamQuestions(items, topics, lessons);
    } catch (err) {
      console.error("Phân loại Chương/Bài bằng AI bị lỗi:", err);
      setClassifyStatus("Có lỗi khi gọi AI phân loại — thử lại, hoặc tự chọn Chương/Bài từng câu bên dưới.");
      setClassifyingChapters(false);
      return;
    }
    setClassifyingChapters(false);

    if (results.length === 0) {
      setClassifyStatus("AI không gợi ý được Chương/Bài nào — kiểm tra lại danh sách Chương đã tạo, hoặc tự chọn thủ công.");
      return;
    }
    const byId = new Map(results.map((r) => [r.id, r]));

    // Gộp thêm các chương AI vừa gợi ý vào danh sách "Chương đề bao phủ" —
    // CHỈ THÊM (không bao giờ tự bỏ), để không xoá mất lựa chọn giáo viên đã
    // tự tick/bỏ tick tay từ trước.
    const newlySuggestedTopicIds = results
      .map((r) => matchTopicByName(r.topic_name, topics))
      .filter((id): id is string => !!id);
    if (newlySuggestedTopicIds.length > 0) {
      setSelectedExamTopicIds((prev) => new Set([...prev, ...newlySuggestedTopicIds]));
    }

    function applySuggestion<T extends { id: string; topic_id: string | null }>(prefix: string, q: T): T {
      if (q.topic_id !== null) return q;
      const r = byId.get(`${prefix}:${q.id}`);
      if (!r) return q;
      const suggested = matchTopicByName(r.topic_name, topics);
      if (!suggested) return q;
      const suggestedLesson = matchLessonByName(r.lesson_name, suggested, lessons);
      return {
        ...q,
        topic_id: suggested,
        ai_suggested_topic_id: suggested,
        lesson_id: suggestedLesson,
        ai_suggested_lesson_id: suggestedLesson,
      };
    }

    let appliedCount = 0;
    setPart1((prev) =>
      prev.map((q) => {
        const next = applySuggestion("p1", q);
        if (next !== q) appliedCount += 1;
        return next;
      }),
    );
    setPart2((prev) =>
      prev.map((q) => {
        const next = applySuggestion("p2", q);
        if (next !== q) appliedCount += 1;
        return next;
      }),
    );
    setPart3((prev) =>
      prev.map((q) => {
        const next = applySuggestion("p3", q);
        if (next !== q) appliedCount += 1;
        return next;
      }),
    );
    setClassifyStatus(
      appliedCount > 0
        ? `Đã gán gợi ý Chương/Bài cho ${appliedCount} câu (câu đã tự chọn tay từ trước được giữ nguyên).`
        : "AI có phản hồi nhưng không có câu nào cần gán thêm (mọi câu đã có Chương từ trước, hoặc không khớp Chương nào).",
    );
  }

  function loadParsed(parsed: ParsedExam, suggestedTitle?: string) {
    const withLocalIds = withIds(parsed, topics, lessons);
    setPart1(withLocalIds.part1);
    setPart2(withLocalIds.part2);
    setPart3(withLocalIds.part3);
    setWarnings(parsed.warnings);
    setClassifyStatus(null);
    if (suggestedTitle && !title) setTitle(suggestedTitle);
    // Gợi ý sẵn "Chương mà đề bao phủ" = hợp các chương AI đã gợi ý cho từng
    // câu (nếu có) — giáo viên xem lại/đổi ở bước xem trước, không tự động
    // chốt. Phân loại Chương/Bài giờ KHÔNG còn tự chạy ở đây nữa — xem nút
    // "Quét & gợi ý Chương/Bài bằng AI" ở màn xem trước (handleClassifyChapters).
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
  /**
   * Gọi AI phân tích 1 danh sách ảnh trang PDF đã render sẵn — dùng chung cho
   * cả lần đầu (handlePdfSelected) VÀ lần thử lại chỉ đúng đợt lỗi
   * (handleRetryFailedPdfChunks, thêm 31/08/2026), để không lặp lại logic rẽ
   * 3 nhánh: lỗi hẳn / thành công hết / thành công 1 phần.
   */
  /**
   * Kết thúc + in kết quả benchmark ra console (bảng dễ đọc) và lưu vào state
   * để hiện nút tải JSON — CHỈ khi benchmark đang bật (xem benchmarkEnabledRef
   * ở trên). Gọi ở MỌI điểm thoát của runPdfAnalysis (lỗi hẳn/1 phần/thành
   * công) để không bỏ sót số liệu dù đợt phân tích kết thúc kiểu gì.
   */
  function finishAndReportBenchmark(benchmark: ImportBenchmarkRecorder | undefined, fileBaseName: string) {
    if (!benchmark) return;
    const record = benchmark.finish(fileBaseName);
    // eslint-disable-next-line no-console
    console.log(`[import-benchmark] ${fileBaseName} — tổng thời gian: ${Math.round(record.totalImportMs)}ms`);
    // eslint-disable-next-line no-console
    console.table(record.pages);
    // eslint-disable-next-line no-console
    console.table(record.geminiCalls);
    // eslint-disable-next-line no-console
    console.log("[import-benchmark] summary", record.summary);
    // eslint-disable-next-line no-console
    console.log("[import-benchmark] structureConfident (khung dò cấu trúc THUẦN QUY TẮC có kích hoạt không):", record.structureConfident);
    setDebugBenchmark(record);
  }

  /** Tải bản ghi benchmark của lần import gần nhất thành file JSON — chỉ hiện khi debug đang bật (xem benchmarkEnabledRef). */
  function handleDownloadBenchmark() {
    if (!debugBenchmark) return;
    const blob = new Blob([JSON.stringify(debugBenchmark, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-benchmark-${debugBenchmark.fileName.replace(/\.pdf$/i, "")}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runPdfAnalysis(
    pageImages: PdfPageImage[],
    fileBaseName: string,
    previousResults?: ParsedExam[],
    benchmark?: ImportBenchmarkRecorder,
  ) {
    setAnalyzingProgress(`Đang gửi ${pageImages.length} trang cho AI phân tích...`);
    const { parsed, failedChunks, totalChunks, chunkErrors, chunkResults } = await parseExamFromPdfPages(
      pageImages,
      undefined,
      (done, total) =>
        setAnalyzingProgress(`Đang phân tích đợt ${done}/${total} (mỗi đợt khoảng 20-40 giây)...`),
      topics,
      lessons,
      previousResults,
      benchmark,
    );
    if (!parsed) {
      // Hiện đúng lý do thật (vd. "Google đang quá tải", "hết thời gian chờ"...)
      // thay vì 1 câu chung chung, để biết nên thử lại ngay hay chờ vài phút.
      const reason = chunkErrors[0] ?? "không rõ lý do";
      setError(
        `AI chưa phân tích được đề này: ${reason} Bạn có thể bấm thử lại (nhiều khả năng qua ngay nếu là lỗi tạm thời từ Google), hoặc dán JSON đã xử lý sẵn ở ô bên dưới.`,
      );
      setPdfPartialState(null);
      setStage("upload");
      finishAndReportBenchmark(benchmark, fileBaseName);
      return;
    }
    if (failedChunks > 0) {
      // ĐỔI 31/08/2026: trước đây tự động dùng luôn kết quả 1 phần + chỉ log
      // console.warn — giáo viên không biết đã mất câu nào để chủ động thử
      // lại. Giờ dừng ở màn hình riêng cho giáo viên tự chọn: thử lại CHỈ
      // đúng đợt lỗi (không tốn lại quota các đợt đã đúng), hoặc dùng luôn.
      setPdfPartialState({ pageImages, chunkResults, merged: parsed, totalChunks, chunkErrors, fileBaseName });
      setStage("pdf-partial");
      finishAndReportBenchmark(benchmark, fileBaseName);
      return;
    }
    setPdfPartialState(null);
    finishAndReportBenchmark(benchmark, fileBaseName);
    loadParsed(parsed, fileBaseName);
  }

  async function handlePdfSelected(file: File) {
    setError(null);
    setFileName(file.name);
    setStage("analyzing");
    const benchmark = benchmarkEnabledRef.current ? new ImportBenchmarkRecorder() : undefined;
    try {
      setAnalyzingProgress("Đang đọc văn bản và render từng trang PDF...");
      const pageImages = await renderPdfToImages(file, {}, benchmark);
      if (pageImages.length === 0) {
        setError("Không đọc được trang nào từ file PDF này. Hãy kiểm tra lại file rồi thử lại.");
        setStage("upload");
        return;
      }
      await runPdfAnalysis(pageImages, file.name.replace(/\.pdf$/i, ""), undefined, benchmark);
    } catch (err) {
      console.error(err);
      setError("Có lỗi khi đọc file PDF. Hãy chắc chắn đây là file PDF hợp lệ, không bị hỏng hoặc đặt mật khẩu.");
      setStage("upload");
    } finally {
      setAnalyzingProgress("");
    }
  }

  /** Thử lại CHỈ đúng các đợt bị lỗi ở lần phân tích trước (thêm 31/08/2026) — xem runPdfAnalysis/planChunkRetries. */
  async function handleRetryFailedPdfChunks() {
    if (!pdfPartialState) return;
    const { pageImages, chunkResults, fileBaseName } = pdfPartialState;
    setError(null);
    setStage("analyzing");
    const benchmark = benchmarkEnabledRef.current ? new ImportBenchmarkRecorder() : undefined;
    try {
      await runPdfAnalysis(pageImages, fileBaseName, chunkResults, benchmark);
    } catch (err) {
      console.error(err);
      setError("Có lỗi khi thử lại. Bạn có thể bấm thử lại lần nữa, hoặc dùng luôn kết quả hiện có.");
      setStage("pdf-partial");
    } finally {
      setAnalyzingProgress("");
    }
  }

  /** Bỏ qua các đợt lỗi, dùng luôn kết quả đã đọc được từ các đợt còn lại. */
  function handleUsePartialPdfResult() {
    if (!pdfPartialState) return;
    loadParsed(pdfPartialState.merged, pdfPartialState.fileBaseName);
    setPdfPartialState(null);
  }

  /** Cách dự phòng: đọc thẳng .docx bằng mammoth.js — không đọc được công thức MathType (xem wordImport.ts). */
  async function handleFileSelected(file: File) {
    setError(null);
    setFileName(file.name);
    setStage("analyzing");
    try {
      const { plainText, images, unsupportedImageCount } = await extractDocx(file);
      if (!plainText.trim() && images.length === 0) {
        setError("Không đọc được nội dung nào từ file này. Hãy thử lưu lại file .docx rồi tải lên lại.");
        setStage("upload");
        return;
      }
      const parsed = await parseExamFromDocument(plainText, images, topics, lessons);
      if (!parsed) {
        setError(
          "AI chưa phân tích được đề này (có thể do thiếu API key hoặc lỗi kết nối). Bạn có thể dán JSON đã xử lý sẵn ở ô bên dưới, hoặc thử lại.",
        );
        setStage("upload");
        return;
      }
      // THÊM 25/08/2026: báo cho giáo viên biết có ảnh (thường là bản vẽ OLE
      // dạng EMF/WMF — Visio, Excel, "Paste Special > Enhanced Metafile") đã
      // bị bỏ qua vì Gemini không đọc được định dạng này — xem wordImport.ts.
      // Không báo thì giáo viên không biết vì sao thiếu hình ở 1 vài câu.
      const warningsWithSkippedImages =
        unsupportedImageCount > 0
          ? [
              `Có ${unsupportedImageCount} hình ảnh (thường là bản vẽ/đồ thị dạng EMF/WMF, hay gặp khi dán từ Visio/Excel) không đọc tự động được — tìm dòng ghi chú "(có hình ảnh định dạng... không đọc tự động được)" ở bước xem trước để dán tay lại bằng Ctrl+V.`,
              ...parsed.warnings,
            ]
          : parsed.warnings;
      loadParsed({ ...parsed, warnings: warningsWithSkippedImages }, file.name.replace(/\.docx$/i, ""));
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

  /** (Thêm 31/08/2026) Kiểm tra hợp lệ rồi chuyển sang màn "Xem trước đề
   * thi" — bản dựng sẵn giống hệt đề thật (đáp án đúng đánh dấu rõ) để Thầy
   * Tường soát lại lần cuối trước khi ghi thật vào CSDL. handlePublish
   * (ghi CSDL thật) chỉ chạy khi bấm "Xác nhận xuất bản" ở màn preview đó,
   * không chạy trực tiếp từ màn chỉnh sửa nữa. */
  function handleGoToPreview() {
    if (!title.trim()) {
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
    setStage("preview");
  }

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
          lesson_id: q.lesson_id,
          topic_id: q.topic_id,
          ai_suggested_topic_id: q.ai_suggested_topic_id,
          difficulty: null,
          content_latex: q.content_latex,
          image_url: q.image_url,
          options: { choices: q.choices },
          correct_answer: { choice: q.correct_choice },
          solution_latex: q.solution_latex,
          default_points: null,
          ai_suggested_lesson_id: q.ai_suggested_lesson_id,
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
          lesson_id: q.lesson_id,
          topic_id: q.topic_id,
          ai_suggested_topic_id: q.ai_suggested_topic_id,
          difficulty: null,
          content_latex: q.content_latex,
          image_url: q.image_url,
          options: { items: q.items },
          correct_answer: q.correct,
          solution_latex: q.solution_latex,
          default_points: null,
          ai_suggested_lesson_id: q.ai_suggested_lesson_id,
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
          lesson_id: q.lesson_id,
          topic_id: q.topic_id,
          ai_suggested_topic_id: q.ai_suggested_topic_id,
          difficulty: null,
          content_latex: q.content_latex,
          image_url: q.image_url,
          options: {},
          correct_answer: { value: q.correct_value },
          solution_latex: q.solution_latex,
          default_points: q.points,
          ai_suggested_lesson_id: q.ai_suggested_lesson_id,
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
        {benchmarkEnabledRef.current && debugBenchmark && (
          <p className="empty-hint">
            [debug] Benchmark lần import gần nhất đã sẵn sàng —{" "}
            <button type="button" className="btn-link" onClick={handleDownloadBenchmark}>
              tải file JSON
            </button>{" "}
            (chi tiết cũng đã in ra console).
          </p>
        )}

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

  if (stage === "pdf-partial" && pdfPartialState) {
    const questionsRead =
      pdfPartialState.merged.part1.length +
      pdfPartialState.merged.part2.length +
      pdfPartialState.merged.part3.length;
    return (
      <div className="teacher-page">
        <h2>Một số đợt phân tích bị lỗi</h2>
        <p className="empty-hint">
          AI đã đọc được <strong>{questionsRead} câu</strong> từ các đợt thành công, nhưng{" "}
          <strong>
            {pdfPartialState.chunkErrors.length}/{pdfPartialState.totalChunks}
          </strong>{" "}
          đợt bị lỗi (thường là Google quá tải tạm thời — thử lại nhiều khả năng sẽ qua):
        </p>
        <ul className="empty-hint">
          {pdfPartialState.chunkErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        {benchmarkEnabledRef.current && debugBenchmark && (
          <p className="empty-hint">
            [debug] Benchmark lần import gần nhất đã sẵn sàng —{" "}
            <button type="button" className="btn-link" onClick={handleDownloadBenchmark}>
              tải file JSON
            </button>{" "}
            (chi tiết cũng đã in ra console).
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="form-row" style={{ flexDirection: "row", gap: 12 }}>
          <button className="btn-primary" onClick={handleRetryFailedPdfChunks}>
            Thử lại các đợt lỗi
          </button>
          <button className="btn-secondary" onClick={handleUsePartialPdfResult} disabled={questionsRead === 0}>
            Dùng luôn kết quả hiện có
          </button>
        </div>
        <p className="ai-hint" style={{ marginTop: 12 }}>
          Thử lại CHỈ gọi AI lại cho đúng {pdfPartialState.chunkErrors.length} đợt bị lỗi — các đợt đã đọc đúng được
          giữ nguyên, không tốn thêm thời gian/lượt gọi AI.
        </p>
      </div>
    );
  }

  if (stage === "preview") {
    const topicName = (id: string | null) => topics.find((t) => t.id === id)?.name ?? null;
    const lessonName = (id: string | null) => lessons.find((l) => l.id === id)?.name ?? null;
    const folderName = folders.find((f) => f.id === folderId)?.name ?? null;
    const termName = terms.find((t) => t.id === termId)?.name ?? null;
    const coveredTopicNames = topics
      .filter((t) => selectedExamTopicIds.has(t.id))
      .map((t) => `Lớp ${t.grade} · ${t.name}`);
    const includeCustom = scoringMode === "tuy_chinh" && customScoringMethod === "thu_cong";
    const totalQuestions = part1.length + part2.length + part3.length;
    // Điểm mỗi câu Phần 1 khi chế độ "tự động chia đều" (Đợt 3) — chỉ để
    // hiện gợi ý ở màn preview, KHÔNG tính lại barem chuẩn THPT ở đây (barem
    // chuẩn giữ nguyên logic ở src/lib/scoring.ts, không lặp lại tại đây).
    const autoPointsPerQuestion = totalQuestions > 0 ? 10 / totalQuestions : 0;
    const part1Points = (id: string) =>
      !includeCustom && scoringMode === "chuan_thpt"
        ? null // barem chuẩn cố định 0.25đ/câu — khỏi hiện lại cho rối
        : includeCustom
          ? customPoints[id]
            ? `${customPoints[id]} điểm`
            : "chưa nhập điểm"
          : `${autoPointsPerQuestion.toFixed(2)} điểm (tự động)`;

    return (
      <div className="teacher-page">
        <h2>Xem trước đề thi</h2>
        <p className="empty-hint">
          Bản dựng sẵn giống hệt đề thật (đáp án đúng được đánh dấu để Thầy kiểm tra) — CHƯA lưu vào hệ
          thống. Soát lại kỹ rồi mới bấm "Xác nhận xuất bản" ở cuối trang.
        </p>

        <div className="hover-card section-card">
          <div className="section-card-head">
            <h3>Thông tin đề thi</h3>
          </div>
          <div className="field-grid">
            <p>
              <strong>Tên đề:</strong> {title}
            </p>
            {description.trim() && (
              <p>
                <strong>Mô tả:</strong> {description}
              </p>
            )}
            <p>
              <strong>Khối:</strong> {grade ? `Lớp ${grade}` : "— chưa chọn —"}
            </p>
            <p>
              <strong>Thời gian làm bài:</strong> {durationMinutes ? `${durationMinutes} phút` : "Không giới hạn"}
            </p>
            <p>
              <strong>Chế độ phòng thi:</strong> {mode === "nghiem_tuc" ? "Nghiêm túc" : "Thoải mái"}
            </p>
            <p>
              <strong>Chế độ tính điểm:</strong>{" "}
              {scoringMode === "chuan_thpt"
                ? "Chuẩn THPT (barem chính thức)"
                : `Tuỳ chỉnh — ${customScoringMethod === "thu_cong" ? "thủ công (tự nhập điểm từng câu)" : "tự động chia đều 10đ"}`}
            </p>
            {termName && (
              <p>
                <strong>Chương trình/kỳ thi:</strong> {termName}
              </p>
            )}
            {folderName && (
              <p>
                <strong>Thư mục:</strong> {folderName}
              </p>
            )}
            {driveLink.trim() && (
              <p>
                <strong>Link Drive:</strong> {driveLink}
              </p>
            )}
            <p>
              <strong>Chương bao phủ:</strong>{" "}
              {coveredTopicNames.length > 0 ? coveredTopicNames.join(", ") : "— chưa chọn —"}
            </p>
            <p>
              <strong>Số câu:</strong> {part1.length} câu Phần 1 · {part2.length} câu Phần 2 · {part3.length}{" "}
              câu Phần 3 ({totalQuestions} câu)
            </p>
          </div>
        </div>

        {part1.length > 0 && (
          <section>
            <h3 className="part-title">Phần 1 — Trắc nghiệm 4 phương án ({part1.length} câu)</h3>
            {part1.map((q, i) => (
              <Part1PreviewCard
                key={q.id}
                number={i + 1}
                q={q}
                topicName={topicName(q.topic_id)}
                lessonName={lessonName(q.lesson_id)}
                pointsLabel={part1Points(q.id)}
              />
            ))}
          </section>
        )}

        {part2.length > 0 && (
          <section>
            <h3 className="part-title">Phần 2 — Đúng/Sai ({part2.length} câu)</h3>
            {part2.map((q, i) => (
              <Part2PreviewCard
                key={q.id}
                number={part1.length + i + 1}
                q={q}
                topicName={topicName(q.topic_id)}
                lessonName={lessonName(q.lesson_id)}
                pointsLabel={
                  includeCustom
                    ? customPart2Points[q.id]
                      ? `${(["a", "b", "c", "d"] as const).map((k) => customPart2Points[q.id]?.[k] || "?").join("/")} điểm`
                      : customPoints[q.id]
                        ? `${customPoints[q.id]} điểm`
                        : "chưa nhập điểm"
                    : scoringMode === "tuy_chinh"
                      ? `${autoPointsPerQuestion.toFixed(2)} điểm (tự động)`
                      : null
                }
              />
            ))}
          </section>
        )}

        {part3.length > 0 && (
          <section>
            <h3 className="part-title">Phần 3 — Trả lời ngắn ({part3.length} câu)</h3>
            {part3.map((q, i) => (
              <Part3PreviewCard
                key={q.id}
                number={part1.length + part2.length + i + 1}
                q={q}
                topicName={topicName(q.topic_id)}
                lessonName={lessonName(q.lesson_id)}
              />
            ))}
          </section>
        )}

        <div className="hover-card sticky-footer">
          <div className="sticky-footer-info">{totalQuestions} câu — đã sẵn sàng xuất bản</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-secondary" onClick={() => setStage("review")}>
              ← Quay lại chỉnh sửa
            </button>
            <button className="btn-primary" onClick={handlePublish} disabled={publishing}>
              {publishing ? "Đang xuất bản..." : "Xác nhận xuất bản"}
            </button>
          </div>
        </div>
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
          <div className="section-card-head-sub">
            Bấm để AI quét toàn bộ câu hỏi và tự gán gợi ý Chương/Bài — câu nào Thầy đã tự chọn tay sẽ được giữ nguyên.
          </div>
        </div>
        <div className="form-row" style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClassifyChapters}
            disabled={classifyingChapters}
          >
            {classifyingChapters ? "Đang phân loại..." : "🔍 Quét & gợi ý Chương/Bài bằng AI"}
          </button>
          {classifyStatus && <span className="empty-hint">{classifyStatus}</span>}
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
            <label>Chương mà đề này bao phủ (tự chọn tay, hoặc bấm "Quét & gợi ý Chương/Bài bằng AI" ở trên)</label>
            {/* Chưa chọn Khối cho đề thì hiện đủ Chương của cả 3 khối 10/11/12 —
                nhóm theo Khối (đã sắp sẵn theo grade rồi order_index từ
                api.listTopics) để dễ tìm thay vì 1 danh sách phẳng ~24 dòng
                lẫn lộn cả 3 khối (thêm 31/08/2026, phản hồi từ Thầy Tường).
                Đã chọn Khối rồi thì displayTopics chỉ còn đúng 1 khối, không
                cần tiêu đề nhóm nữa. */}
            <div className="pickable-list" style={{ maxHeight: 260, overflowY: "auto" }}>
              {displayTopics.map((t, i) => {
                const showGroupHeader = !grade && (i === 0 || displayTopics[i - 1].grade !== t.grade);
                return (
                  <div key={t.id}>
                    {showGroupHeader && (
                      <div className="pickable-group-label">Lớp {t.grade}</div>
                    )}
                    <label className="pickable-item">
                      <input
                        type="checkbox"
                        checked={selectedExamTopicIds.has(t.id)}
                        onChange={() => toggleExamTopic(t.id)}
                      />
                      {t.name}
                    </label>
                  </div>
                );
              })}
              {displayTopics.length === 0 && (
                <p className="empty-hint">
                  Chưa có Chương nào trong khung kiến thức — nếu vừa cập nhật
                  lên bản có "Bài" (31/08/2026), cần chạy
                  migration_016_lop_chuong_bai.sql trên Supabase trước (xem SETUP.md).
                </p>
              )}
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
                    <label>Chương</label>
                    <select
                      value={q.topic_id ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setPart1((prev) =>
                          prev.map((x) => (x.id === q.id ? { ...x, topic_id: v, lesson_id: null } : x)),
                        );
                      }}
                    >
                      <option value="">— Chưa chọn —</option>
                      {displayTopics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Bài</label>
                    <select
                      value={q.lesson_id ?? ""}
                      disabled={!q.topic_id}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setPart1((prev) => prev.map((x) => (x.id === q.id ? { ...x, lesson_id: v } : x)));
                      }}
                    >
                      <option value="">{q.topic_id ? "— Chưa chọn —" : "— Chọn chương trước —"}</option>
                      {lessons
                        .filter((l) => l.topic_id === q.topic_id)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
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
                    <label>Chương</label>
                    <select
                      value={q.topic_id ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setPart2((prev) =>
                          prev.map((x) => (x.id === q.id ? { ...x, topic_id: v, lesson_id: null } : x)),
                        );
                      }}
                    >
                      <option value="">— Chưa chọn —</option>
                      {displayTopics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Bài</label>
                    <select
                      value={q.lesson_id ?? ""}
                      disabled={!q.topic_id}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setPart2((prev) => prev.map((x) => (x.id === q.id ? { ...x, lesson_id: v } : x)));
                      }}
                    >
                      <option value="">{q.topic_id ? "— Chưa chọn —" : "— Chọn chương trước —"}</option>
                      {lessons
                        .filter((l) => l.topic_id === q.topic_id)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
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
                    <label>Chương</label>
                    <select
                      value={q.topic_id ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setPart3((prev) =>
                          prev.map((x) => (x.id === q.id ? { ...x, topic_id: v, lesson_id: null } : x)),
                        );
                      }}
                    >
                      <option value="">— Chưa chọn —</option>
                      {displayTopics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Bài</label>
                    <select
                      value={q.lesson_id ?? ""}
                      disabled={!q.topic_id}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setPart3((prev) => prev.map((x) => (x.id === q.id ? { ...x, lesson_id: v } : x)));
                      }}
                    >
                      <option value="">{q.topic_id ? "— Chưa chọn —" : "— Chọn chương trước —"}</option>
                      {lessons
                        .filter((l) => l.topic_id === q.topic_id)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
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
          <button className="btn-primary" onClick={handleGoToPreview}>
            Xem trước & xuất bản →
          </button>
        </div>
      </div>
    </div>
  );
}
