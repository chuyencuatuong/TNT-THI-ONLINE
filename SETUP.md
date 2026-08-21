# Hướng dẫn cài đặt

Bạn không cần biết code hay dòng lệnh nào. Chỉ cần **2 việc**: tải code lên
GitHub bằng cách kéo-thả file (không cần git), và dán 3 giá trị vào ô cấu
hình. Khoảng 10 phút.

---

## Nếu bạn ĐÃ cài đặt trước đó — chỉ cần làm 2 việc để cập nhật

Bản cập nhật lần này thêm: tạo đề từ file Word (AI tự đọc + LaTeX hoá công
thức), giao diện làm bài có đếm giờ + danh sách câu hỏi bên cạnh (giống
Azota), dashboard phân tích (biểu đồ thời gian từng câu, chẩn đoán mất
gốc/chưa vững) hiện ra ngay sau khi học sinh nộp bài, và **tải ảnh minh hoạ**
(bảng biến thiên, đồ thị...) cho từng câu hỏi.

1. **Tải lại code**: lặp lại đúng **Việc 1** bên dưới (kéo-thả toàn bộ file
   trong bản zip mới đè lên repo cũ trên GitHub) — không cần làm lại Việc 2
   (3 giá trị cấu hình vẫn giữ nguyên).
2. **Chạy thêm SQL (bắt buộc, chỉ 1 lần mỗi file)**: vào Supabase Dashboard >
   **SQL Editor** > **New query**. Nếu đây là lần đầu cập nhật, mở lần lượt
   2 file sau trong bản zip mới, copy toàn bộ nội dung từng file, dán vào 1
   query mới, bấm **Run** (làm với file này xong mới sang file kia, mỗi file
   1 query riêng):
   - `supabase/migration_002_import_and_tracking.sql` (nếu đã chạy ở lần cập
     nhật trước thì bỏ qua, không cần chạy lại)
   - `supabase/migration_003_question_images_storage.sql` (mới, cần chạy)

   Nếu bỏ qua các bước này, tính năng chấm giờ, chẩn đoán học lực, và tải
   ảnh minh hoạ sẽ báo lỗi vì database chưa có các bảng/cột/kho lưu trữ mới.

Sau khi GitHub Actions build xong (xem tab Actions, đợi dấu tích xanh), vào
lại website là dùng được ngay.

---

_Lưu ý: ban đầu tôi định tự động đẩy code lên GitHub thay bạn, nhưng môi
trường tôi đang chạy có thêm 1 lớp chặn bảo mật với riêng thao tác "ghi" lên
GitHub (dù token đúng vẫn bị chặn) — không phải lỗi ở bạn. Nên bước tải code
lên cần bạn làm bằng tay, nhưng vẫn chỉ là kéo-thả, không cần viết lệnh gì._

---

## Việc 1 — Tải code lên GitHub (kéo-thả, ~5 phút)

1. Giải nén file zip tôi gửi ra 1 thư mục trên máy.
2. Vào trang repo bạn đã tạo: `github.com/<tên-tài-khoản-của-bạn>/TNT-THI-ONLINE`
3. Vì repo đang trống, GitHub sẽ hiện dòng chữ **"uploading an existing file"**
   (link màu xanh) — bấm vào đó.
4. Mở thư mục vừa giải nén, chọn **toàn bộ file và thư mục bên trong** (không
   kéo cả thư mục "tnt-thi-online" bọc ngoài cùng — chỉ kéo những gì NẰM
   TRONG nó, để khi tải lên các file nằm ngay ở gốc repo).
5. Kéo tất cả vào khung tải lên của GitHub, đợi tải xong.
6. Cuộn xuống dưới, bấm **Commit changes** (giữ nguyên các lựa chọn mặc định).

## Việc 2 — Thêm 3 giá trị cấu hình (~3 phút)

1. Trong repo, vào **Settings** → menu bên trái chọn **Secrets and variables**
   → **Actions**.
