import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { extractDocx } from "../lib/wordImport";
import { renderPdfToImages } from "../lib/pdfImport";
import {
  extractQuestionTypesFromDocument,
  extractQuestionTypesFromPdfPages,
  type ExtractedQuestionTypeCandidate,
} from "../lib/ai";
import type { QuestionType, Topic } from "../lib/types";

/**
 * Bước A (Learning Lab, chốt 24/08/2026) — nạp "tài liệu dạng bài tập" (khác
 * hẳn đề thi) để AI trích ra danh sách dạng bài theo chương, giáo viên xem
 * lại/sửa/xoá từng dạng rồi mới lưu vào question_types. Đây là bước NỀN cho
 * Bước B (gợi ý dạng bài khi nhập đề mới ở TeacherExamImport, dùng
 * suggestQuestionType() đối chiếu với danh sách đã xây ở đây).
 */

let localIdCounter = 0;
function nextLocalId() {
  localIdCounter += 1;
  return `qt-local-${localIdCounter}`;
}

interface EditableCandidate extends ExtractedQuestionTypeCandidate {
  id: string;
  selected: boolean;
  /** true nếu đã có 1 dạng cùng tên (không phân biệt hoa/thường) trong question_types của chương này — không tự chặn, chỉ cảnh báo, giáo viên quyết định. */
  alreadyExists: boolean;
}

