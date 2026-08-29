/**
 * Tiện ích avatar viết tắt tên dùng chung cho các trang giáo viên (danh sách
 * học sinh, quản lý lớp, lịch học...) — tách ra từ TeacherDashboard.tsx
 * (28/08/2026, đợt "quản lý lớp học") để dùng lại được ở nhiều trang mới
 * thay vì định nghĩa lại mỗi nơi.
 */

/** Màu vòng tròn viết tắt tên, xoay vòng theo thứ tự danh sách — chỉ để dễ
 * phân biệt các dòng, không mang ý nghĩa xếp hạng hay đánh giá. */
export const AVATAR_PALETTE = [
  { bg: "var(--color-subtle-bg)", text: "var(--color-text)" },
  // SỬA 29/08/2026: trước đây text hardcode "#7a5a19" (chỉ đúng màu ở giao
  // diện sáng) — ở giao diện tối, --color-accent-light đổi thành nền tối
  // (#3a2f1f) nhưng chữ vẫn giữ nguyên hex cũ, cho độ tương phản ~2.1:1 (dưới
  // rất xa chuẩn WCAG AA 4.5:1, gần như không đọc được). Đổi sang biến
  // --color-accent-dark — đã có sẵn, tự đổi theo theme giống 3 dòng còn lại
  // trong bảng màu này — đạt ~6.9:1 ở giao diện tối, ~4.3:1 ở giao diện sáng.
  { bg: "var(--color-accent-light)", text: "var(--color-accent-dark)" },
  { bg: "var(--color-pine-light)", text: "var(--color-pine-text)" },
  { bg: "var(--color-clay-light)", text: "var(--color-clay-text)" },
];

/** "Nguyễn An" → "NA" — chữ đầu của từ đầu + chữ đầu của từ cuối trong tên. */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
