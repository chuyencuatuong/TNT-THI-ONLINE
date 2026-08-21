# TNT - Website luyện tập & thi trực tuyến

Trạng thái: **code đã hoàn chỉnh, đang chờ thông tin thiết lập để triển khai
thật** — xem `SETUP.md` để biết các bước cần làm (khoảng 15-20 phút, 1 lần
duy nhất).

## Tính năng đã có

- Đăng nhập bằng email (không cần mật khẩu), phân quyền Giáo viên / Học sinh.
- Giáo viên: **tạo đề từ file Word** (AI đọc file `.docx`, LaTeX hoá công
  thức, tách câu hỏi theo 3 phần, giáo viên xem trước & xác nhận đáp án
  trước khi xuất bản), ngân hàng câu hỏi thủ công (gán chủ đề/dạng bài/mức
  độ tư duy, có gợi ý gán dạng bài bằng AI), đặt thời gian làm bài cho từng
  đề, xem thống kê điểm và tỉ lệ đúng theo dạng bài của từng học sinh, tạo
  báo cáo AI + link xem cho phụ huynh (không cần tài khoản).
- Học sinh: làm bài đúng 3 phần theo barem hiện hành, giao diện có đồng hồ
  đếm ngược + danh sách câu hỏi để nhảy nhanh (giống các nền tảng thi trắc
  nghiệm phổ biến), xem lịch sử điểm qua các lần làm.
- Chấm điểm tự động, ghi log từng lần chọn/đổi đáp án + từng lượt xem từng
  câu hỏi (cộng dồn nhiều lượt quay lại xem) để tính chính xác thời gian tập
  trung vào từng câu.
- Dashboard hiện ngay sau khi nộp bài: biểu đồ thời gian từng câu, độ chính
  xác theo dạng bài, và chẩn đoán mức độ nắm vững (nắm vững / chưa chắc chắn
  / có lỗ hổng / có dấu hiệu mất gốc) dựa trên quy tắc heuristic — xem lưu ý
  trong `SETUP.md`.
- Công thức Toán viết bằng LaTeX, hiển thị đẹp bằng KaTeX. Ảnh minh hoạ
  (bảng biến thiên, đồ thị...) tải lên qua Supabase Storage, gắn được cho
  từng câu hỏi (form nhập tay hoặc màn hình xem trước khi tạo đề từ Word).
- Tự động build & deploy lên GitHub Pages mỗi khi có cập nhật.

## Cấu trúc dự án

- `src/lib/scoring.ts` — bộ máy chấm điểm 3 phần (18 unit test, xem `scoring.test.ts`).
- `src/lib/diagnosis.ts` — chẩn đoán mức độ nắm vững theo dạng bài + tính thời gian tập trung từng câu (15 unit test).
- `src/lib/wordImport.ts` — trích xuất văn bản/hình ảnh từ file `.docx` bằng mammoth.js (6 unit test).
- `src/lib/api.ts` — toàn bộ truy vấn dữ liệu (Supabase).
- `src/lib/ai.ts` — tích hợp Gemini (gợi ý dạng bài, phân tích đề từ Word, sinh nhận xét báo cáo).
- `src/pages/` — các trang giao diện (giáo viên, học sinh, báo cáo công khai).
- `src/components/` — các thành phần dùng chung (câu hỏi 3 phần, form nhập đề...).
- `supabase/schema.sql` — toàn bộ database schema + phân quyền (RLS) cho cài đặt mới.
- `supabase/migration_002_import_and_tracking.sql` — cập nhật thêm cho DB đã tồn tại (xem `SETUP.md`).
- `.github/workflows/deploy.yml` — tự động build & deploy lên GitHub Pages.

## Chạy thử ở máy (không bắt buộc)

```bash
npm install
npm test        # chạy 39 unit test (chấm điểm, chẩn đoán, đọc file Word)
npm run dev      # chạy thử giao diện tại localhost (cần file .env, xem .env.example)
```

## Barem chấm điểm đang áp dụng

- Phần 1 (trắc nghiệm 4 phương án): 0.25 điểm/câu đúng.
- Phần 2 (đúng-sai 4 ý/câu): đúng 1 ý = 0.1đ, 2 ý = 0.25đ, 3 ý = 0.5đ, 4 ý = 1đ.
- Phần 3 (trả lời ngắn): điểm/câu có thể tuỳ chỉnh từng câu (`default_points` trong bảng `questions`), so khớp đáp án có chuẩn hoá số thập phân (`12.5` = `12,5` = `12.50`).
