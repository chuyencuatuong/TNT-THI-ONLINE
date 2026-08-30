/**
 * Chia 1 lượt ôn tập câu sai thành nhiều "đợt" nhỏ khi tổng số câu đang cần
 * ôn quá lớn — để 1 lần mở màn hình không bị dồn quá nhiều câu (mỗi đợt tối
 * đa MAX_BATCH_SIZE câu), đúng yêu cầu người dùng: "lớn hơn 10 câu thì chia
 * ra làm nhiều đợt... đảm bảo mỗi đợt làm không quá 10 câu".
 *
 * Khi tổng số không chia hết cho số đợt, phần dư được dồn vào các đợt SAU
 * (đợt sau >= đợt trước), đúng yêu cầu "lần sau nhiều hơn lần trước một
 * lượng dư". Người dùng nêu ví dụ trường hợp này là khi tổng số câu là SỐ
 * NGUYÊN TỐ (vì số nguyên tố không chia hết cho số đợt nào ngoài 1 và chính
 * nó) — nhưng thực ra điều quyết định việc chia có đều được hay không là
 * TỔNG SỐ có chia hết cho SỐ ĐỢT hay không (total % batchCount === 0), không
 * phải bản thân total có phải số nguyên tố hay không: ví dụ 15 câu (không
 * phải số nguyên tố) chia làm 2 đợt vẫn lẻ ra 7+8, còn 14 câu chia làm 2 đợt
 * lại chẵn 7+7. Vì vậy hàm dưới đây dùng ĐÚNG 1 công thức chung (chia đều
 * phần nguyên, dồn số dư vào các đợt cuối) cho MỌI giá trị total — tự động
 * đúng luôn cho trường hợp số nguyên tố mà không cần kiểm tra riêng có phải
 * số nguyên tố hay không (kiểm tra riêng sẽ vừa thừa vừa không đúng bản chất
 * vấn đề, vì như ví dụ 15/14 ở trên cho thấy).
 */

export const MAX_BATCH_SIZE = 10;

/**
 * Trả về danh sách kích thước từng đợt sao cho: tổng đúng bằng `total`,
 * không đợt nào vượt quá `maxBatchSize`, và các đợt sau lớn hơn hoặc bằng
 * các đợt trước (dư được dồn về cuối). total <= 0 trả về mảng rỗng.
 */
export function computeBatchSizes(total: number, maxBatchSize = MAX_BATCH_SIZE): number[] {
  if (total <= 0) return [];
  const batchCount = Math.ceil(total / maxBatchSize);
  const base = Math.floor(total / batchCount);
  const extra = total % batchCount;
  const sizes: number[] = [];
  for (let i = 0; i < batchCount; i++) {
    sizes.push(i < batchCount - extra ? base : base + 1);
  }
  return sizes;
}

/** Cắt 1 mảng thành nhiều đợt theo đúng kích thước từ computeBatchSizes, giữ nguyên thứ tự phần tử. */
export function splitIntoBatches<T>(items: T[], maxBatchSize = MAX_BATCH_SIZE): T[][] {
  const sizes = computeBatchSizes(items.length, maxBatchSize);
  const batches: T[][] = [];
  let offset = 0;
  for (const size of sizes) {
    batches.push(items.slice(offset, offset + size));
    offset += size;
  }
  return batches;
}

/**
 * Xác định vị trí (đợt, số thứ tự trong đợt) của câu TIẾP THEO cần làm, chỉ
 * dựa vào SỐ CÂU ĐÃ LÀM XONG (`answeredCount`) và kích thước từng đợt — dùng
 * làm nguồn sự thật DUY NHẤT cho vị trí hiện tại trong buổi ôn tập (thay vì
 * lưu riêng "đợt mấy" + "câu mấy trong đợt" 2 số tách rời), để việc tiếp tục
 * đúng chỗ dở dang sau khi tải lại trang (mục 7, Đợt 5) chỉ cần khôi phục lại
 * ĐÚNG 1 con số duy nhất, còn vị trí hiển thị luôn tính lại từ hàm này —
 * không bao giờ lệch nhau giữa 2 nguồn dữ liệu.
 *
 * Trả về null nếu đã làm xong hết (answeredCount >= tổng số câu).
 */
export function locateInBatches(
  batchSizes: number[],
  answeredCount: number,
): { roundIndex: number; indexInRound: number } | null {
  let remaining = Math.max(0, answeredCount);
  for (let roundIndex = 0; roundIndex < batchSizes.length; roundIndex++) {
    if (remaining < batchSizes[roundIndex]) {
      return { roundIndex, indexInRound: remaining };
    }
    remaining -= batchSizes[roundIndex];
  }
  return null;
}
