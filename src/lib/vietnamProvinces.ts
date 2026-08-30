/**
 * Danh sách tỉnh/thành phố Việt Nam — dùng cho ô chọn "Tỉnh/Thành phố" ở form
 * hoàn tất hồ sơ học sinh (LoginPage.tsx). Dùng <select> cố định thay vì để
 * học sinh gõ tay tự do, để tránh dữ liệu bị phân mảnh (vd "TP HCM" /
 * "Tp.HCM" / "Hồ Chí Minh" đều là 1 nơi nhưng lưu thành 3 giá trị khác nhau)
 * — quan trọng nếu sau này cần thống kê học sinh theo khu vực.
 *
 * CẬP NHẬT 24/08/2026: Việt Nam đã sáp nhập đơn vị hành chính cấp tỉnh từ 63
 * xuống còn 34 (28 tỉnh + 6 thành phố trực thuộc trung ương), hiệu lực từ
 * 01/07/2025 theo Nghị quyết 202/2025/QH15. Danh sách dưới đây là danh sách
 * SAU sáp nhập, đối chiếu 2 nguồn độc lập (baolamdong.vn, landviet.com.vn)
 * tại thời điểm viết. Nếu ranh giới hành chính đổi tiếp trong tương lai, chỉ
 * cần sửa mảng này, không cần đụng tới chỗ nào khác dùng nó.
 */
export const VIETNAM_PROVINCES: string[] = [
  // Trung du và miền núi phía Bắc
  "Tuyên Quang",
  "Cao Bằng",
  "Lai Châu",
  "Lào Cai",
  "Thái Nguyên",
  "Điện Biên",
  "Lạng Sơn",
  "Sơn La",
  "Phú Thọ",
  // Đồng bằng sông Hồng
  "Hà Nội",
  "Hải Phòng",
  "Bắc Ninh",
  "Quảng Ninh",
  "Hưng Yên",
  "Ninh Bình",
  // Bắc Trung Bộ
  "Thanh Hóa",
  "Nghệ An",
  "Hà Tĩnh",
  "Quảng Trị",
  "Huế",
  // Duyên hải Nam Trung Bộ và Tây Nguyên
  "Đà Nẵng",
  "Quảng Ngãi",
  "Gia Lai",
  "Đắk Lắk",
  "Khánh Hòa",
  "Lâm Đồng",
  // Đông Nam Bộ
  "Đồng Nai",
  "Tây Ninh",
  "Hồ Chí Minh",
  // Đồng bằng sông Cửu Long
  "Đồng Tháp",
  "An Giang",
  "Vĩnh Long",
  "Cần Thơ",
  "Cà Mau",
];
