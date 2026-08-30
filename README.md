# TNT - Website luyện tập & thi trực tuyến

Trạng thái: **code đã hoàn chỉnh, đang chờ thông tin thiết lập để triển khai
thật** — xem `SETUP.md` để biết các bước cần làm (khoảng 15-20 phút, 1 lần
duy nhất).

## Tính năng đã có

- Đăng nhập bằng email + mật khẩu tự đặt (không cần dịch vụ gửi email nào),
  phân quyền Giáo viên / Học sinh.
- Giáo viên: tạo đề từ file PDF/Word, mỗi đề có thể gán **Khối** (10/11/12),
  **Chương** (đề có thể thuộc nhiều chương, tự chọn sẵn theo gợi ý AI của
  từng câu), **Thư mục/tuyển tập** và **Chương trình/kỳ thi** (2 danh sách
  do giáo viên tự quản lý — chọn từ danh sách có sẵn hoặc bấm "+ mới" khi
  cần, tránh gõ tay dễ tạo trùng tên) và **link Google Drive** chứa file đề
  gốc để học sinh tải về (không lưu file trong hệ thống, chỉ lưu link). Ngân
  hàng câu hỏi và danh sách đề có ô **tìm kiếm**.
- Học sinh: trang chủ chỉ hiện đề mới thêm gần đây nhất (đỡ rối khi số đề
  tăng dần), có trang riêng **"Kho đề"** hiện thẻ theo thư mục/tuyển tập
  (bấm vào xem danh sách đề bên trong) kèm bộ lọc chọn nối tiếp **Khối →
  Chương trình → Chương** — chọn bất kỳ điều kiện nào sẽ chuyển sang xem
  danh sách đề khớp lọc.
- **Ôn tập câu sai kiểu Leitner**: câu làm sai/chưa trọn điểm khi làm đề tự
  vào "nhật ký ôn tập" của học sinh đó. Có màn hình ôn tập riêng, không tính
  giờ, lấy toàn bộ câu trong nhật ký; câu chỉ được rút khỏi nhật ký khi
  làm đúng đủ 3 buổi ôn tập RIÊNG BIỆT liên tiếp (làm sai buổi nào thì tính
  lại từ đầu). Hiện tại là bản đơn giản (trả lời lại y hệt câu gốc) — kiến
  trúc đã tách sẵn để sau này thêm chế độ "sắp xếp lại các bước lời giải".
  Vị trí đáp án được **xáo ngẫu nhiên mỗi lần hiện ra** (chỉ ở màn hình ôn
  tập, không ảnh hưởng đề thi thật) để học sinh không "đối phó" được bằng
  cách nhớ vị trí đã bấm. Khi nhật ký có nhiều câu, buổi ôn tập tự **chia
  thành nhiều đợt nhỏ** (tối đa 10 câu/đợt, đợt sau dồn phần dư nên có thể
  nhiều hơn đợt trước) để không bị quá tải trong 1 lần mở màn hình, nhưng
  vẫn tính chung là 1 buổi cho mục Leitner ở trên.
- **Dashboard tổng quan giáo viên 3 cột**: danh sách học sinh (bấm để chọn) —
  biểu đồ % đúng theo từng CHƯƠNG của học sinh đang chọn — so sánh học sinh
  đó với trung bình cả lớp theo từng chương. Chưa chọn học sinh nào thì cả 3
  cột mặc định hiện tổng quan cả lớp.
