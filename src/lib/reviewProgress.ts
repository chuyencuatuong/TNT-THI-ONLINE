/**
 * Lưu tiến trình 1 buổi ôn tập câu sai vào localStorage — để mở lại trang
 * sau khi thoát/tải lại giữa chừng vẫn TIẾP TỤC ĐÚNG CHỖ ĐANG DỞ, thay vì
 * phải xáo lại từ đầu như trước đây (cải tiến sau audit thực tế, mục 7 —
 * "chia ra 3 đợt, lỡ mệt rồi thoát ra thì bị mất tiến trình đang làm").
 *
 * Dữ liệu ĐÚNG/SAI từng câu luôn an toàn trong CSDL ngay khi trả lời
 * (api.submitReviewAnswer gọi ngay sau khi bấm "Kiểm tra") — cái lưu ở đây
 * chỉ là "con trỏ vị trí đang làm dở" của RIÊNG THIẾT BỊ NÀY (câu nào đã
 * chọn để ôn, đã làm tới câu thứ mấy, tally tạm), không cần đồng bộ giữa các
 * thiết bị nên dùng localStorage đơn giản, không cần thêm bảng CSDL/RLS mới.
 * Đánh đổi: đổi thiết bị hoặc xoá dữ liệu trình duyệt sẽ mất "con trỏ" này
 * (phải xáo lại từ đầu), nhưng KHÔNG mất dữ liệu đúng/sai đã ghi.
 *
 * `storage` (tham số cuối, mặc định `localStorage`) cho phép truyền vào 1
 * đối tượng giả lập trong unit test — tách phần thuần (validate/serialize)
 * khỏi phần thực sự chạm trình duyệt, theo đúng tinh thần "hàm thuần dễ
 * test" đã dùng xuyên suốt các file lib/ khác trong dự án.
 */

export interface ReviewProgressState {
  studentId: string;
  sessionId: string;
  /** Toàn bộ id câu ĐÃ CHỌN để ôn trong buổi này, theo đúng thứ tự đã xáo —
   * chia lại thành từng đợt bằng reviewBatching.ts (splitIntoBatches) luôn
   * cho kết quả giống hệt vì đó là hàm thuần, không cần lưu riêng cấu trúc
   * đợt. */
  questionIds: string[];
  /** Số câu đã làm XONG (đã bấm "Kiểm tra" + chuyển sang câu kế) — nguồn sự
   * thật DUY NHẤT cho vị trí hiện tại, xem reviewBatching.ts (locateInBatches). */
  answeredCount: number;
  tally: { correct: number; wrong: number };
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY_PREFIX = "tnt_review_progress:";

function storageKey(studentId: string): string {
  return `${STORAGE_KEY_PREFIX}${studentId}`;
}

function defaultStorage(): ProgressStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // localStorage có thể bị chặn hoàn toàn (1 số chế độ riêng tư nghiêm ngặt) —
    // coi như không có nơi lưu, không phải lỗi.
    return null;
  }
}

/** Kiểm tra 1 giá trị đọc từ localStorage (đã JSON.parse) có đúng hình dạng
 * ReviewProgressState hay không — dữ liệu cũ/hỏng/từ phiên bản khác bị coi
 * là "không có gì" (an toàn, không throw, không làm hỏng luồng ôn tập). */
export function isValidReviewProgress(value: unknown): value is ReviewProgressState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.studentId !== "string" || typeof v.sessionId !== "string") return false;
  if (!Array.isArray(v.questionIds) || !v.questionIds.every((id) => typeof id === "string")) {
    return false;
  }
  if (typeof v.answeredCount !== "number" || v.answeredCount < 0) return false;
  const tally = v.tally as Record<string, unknown> | undefined;
  if (!tally || typeof tally.correct !== "number" || typeof tally.wrong !== "number") {
    return false;
  }
  return true;
}

export function saveReviewProgress(
  state: ReviewProgressState,
  storage: ProgressStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(state.studentId), JSON.stringify(state));
  } catch {
    // Xem ghi chú đầu file — mất khả năng lưu chỉ mất tiện lợi "tiếp tục
    // đúng chỗ", không ảnh hưởng gì tới buổi ôn tập đang diễn ra.
  }
}

/** studentId truyền vào PHẢI khớp với state.studentId đã lưu — tự bỏ qua
 * (trả về null) nếu khác, để tránh 1 trình duyệt dùng chung nhiều tài khoản
 * vô tình đọc nhầm tiến trình của người khác. */
export function loadReviewProgress(
  studentId: string,
  storage: ProgressStorage | null = defaultStorage(),
): ReviewProgressState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(studentId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidReviewProgress(parsed) || parsed.studentId !== studentId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReviewProgress(
  studentId: string,
  storage: ProgressStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey(studentId));
  } catch {
    // bỏ qua — xem ghi chú đầu file
  }
}

/**
 * Đối chiếu tiến trình đã lưu với danh sách câu ĐANG THẬT SỰ active (có thể
 * đã đổi kể từ lúc lưu — 1 câu vừa được rút khỏi nhật ký ở thiết bị khác,
 * hoặc giáo viên xoá câu/đề...). Lọc bỏ id không còn active, dồn lại số đã
 * làm cho không vượt quá độ dài mới. Trả về null nếu không còn câu nào để
 * tiếp tục (nên bắt đầu buổi mới thay vì tiếp tục).
 */
export function reconcileReviewProgress(
  saved: ReviewProgressState,
  activeQuestionIds: ReadonlySet<string>,
): { questionIds: string[]; answeredCount: number; tally: ReviewProgressState["tally"] } | null {
  const questionIds = saved.questionIds.filter((id) => activeQuestionIds.has(id));
  if (questionIds.length === 0) return null;
  const answeredCount = Math.min(saved.answeredCount, questionIds.length);
  return { questionIds, answeredCount, tally: saved.tally };
}
