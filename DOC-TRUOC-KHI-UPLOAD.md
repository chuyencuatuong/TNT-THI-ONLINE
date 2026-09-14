# Đọc trước khi upload lên GitHub

*(Xoá file này sau khi đọc xong — nó không thuộc mã nguồn dự án.)*

Thư mục này là **toàn bộ dự án đã hoàn chỉnh**, đã bao gồm:

- Tính năng mới "Quản lý & thúc đẩy xử lý câu sai" (Lần 1 / Lần 2 / Lần 3).
- Các bản vá bảo trì: nâng cấp `vite` 5→8, `vitest` 2→5, `react-router-dom` 6→7,
  `@vitejs/plugin-react` 4→6 (vá 8 lỗ hổng bảo mật → còn 0), sửa `.env.example`.
- File `supabase/migration_017_chi_muc_on_tap_cau_sai.sql` (chỉ thêm index,
  KHÔNG bắt buộc chạy).

Đã kiểm tra trước khi đóng gói: typecheck sạch, 359/359 unit test đạt,
`npm run build` thành công, và chạy thật trên trình duyệt (cả giao diện sáng
lẫn tối) không có lỗi.

---

## Cách upload (GitHub web)

1. Mở repo `TNT-THI-ONLINE` trên GitHub → **Add file** → **Upload files**.
2. Kéo **toàn bộ nội dung bên trong thư mục này** vào (kéo từng thư mục con
   `src`, `supabase`, `public`, `.github` và các file lẻ ở gốc).
3. Commit.

## ⚠️ Một việc GitHub web KHÔNG tự làm được: xoá file rác cũ

Upload chỉ **thêm/ghi đè**, không xoá được file đã có sẵn trên repo. Nên sau
khi upload xong, thầy cần **xoá thủ công 16 file rác** đang nằm ở gốc repo:

- `tsconfig.tsbuildinfo`
- 15 file tên dạng `vite.config.ts.timestamp-*.mjs`

Cách xoá: mở từng file trên GitHub → nút thùng rác (Delete this file) →
Commit. Hơi thủ công nhưng chỉ làm 1 lần duy nhất; `.gitignore` mới đã chặn
không cho chúng quay lại nữa.

> Nếu thầy dùng Git trên máy thì nhanh hơn nhiều — chỉ cần copy đè thư mục
> này lên bản repo ở máy rồi:
> `git add -A && git commit -m "Quan ly xu ly cau sai + bao tri" && git push`
> Lệnh `git add -A` tự nhận biết các file rác đã bị xoá, không phải làm tay.

---

## Sau khi push

- GitHub Actions tự build & deploy — kiểm tra tab **Actions** xem có xanh không.
- *(Tuỳ chọn)* Vào Supabase → SQL Editor → dán nội dung
  `supabase/migration_017_chi_muc_on_tap_cau_sai.sql` → Run. Không chạy thì web
  vẫn đúng y hệt, chỉ chậm dần khi dữ liệu nhiều lên.