- Giáo viên: **tạo đề từ file PDF** (cách chính, cập nhật 23/08/2026) —
  trình duyệt đọc SONG SONG 2 nguồn cho mỗi trang: văn bản thật nhúng sẵn
  trong PDF (pdf.js, chính xác tuyệt đối, không tốn AI) và ảnh cả trang (chỉ
  để AI đọc công thức MathType đã thành hình khi xuất PDF, nhận diện hình vẽ,
  và xác định đáp án qua tín hiệu thị giác) — nhờ vậy AI không cần tự gõ lại
  toàn bộ chữ từ ảnh, nên nhẹ/nhanh/chính xác hơn hẳn cách đọc ảnh toàn trang
  trước đây, đồng thời né được giới hạn "bỏ sót công thức MathType" của việc
  đọc thẳng file .docx. AI tự nhận diện đáp án đúng theo nhiều quy ước trình
  bày khác nhau (tô màu/gạch chân/in đậm/dấu "*"/ghi chú "Đáp án:"...) và lấy
  luôn lời giải nếu đề có ghi sẵn, tách câu hỏi theo 3 phần — giáo viên luôn
  xem trước & xác nhận đáp án trước khi xuất bản. AI cũng **tự gợi ý chương**
  phù hợp cho từng câu (dựa trên khung chương có sẵn) ngay ở màn hình xem
  trước — giáo viên xem lại/đổi trước khi xuất bản, không tự động gán. Cách
  đọc thẳng file `.docx` (kém chính xác hơn với MathType) và cách dán JSON
  đã xử lý sẵn vẫn còn, dùng khi không có file PDF. Ngoài ra có ngân hàng câu
  hỏi thủ công (gán chủ đề/dạng bài/mức độ tư duy, có gợi ý gán dạng bài và
  chương bằng AI, kèm nút "Phân loại lại chương bằng AI" hàng loạt cho câu cũ
  chưa có chương), đặt thời gian làm bài cho từng đề, xem thống kê điểm và tỉ
  lệ đúng theo dạng bài của từng học sinh, tạo báo cáo AI + link xem cho phụ
  huynh (không cần tài khoản).
- Học sinh: làm bài đúng 3 phần theo barem hiện hành, giao diện có đồng hồ
  đếm ngược + danh sách câu hỏi để nhảy nhanh (giống các nền tảng thi trắc
  nghiệm phổ biến). Trang chủ có dashboard tiến độ (số bài đã làm, điểm
  trung bình, điểm gần nhất, mức cải thiện so với lần trước, tổng thời gian
  làm bài, biểu đồ xu hướng điểm). Sau khi nộp bài, xem lại được toàn bộ bài
  làm — chỗ nào đúng/sai/thiếu, đáp án đúng, và lời giải chi tiết (nếu giáo
  viên có nhập) cho từng câu. Danh sách "Đề thi có thể làm" có ô tìm kiếm,
  nhóm theo thư mục, và nút "Tải đề" (mở link Google Drive) nếu đề có link.
- Giáo viên: trang chi tiết từng học sinh hiện kết quả theo từng đề thi, kèm
  số lần làm lại và chênh lệch điểm/thời gian hoàn thành so với lần đầu và
  lần ngay trước đó — dễ thấy học sinh có tiến bộ qua các lần làm lại hay
  không. Có thể nhập lời giải chi tiết cho từng câu (khi tạo đề từ JSON hoặc
  nhập tay vào ngân hàng câu hỏi) — lời giải chỉ hiện ra cho học sinh sau khi
  đã nộp bài.
- Giám sát làm bài: ghi nhận rời tab/thoát toàn màn hình, chặn sao chép/dán
  nội dung trong lúc thi; giáo viên xem "mức độ nghi ngờ" từng lượt làm bài
  ở trang chi tiết học sinh (chỉ là gợi ý, không phải bằng chứng chắc chắn —
  xem giới hạn trong `SETUP.md`).
- Chấm điểm tự động, ghi log từng lần chọn/đổi đáp án + từng lượt xem từng
  câu hỏi (cộng dồn nhiều lượt quay lại xem) để tính chính xác thời gian tập
  trung vào từng câu.
- Dashboard hiện ngay sau khi nộp bài: biểu đồ thời gian từng câu, độ chính
  xác theo dạng bài, và chẩn đoán mức độ nắm vững (nắm vững / chưa chắc chắn
  / có lỗ hổng / có dấu hiệu mất gốc) dựa trên quy tắc heuristic — xem lưu ý
  trong `SETUP.md`.
- Công thức Toán viết bằng LaTeX, hiển thị đẹp bằng KaTeX. Ảnh minh hoạ
  (bảng biến thiên, đồ thị...) tải lên qua Supabase Storage, gắn được cho
  từng câu hỏi (form nhập tay hoặc màn hình xem trước khi tạo đề từ Word) —
  chọn file hoặc dán trực tiếp bằng Ctrl+V.
- Khung kiến thức gieo sẵn 6 chương Toán 12 (dạng bài chi tiết & mức độ khó
  làm sau).
- Tự động build & deploy lên GitHub Pages mỗi khi có cập nhật.

## Cấu trúc dự án

