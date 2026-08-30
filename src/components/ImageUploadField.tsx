import { useState } from "react";
import * as api from "../lib/api";

/** Ô chọn/tải ảnh minh hoạ (bảng biến thiên, đồ thị...) cho 1 câu hỏi, dùng chung
 * cho form nhập câu hỏi thủ công và màn hình xem trước khi tạo đề từ Word. */
export function ImageUploadField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Chỉ chọn được file ảnh (png, jpg, ...).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh quá lớn (tối đa 5MB) — thử chụp/lưu lại ảnh nhỏ hơn.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await api.uploadQuestionImage(file);
      onChange(url);
    } catch (err) {
      console.error(err);
      setError("Tải ảnh lên thất bại, thử lại.");
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
        }
        return;
      }
    }
  }

  return (
    <div className="image-upload-field">
      {value && (
        <div className="image-upload-preview">
          <img src={value} alt="Ảnh minh hoạ câu hỏi" />
          <button type="button" className="btn-link btn-danger" onClick={() => onChange(null)}>
            Bỏ ảnh
          </button>
        </div>
      )}
      <div
        className="image-upload-pastezone"
        tabIndex={0}
        role="button"
        onPaste={handlePaste}
      >
        Bấm vào đây rồi dán ảnh (Ctrl+V) — hoặc chọn file bên dưới
      </div>
      <input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {uploading && <span className="empty-hint">Đang tải ảnh lên...</span>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
