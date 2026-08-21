# TNT - Website luyện tập & thi trực tuyến

Trạng thái: **code đã hoàn chỉnh, đang chờ thông tin thiết lập để triển khai
thật** — xem `SETUP.md` để biết các bước cần làm (khoảng 15-20 phút, 1 lần
duy nhất).

## Tính năng đã có

- Đăng nhập bằng email (không cần mật khẩu), phân quyền Giáo viên / Học sinh.
- Giáo viên: ngân hàng câu hỏi (3 phần, gán chủ đề/dạng bài/mức độ tư duy, có
  gợi ý gán dạng bài bằng AI), tạo đề từ ngân hàng câu hỏi, xem thống kê điểm
  và tỉ lệ đúng theo dạng bài của từng học sinh, tạo báo cáo AI + link xem
  cho phụ huynh (không cần tài khoản).
- Học sinh: làm bài đúng 3 phần theo barem hiện hành, xem lịch sử điểm qua
  các lần làm.
- Chấm điểm tự động, ghi log từng lần chọn/đổi đáp án để tính thời gian làm
  bài và số lần đổi ý cho từng câu.
- Công thức Toán viết bằng LaTeX, hiển thị đẹp bằng KaTeX.
- Tự động build & deploy lên GitHub Pages mỗi khi có cập nhật.

## Cấu trúc dự án

- `src/lib/scoring.ts` — bộ máy chấm điểm 3 phần (18 unit test, xem `scoring.test.ts`).
- `src/lib/api.ts` — toàn bộ truy vấn dữ liệu (Supabase).
- `src/lib/ai.ts` — tích hợp Gemini (gợi ý dạng bài, sinh nhận xét báo cáo).
- `src/pages/` — các trang giao diện (giáo viên, học sinh, báo cáo công khai).
- `src/components/` — các thành phần dùng chung (câu hỏi 3 phần, form nhập đề...).
- `supabase/schema.sql` — toàn bộ database schema + phân quyền (RLS), chạy 1 lần trong Supabase.
- `.github/workflows/deploy.yml` — tự động build & deploy lên GitHub Pages.

## Chạy thử ở máy (không bắt buộc)

```bash
npm install
npm test        # chạy 18 unit test của bộ máy chấm điểm
npm run dev      # chạy thử giao diện tại localhost (cần file .env, xem .env.example)
```

## Barem chấm điểm đang áp dụng

- Phần 1 (trắc nghiệm 4 phương án): 0.25 điểm/câu đúng.
- Phần 2 (đúng-sai 4 ý/câu): đúng 1 ý = 0.1đ, 2 ý = 0.25đ, 3 ý = 0.5đ, 4 ý = 1đ.
- Phần 3 (trả lời ngắn): điểm/câu có thể tuỳ chỉnh từng câu (`default_points` trong bảng `questions`), so khớp đáp án có chuẩn hoá số thập phân (`12.5` = `12,5` = `12.50`).