export function TeacherQuestionTypeImport() {
  const [stage, setStage] = useState<"upload" | "analyzing" | "review">("upload");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [existingTypes, setExistingTypes] = useState<QuestionType[]>([]);
  const [topicId, setTopicId] = useState("");
  const [fileName, setFileName] = useState("");
  const [analyzingProgress, setAnalyzingProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    api.listTopics().then(setTopics).catch(console.error);
    api.listQuestionTypes().then(setExistingTypes).catch(console.error);
  }, []);

  const selectedTopic = topics.find((t) => t.id === topicId) ?? null;

  function withIds(result: { candidates: ExtractedQuestionTypeCandidate[]; warnings: string[] }) {
    const existingNamesLower = new Set(
      existingTypes.filter((t) => t.topic_id === topicId).map((t) => t.name.trim().toLowerCase()),
    );
    setWarnings(result.warnings);
    setCandidates(
      result.candidates.map((c) => ({
        ...c,
        id: nextLocalId(),
        selected: !existingNamesLower.has(c.name.trim().toLowerCase()),
        alreadyExists: existingNamesLower.has(c.name.trim().toLowerCase()),
      })),
    );
    setStage("review");
  }

  /** Cách chính (khuyến nghị) — cùng cơ chế văn bản thật + ảnh trang như TeacherExamImport, chính xác hơn với công thức/bảng biến thiên. */
  async function handlePdfSelected(file: File) {
    if (!topicId) {
      setError("Chọn chương trước khi tải file lên.");
      return;
    }
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
      const { taxonomy, chunkErrors } = await extractQuestionTypesFromPdfPages(
        pageImages,
        selectedTopic?.name ?? null,
        undefined,
        (done, total) => setAnalyzingProgress(`Đang phân tích đợt ${done}/${total}...`),
      );
      if (!taxonomy) {
        const reason = chunkErrors[0] ?? "không rõ lý do";
        setError(`AI chưa trích được dạng bài nào: ${reason} Thử lại (nhiều khả năng qua ngay nếu là lỗi tạm thời).`);
        setStage("upload");
        return;
      }
      withIds(taxonomy);
    } catch (err) {
      console.error(err);
      setError("Có lỗi khi đọc file PDF. Hãy chắc chắn đây là file PDF hợp lệ, không bị hỏng hoặc đặt mật khẩu.");
      setStage("upload");
    } finally {
      setAnalyzingProgress("");
    }
  }

  /** Dự phòng — đọc thẳng .docx, không đọc được công thức MathType (xem wordImport.ts). */
  async function handleDocxSelected(file: File) {
    if (!topicId) {
      setError("Chọn chương trước khi tải file lên.");
      return;
    }
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
      const taxonomy = await extractQuestionTypesFromDocument(plainText, images, selectedTopic?.name ?? null);
      // Xem chú thích ở TeacherExamImport.tsx — cùng lý do: báo cho giáo viên
      // biết có ảnh (thường EMF/WMF từ Visio/Excel) không đọc tự động được.
      withIds(
        unsupportedImageCount > 0
          ? {
              ...taxonomy,
              warnings: [
                `Có ${unsupportedImageCount} hình ảnh (thường là bản vẽ/đồ thị dạng EMF/WMF, hay gặp khi dán từ Visio/Excel) không đọc tự động được — tìm dòng ghi chú "(có hình ảnh định dạng... không đọc tự động được)" ở bước xem trước để dán tay lại bằng Ctrl+V.`,
                ...taxonomy.warnings,
              ],
            }
          : taxonomy,
      );
    } catch (err) {
      console.error(err);
      setError("Có lỗi khi đọc file .docx. Hãy chắc chắn đây là file Word hợp lệ (.docx, không phải .doc cũ).");
      setStage("upload");
    }
  }

  function handleFilePicked(file: File) {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      handlePdfSelected(file);
    } else {
      handleDocxSelected(file);
    }
  }

  function updateCandidate(id: string, patch: Partial<EditableCandidate>) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleSave() {
    const toSave = candidates.filter((c) => c.selected && c.name.trim());
    if (toSave.length === 0) {
      alert("Chưa chọn dạng bài nào để lưu.");
      return;
    }
    setSaving(true);
    setSavedCount(0);
    try {
      for (const c of toSave) {
        await api.createQuestionType({
          topic_id: topicId,
          name: c.name.trim(),
          description: c.description.trim() || null,
        });
        setSavedCount((n) => n + 1);
      }
      const refreshed = await api.listQuestionTypes();
      setExistingTypes(refreshed);
      setCandidates((prev) => prev.filter((c) => !toSave.includes(c)));
      alert(`Đã lưu ${toSave.length} dạng bài vào chương "${selectedTopic?.name}".`);
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi lưu — 1 số dạng có thể đã lưu, kiểm tra lại Ngân hàng câu hỏi trước khi thử lại phần còn thiếu.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStage("upload");
    setFileName("");
    setError(null);
    setWarnings([]);
    setCandidates([]);
    setSavedCount(0);
  }

  if (stage === "upload") {
    return (
      <div className="teacher-page">
        <h2>Nạp tài liệu dạng bài tập</h2>
        <p className="empty-hint">
          Tải lên 1 file "tài liệu dạng bài tập" (khác với đề thi) — AI sẽ đọc và trích ra danh
          sách dạng bài có trong tài liệu (dựa theo các tiêu đề "Dạng 1: ...", "Dạng 2: ..." nếu
          có), bạn xem lại/sửa/xoá trước khi lưu vào hệ thống. Ưu tiên tải file <strong>PDF</strong>{" "}
          (đọc chính xác công thức/bảng biến thiên hơn file Word).
        </p>

        <div className="filter-row">
          <label>Chương của tài liệu này:</label>
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">-- Chọn chương --</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (Lớp {t.grade})
              </option>
            ))}
          </select>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div style={{ marginTop: 16 }}>
          <input
            type="file"
            accept=".pdf,.docx"
            disabled={!topicId}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFilePicked(file);
              e.target.value = "";
            }}
          />
          {!topicId && <p className="empty-hint">Chọn chương ở trên trước khi chọn file.</p>}
        </div>
      </div>
    );
  }

  if (stage === "analyzing") {
    return (
      <div className="teacher-page">
        <h2>Nạp tài liệu dạng bài tập</h2>
        <p className="page-loading">
          Đang phân tích "{fileName}"... {analyzingProgress}
        </p>
      </div>
    );
  }

  // stage === "review"
  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <h2>Xem lại dạng bài AI trích ra — {selectedTopic?.name}</h2>
        <button className="btn-secondary" onClick={reset}>
          Nạp file khác
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="empty-hint">
          <strong>Lưu ý:</strong>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {candidates.length === 0 ? (
        <p className="empty-hint">
          AI không trích được dạng bài nào từ file này — có thể tài liệu không theo cấu trúc quen
          thuộc. Thử nạp lại file khác hoặc kiểm tra file gốc.
        </p>
      ) : (
        <div className="question-list">
          {candidates.map((c) => (
            <div key={c.id} className="question-list-item">
              <div className="question-list-meta">
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={(e) => updateCandidate(c.id, { selected: e.target.checked })}
                  />
                  Lưu dạng này
                </label>
                {c.alreadyExists && (
                  <span className="tag tag--muted">Đã có dạng trùng tên trong chương này</span>
                )}
              </div>
              <input
                type="text"
                value={c.name}
                onChange={(e) => updateCandidate(c.id, { name: e.target.value })}
                style={{ fontWeight: 600, width: "100%", marginBottom: 6 }}
              />
              <textarea
                value={c.description}
                onChange={(e) => updateCandidate(c.id, { description: e.target.value })}
                rows={2}
                style={{ width: "100%" }}
                placeholder="Mô tả ngắn đặc điểm nhận diện dạng này..."
              />
              {c.example_summary && (
                <p className="empty-hint">Ví dụ trong tài liệu: {c.example_summary}</p>
              )}
              <button className="btn-link btn-danger" onClick={() => removeCandidate(c.id)}>
                Xoá khỏi danh sách
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="page-header-row" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving || candidates.length === 0}>
          {saving
            ? `Đang lưu (${savedCount}/${candidates.filter((c) => c.selected).length})...`
            : `Lưu ${candidates.filter((c) => c.selected).length} dạng đã chọn`}
        </button>
      </div>
    </div>
  );
}