2. Bấm **New repository secret**, tạo lần lượt đúng 3 mục sau (tên phải
   viết đúng chính xác, chữ hoa/thường):

   | Tên (Name)              | Giá trị (Value)                          |
   | ------------------------ | ----------------------------------------- |
   | `VITE_SUPABASE_URL`      | URL project Supabase của bạn (dạng `https://xxxxx.supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | anon public key lấy ở Supabase Settings > API |
   | `VITE_GEMINI_API_KEY`    | API key lấy ở aistudio.google.com/apikey |

Sau khi lưu xong secret thứ 3, vào tab **Actions** ở repo, bạn sẽ thấy 1
workflow đang chạy (biểu tượng vàng đang xoay). Đợi khoảng 1-2 phút tới khi
nó chuyển thành dấu tích xanh — lúc đó website đã lên rồi, mở tại:

`https://<tên-tài-khoản-của-bạn>.github.io/TNT-THI-ONLINE/`

Việc bật GitHub Pages đã được cấu hình tự động trong quy trình build, bạn
không cần bấm thêm gì ở phần Settings > Pages.

---

## Sau khi có website — dùng như thế nào

- **Giáo viên — cách nhanh nhất để tạo đề**: mở link website, đăng nhập,
  lần đầu chọn vai trò "Giáo viên". Vào **"+ Tạo đề từ Word"**, tải lên file
  đề thi định dạng `.docx`. AI sẽ đọc nội dung, chuyển công thức sang LaTeX
  và tách câu hỏi theo Phần 1/2/3. Màn hình tiếp theo cho xem trước từng câu
  — **bạn cần xác nhận đáp án đúng cho từng câu** trước khi bấm "Xuất bản đề
  thi" (hệ thống không tự công bố đề khi chưa có đáp án được xác nhận, để
  tránh chấm sai). Nếu file dùng công cụ gõ công thức có sẵn của Word
  (Equation/MathType), một số công thức có thể bị thiếu khi trích xuất tự
  động (giới hạn kỹ thuật) — màn hình xem trước sẽ cho sửa tay bằng LaTeX;
  nếu muốn chính xác hơn ngay từ đầu, có thể gửi file đó trực tiếp trong
  cuộc trò chuyện này để xử lý kỹ hơn rồi dán lại. Câu nào có kèm bảng biến
  thiên/đồ thị, dùng ô "Hình minh hoạ" ở mỗi câu trong màn hình xem trước để
  tải ảnh chụp từ file gốc lên (tối đa 5MB/ảnh).
- **Giáo viên — cách thủ công (không bắt buộc)**: vào "Ngân hàng câu hỏi" để
  nhập từng câu bằng tay (viết công thức Toán bằng cách đặt trong dấu
  `$...$`, ví dụ gõ `$x^2 - 3x + 2 = 0$` sẽ hiển thị thành công thức đẹp),
  rồi vào "Đề thi" để gom câu hỏi thành 1 đề.
- **Học sinh**: mở link website, đăng nhập bằng email tương tự, chọn vai trò
  "Học sinh", sẽ thấy danh sách đề để làm và lịch sử điểm các lần trước. Màn
  hình làm bài có đồng hồ đếm ngược (nếu đề có giới hạn thời gian) và danh
  sách câu hỏi bên phải để nhảy nhanh tới từng câu. Làm xong, dashboard hiện
  ra ngay: điểm số, thời gian từng câu, và chẩn đoán mức độ nắm vững theo
  từng dạng bài (chỉ áp dụng khi câu hỏi đã được gán "dạng bài" — xem ngân
  hàng câu hỏi hoặc gán khi tạo đề từ Word).
- **Phụ huynh**: không cần tài khoản — giáo viên bấm "Tạo báo cáo" trong
  trang chi tiết học sinh, hệ thống tự sinh 1 link riêng để gửi qua Zalo/tin
  nhắn cho phụ huynh xem trực tiếp.

### Lưu ý về phần "chẩn đoán mất gốc / chưa vững"

Đây là gợi ý dựa trên 1 quy tắc đơn giản do tôi tự đặt ra (độ chính xác +
thời gian làm bài + số lần đổi đáp án), **không phải** một công cụ chẩn đoán
giáo dục đã được kiểm chứng khoa học. Nên dùng để gợi ý hướng ôn tập ban
đầu, đối chiếu thêm với quan sát thực tế trên lớp, không nên coi là kết luận
cuối cùng về học sinh.

Nếu tôi cập nhật thêm code sau này, tôi sẽ gửi lại 1 file zip mới — bạn chỉ
cần lặp lại **Việc 1** (tải lên GitHub) với các file mới, không cần làm lại
Việc 2. Có chỗ nào vướng cứ nhắn lại trong đây.
