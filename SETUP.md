# Hướng dẫn cài đặt

Bạn không cần biết code hay dòng lệnh nào. Chỉ cần **2 việc**: tải code lên
GitHub bằng cách kéo-thả file (không cần git), và dán 3 giá trị vào ô cấu
hình. Khoảng 10 phút.

_Lưu ý: ban đầu tôi định tự động đẩy code lên GitHub thay bạn, nhưng môi
trường tôi đang chạy có thêm 1 lớp chặn bảo mật với riêng thao tác "ghi" lên
GitHub (dù token đúng vẫn bị chặn) — không phải lỗi ở bạn. Nên bước tải code
lên cần bạn làm bằng tay, nhưng vẫn chỉ là kéo-thả, không cần viết lệnh gì._

---

## Việc 1 — Tải code lên GitHub (kéo-thả, ~5 phút)

1. Giải nén file zip tôi gửi ra 1 thư mục trên máy.
2. Vào trang repo trống bạn đã tạo: `github.com/<tên-tài-khoản-của-bạn>/tnt-thi-online`
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

`https://<tên-tài-khoản-của-bạn>.github.io/tnt-thi-online/`

Việc bật GitHub Pages đã được cấu hình tự động trong quy trình build, bạn
không cần bấm thêm gì ở phần Settings > Pages.

---

## Sau khi có website — dùng như thế nào

- **Giáo viên**: mở link website, nhập email, bấm link trong email được gửi
  tới để đăng nhập, lần đầu chọn vai trò "Giáo viên". Vào "Ngân hàng câu hỏi"
  để thêm câu hỏi (viết công thức Toán bằng cách đặt trong dấu `$...$`, ví dụ
  gõ `$x^2 - 3x + 2 = 0$` sẽ hiển thị thành công thức đẹp). Vào "Đề thi" để
  gom câu hỏi thành 1 đề.
- **Học sinh**: mở link website, đăng nhập bằng email tương tự, chọn vai trò
  "Học sinh", sẽ thấy danh sách đề để làm và lịch sử điểm các lần trước.
- **Phụ huynh**: không cần tài khoản — giáo viên bấm "Tạo báo cáo" trong
  trang chi tiết học sinh, hệ thống tự sinh 1 link riêng để gửi qua Zalo/tin
  nhắn cho phụ huynh xem trực tiếp.

Nếu tôi cập nhật thêm code sau này, tôi sẽ gửi lại 1 file zip mới — bạn chỉ
cần lặp lại **Việc 1** (tải lên GitHub) với các file mới, không cần làm lại
Việc 2. Có chỗ nào vướng cứ nhắn lại trong đây.
