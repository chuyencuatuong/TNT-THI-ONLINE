import type { ErrorInstanceType } from "../../lib/types";

/**
 * Tên gọi, mô tả sư phạm và hướng khắc phục cho từng loại lỗi — dùng chung
 * cho phân mục 03 (ErrorDnaPanel), 07 (NextStepPanel) và 08 (QuestionReviewSection)
 * để cùng 1 loại lỗi luôn được gọi cùng 1 tên trên trang kết quả.
 * Khái niệm / Quy trình / Tính toán / Nhịp độ = conceptual / procedural /
 * calculation / careless (errorIntelligence.ts).
 */
export interface ErrorTypeMeta {
  short: string;
  title: string;
  description: string;
  action: string;
  /** Độ đậm của gam đất nung trên thanh phân bổ (0..1). */
  weight: number;
}

export const ERROR_TYPE_META: Record<ErrorInstanceType, ErrorTypeMeta> = {
  conceptual: {
    short: "Khái niệm",
    title: "Sai lệch khái niệm",
    description: "Nhầm bản chất hoặc điều kiện áp dụng của định nghĩa, định lý.",
    action: "Đọc lại lý thuyết, tự phát biểu lại điều kiện áp dụng trước khi luyện bài.",
    weight: 1,
  },
  procedural: {
    short: "Quy trình",
    title: "Sai lệch quy trình",
    description: "Thiếu bước hoặc đi sai thứ tự các bước giải.",
    action: "Viết ra khung các bước của lời giải mẫu, luyện lại theo đúng trình tự.",
    weight: 0.8,
  },
  calculation: {
    short: "Tính toán",
    title: "Sai lệch tính toán",
    description: "Hướng đi đúng nhưng sai ở bước tính hoặc biến đổi.",
    action: "Soát lại từng dòng biến đổi; tập thói quen thử lại kết quả bằng máy tính.",
    weight: 0.62,
  },
  careless: {
    short: "Nhịp độ",
    title: "Sai lệch nhịp độ",
    description: "Làm nhanh hơn nhiều so với định mức ở phần vốn đã nắm — dấu hiệu đọc lướt, chọn vội.",
    action: "Chậm lại ở từ khoá điều kiện; dành 20–30 giây soát đáp án trước khi chuyển câu.",
    weight: 0.46,
  },
  unclassified: {
    short: "Chưa định vị",
    title: "Chưa định vị được bản chất",
    description: "Phương án em chọn chưa được thầy gắn nhãn lỗi, hoặc câu không có phương án nhiễu để đối soát.",
    action: "Phần này sẽ tự cập nhật khi thầy đối soát thêm nhãn lỗi — em chưa cần làm gì.",
    weight: 0,
  },
};

/** Biến --si-weight (độ đậm gam đất nung) cho 1 loại lỗi. */
export function errorWeightVar(t: ErrorInstanceType): string {
  return `${Math.round(ERROR_TYPE_META[t].weight * 100)}%`;
}