- `src/lib/scoring.ts` — bộ máy chấm điểm 3 phần (18 unit test, xem `scoring.test.ts`).
- `src/lib/diagnosis.ts` — chẩn đoán mức độ nắm vững theo dạng bài + tính thời gian tập trung từng câu (15 unit test).
- `src/lib/wordImport.ts` — trích xuất văn bản/hình ảnh từ file `.docx` bằng mammoth.js (6 unit test, cách dự phòng — không đọc được công thức MathType).
- `src/lib/pdfImport.ts` — với mỗi trang PDF: render thành ảnh + đọc văn bản thật (pdf.js) ngay trên trình duyệt (cách chính để tạo đề).
- `src/lib/pdfTextLayout.ts` — hàm thuần ghép các mục text rời rạc (kèm toạ độ) mà pdf.js trả về thành đoạn văn bản đọc được, tách riêng để unit-test không cần môi trường trình duyệt, 6 unit test.
- `src/lib/chunk.ts` — chia mảng thành nhiều đợt (dùng để gửi ảnh trang PDF theo batch cho AI), 5 unit test.
- `src/lib/leitner.ts` — logic thuần cho nhật ký câu sai kiểu Leitner (đếm streak theo buổi ôn tập riêng biệt, chọn ngẫu nhiên), 10 unit test.
- `src/lib/examLibrary.ts` — logic thuần cho Kho đề (nhóm theo thư mục, lọc theo Khối → Chương trình → Chương), 9 unit test.
- `src/lib/reviewBatching.ts` — chia 1 buổi ôn tập thành nhiều đợt tối đa 10 câu/đợt khi nhật ký nhiều câu (dồn phần dư vào đợt sau), 10 unit test.
- `src/lib/reviewShuffle.ts` — xáo ngẫu nhiên vị trí đáp án 1 câu cho màn hình ôn tập (chỉ ôn tập, không đụng đề thi thật), 5 unit test.
- `src/lib/chapterStats.ts` — gộp/so sánh thống kê đúng-sai theo CHƯƠNG cho dashboard giáo viên 3 cột, 9 unit test.
- `src/lib/api.ts` — toàn bộ truy vấn dữ liệu (Supabase).
- `src/lib/ai.ts` — tích hợp Gemini (gợi ý dạng bài + chương, phân tích đề từ văn bản+ảnh PDF/Word kèm gợi ý chương từng câu, sinh nhận xét báo cáo), 17 unit test cho các hàm thuần (đọc JSON, gộp kết quả nhiều đợt, khớp tên chương AI gợi ý, tự sửa lỗi escape JSON của AI).
- `src/pages/` — các trang giao diện (giáo viên, học sinh, báo cáo công khai).
- `src/components/` — các thành phần dùng chung (câu hỏi 3 phần, form nhập đề, TagPicker chọn thư mục/chương trình...).
- `supabase/schema.sql` — toàn bộ database schema + phân quyền (RLS) cho cài đặt mới.
- `supabase/migration_002_import_and_tracking.sql`, `migration_003_question_images_storage.sql`, `migration_004_giam_sat_thi.sql`, `migration_005_chuong_toan12.sql`, `migration_006_loi_giai.sql`, `migration_007_chuong_thu_muc_drive.sql`, `migration_008_kho_de_va_on_tap_leitner.sql` — cập nhật thêm cho DB đã tồn tại (xem `SETUP.md`).
- `.github/workflows/deploy.yml` — tự động build & deploy lên GitHub Pages.

## Chạy thử ở máy (không bắt buộc)

```bash
npm install
npm test        # chạy 122 unit test (chấm điểm, chẩn đoán, đọc file Word, ghép văn bản PDF, gộp kết quả phân tích PDF, khớp tên chương AI gợi ý, tự sửa lỗi escape JSON của AI, nhật ký câu sai kiểu Leitner, lọc/nhóm Kho đề, chia đợt ôn tập, xáo đáp án ôn tập, gộp thống kê theo chương)
npm run dev      # chạy thử giao diện tại localhost (cần file .env, xem .env.example)
```

## Barem chấm điểm đang áp dụng

- Phần 1 (trắc nghiệm 4 phương án): 0.25 điểm/câu đúng.
- Phần 2 (đúng-sai 4 ý/câu): đúng 1 ý = 0.1đ, 2 ý = 0.25đ, 3 ý = 0.5đ, 4 ý = 1đ.
- Phần 3 (trả lời ngắn): điểm/câu có thể tuỳ chỉnh từng câu (`default_points` trong bảng `questions`), so khớp đáp án có chuẩn hoá số thập phân (`12.5` = `12,5` = `12.50`).
