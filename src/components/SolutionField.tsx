import { useRef, useState } from "react";
import * as api from "../lib/api";
import { MathText, insertImageToken } from "./MathText";

/**
 * Ô nhập LỜI GIẢI CHI TIẾT (thủ công) — dùng chung cho màn hình xem trước khi
 * tạo đề (TeacherExamImport) và form nhập câu hỏi lẻ (QuestionEditorForm).
 *
 * Vì sao có component này (30/08/2026): từ nay AI KHÔNG còn tự trích lời giải
 * khi đọc đề nữa (bỏ đi để mỗi đợt gọi AI nhẹ và nhanh hơn nhiều — xem ghi
 * chú ở buildExamParseFromImagesPrompt trong ai.ts), nên phần nhập tay trở
 * thành đường DUY NHẤT để có lời giải. Trước đây nó chỉ là 1 cái <textarea>
 * trơ, gõ công thức không thấy đúng/sai, và không có cách nào đưa hình vào.
 * Ba thứ được thêm ở đây, đều nhằm làm việc nhập tay đủ nhanh để thay thế
 * được phần AI đã bỏ:
 *
 *  1. DÁN ẢNH BẰNG Ctrl+V ngay trong ô chữ: giải xong trên giấy/bảng/máy
 *     tính, chụp màn hình (Win + Shift + S) rồi Ctrl+V thẳng vào đúng chỗ
 *     đang gõ — ảnh tự tải lên và chèn vào ngay vị trí con trỏ. Dùng chung
 *     đúng kho ảnh với ImageUploadField đang có sẵn (api.uploadQuestionImage),
 *     không phát sinh gì mới ở CSDL: ảnh nằm ngay trong chuỗi lời giải dưới
 *     dạng ![](địa-chỉ) — xem MathText.tsx.
 *  2. XEM TRƯỚC NGAY BÊN DƯỚI: công thức LaTeX và ảnh hiện ra đúng như học
 *     sinh sẽ thấy, gõ sai là biết ngay chứ không phải lưu rồi mới phát hiện.
 *  3. NHẮC CÚ PHÁP ngắn gọn ngay tại chỗ, để không phải nhớ quy ước $...$.
 */
export function SolutionField({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadAndInsert(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh quá lớn (tối đa 5MB) — thử chụp lại vùng nhỏ hơn.");
      return;
    }
    setError(null);
    setUploading(true);
    // Nhớ vị trí con trỏ TRƯỚC khi chờ tải ảnh: trong lúc chờ, giáo viên có
    // thể bấm đi chỗ khác làm mất vị trí, lúc đó chèn vào cuối là hợp lý nhất.
    const cursorIndex = textareaRef.current?.selectionStart ?? value.length;
    try {
      const url = await api.uploadQuestionImage(file);
      onChange(insertImageToken(value, cursorIndex, url));
    } catch (err) {
      console.error(err);
      setError("Tải ảnh lên thất bại, thử lại.");
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          // Chặn hành vi dán mặc định, nếu không trình duyệt sẽ dán thêm phần
          // văn bản đi kèm ảnh (một số app chụp màn hình có kèm) vào ô chữ.
          e.preventDefault();
          void uploadAndInsert(file);
        }
        return;
      }
    }
    // Không có ảnh trong clipboard — để trình duyệt dán chữ như bình thường.
  }

  return (
    <div className="solution-field">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        placeholder="Gõ lời giải ở đây. Công thức đặt trong $...$ — ví dụ: Ta có $x^2 - 3x + 2 = 0 \Leftrightarrow x = 1$ hoặc $x = 2$."
      />
      <p className="empty-hint">
        Công thức viết bằng LaTeX đặt giữa <code>$...$</code> (công thức riêng một dòng thì dùng{" "}
        <code>$$...$$</code>). Chụp màn hình rồi <strong>Ctrl+V</strong> ngay trong ô này để chèn
        hình vào đúng chỗ con trỏ đang đứng.
      </p>
      {uploading && <p className="empty-hint">Đang tải ảnh lên...</p>}
      {error && <p className="form-error">{error}</p>}
      {value.trim() && (
        <div className="q-editor-preview">
          <MathText text={value} />
        </div>
      )}
    </div>
  );
}
