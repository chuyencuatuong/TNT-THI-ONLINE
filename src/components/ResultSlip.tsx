import type { AttemptDiagnostics } from "../lib/api";
import { BLANK_REASON_LABELS, MASTERY_LABELS, type MasteryLabel } from "../lib/diagnosis";
import type { AttemptScoreRow } from "../lib/types";

/**
 * "Phiếu kết quả thi & phân tích năng lực" — bản in gọn, học sinh tự tải về
 * bằng nút "Tải phiếu kết quả" trên ResultPage.tsx (gọi window.print()).
 *
 * QUYẾT ĐỊNH THIẾT KẾ (đợt làm mới trang kết quả, 24/08/2026): dùng
 * `@media print` + window.print() thay vì thư viện tạo PDF (jsPDF/
 * html2canvas) — không thêm dependency, chữ và công thức giữ dạng vector sắc
 * nét (rasterize qua canvas dễ mờ dấu tiếng Việt), ít rủi ro bảo trì. Đánh
 * đổi: học sinh cần chọn "Lưu thành PDF" trong hộp thoại in của trình duyệt
 * thay vì tải file 1 chạm — chấp nhận được cho công cụ nội bộ.
 *
 * Component này LUÔN nằm trong DOM nhưng ẩn (class .result-slip có
 * display:none mặc định trong styles.css) — chỉ hiện ra khi in (@media
 * print), lúc đó toàn bộ phần còn lại của trang bị ẩn qua kỹ thuật
 * visibility:hidden (xem styles.css) để bản in chỉ còn đúng nội dung phiếu.
 * Vì vậy component KHÔNG tự tính toán lại gì — chỉ trình bày lại dữ liệu
 * ResultPage.tsx đã tải sẵn (điểm, chẩn đoán theo chương, câu bỏ trống).
 */

const MASTERY_SHORT_NOTE: Record<MasteryLabel, string> = {
  vung: "Nắm vững — duy trì nhịp độ ôn tập hiện tại.",
  chua_chac_chan: "Đúng nhưng chưa nhanh/chắc — luyện thêm để phản xạ tự tin hơn.",
  co_lo_hong: "Còn thiếu sót — nên xem lại lý thuyết và làm thêm bài tương tự.",
  mat_goc: "Cần ôn lại kiến thức nền của chương này trước khi luyện tiếp.",
  chua_du_du_lieu: "Chưa đủ câu hỏi thuộc chương này để đánh giá đáng tin cậy.",
};

export interface ResultSlipProps {
  studentName: string;
  studentClass?: string | null;
  examTitle: string;
  attemptDateLabel: string;
  score: AttemptScoreRow;
  diagnostics: AttemptDiagnostics | null;
  generatedAtLabel: string;
}

export function ResultSlip({
  studentName,
  studentClass,
  examTitle,
  attemptDateLabel,
  score,
  diagnostics,
  generatedAtLabel,
}: ResultSlipProps) {
  const chapterRows = (diagnostics?.byTopic ?? []).filter((t) => t.label !== "chua_du_du_lieu");
  const blank = diagnostics?.blankQuestions;

  return (
    <div className="result-slip">
      <div className="result-slip-header">
        <div className="result-slip-brand">Toán học TNT</div>
        <div className="result-slip-title">Phiếu kết quả thi &amp; phân tích năng lực</div>
      </div>

      <table className="result-slip-info">
        <tbody>
          <tr>
            <td>Học sinh</td>
            <td>
              {studentName}
              {studentClass ? ` — Lớp ${studentClass}` : ""}
            </td>
          </tr>
          <tr>
            <td>Đề thi</td>
            <td>{examTitle}</td>
          </tr>
          <tr>
            <td>Ngày làm bài</td>
            <td>{attemptDateLabel}</td>
          </tr>
        </tbody>
      </table>

      <div className="result-slip-score">
        <div className="result-slip-score-total">{score.total_score.toFixed(2)} / 10</div>
        <table className="result-slip-score-table">
          <tbody>
            <tr>
              <td>Phần 1 — Trắc nghiệm 4 phương án</td>
              <td>{score.part1_score.toFixed(2)} điểm</td>
            </tr>
            <tr>
              <td>Phần 2 — Đúng - Sai</td>
              <td>{score.part2_score.toFixed(2)} điểm</td>
            </tr>
            <tr>
              <td>Phần 3 — Trả lời ngắn</td>
              <td>{score.part3_score.toFixed(2)} điểm</td>
            </tr>
          </tbody>
        </table>
      </div>

      {chapterRows.length > 0 && (
        <div className="result-slip-section">
          <h3>Phân tích năng lực theo chương</h3>
          <table className="result-slip-table">
            <thead>
              <tr>
                <th>Chương</th>
                <th>Mức độ</th>
                <th>Độ chính xác</th>
                <th>Nhận xét</th>
              </tr>
            </thead>
            <tbody>
              {chapterRows.map((t) => (
                <tr key={t.topic_id}>
                  <td>{t.topic_name}</td>
                  <td>{MASTERY_LABELS[t.label]}</td>
                  <td>{(t.avgScoreRatio * 100).toFixed(0)}%</td>
                  <td>{MASTERY_SHORT_NOTE[t.label]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {blank && blank.totalBlank > 0 && (
        <div className="result-slip-section">
          <h3>Câu bỏ trống ({blank.totalBlank} câu)</h3>
          <p>
            {blank.timeoutCount > 0 &&
              `${blank.timeoutCount} câu chưa kịp xem (${BLANK_REASON_LABELS.chua_kip_doc.toLowerCase()})`}
            {blank.timeoutCount > 0 && blank.skippedCount > 0 && " · "}
            {blank.skippedCount > 0 &&
              `${blank.skippedCount} câu đã xem nhưng bỏ qua (${BLANK_REASON_LABELS.doc_roi_bo_qua.toLowerCase()})`}
          </p>
        </div>
      )}

      <p className="result-slip-disclaimer">
        Chẩn đoán năng lực dựa trên quy tắc heuristic đơn giản (độ chính xác, thời gian làm bài,
        số lần đổi đáp án), không phải kết luận chuyên môn tuyệt đối — dùng để gợi ý hướng ôn tập.
      </p>

      <div className="result-slip-footer">Xuất từ hệ thống Toán học TNT · {generatedAtLabel}</div>
    </div>
  );
}
