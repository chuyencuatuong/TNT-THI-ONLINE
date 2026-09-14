# Đọc trước khi upload lên GitHub

*(Xoá file này sau khi đọc xong — nó không thuộc mã nguồn dự án.)*

Thư mục này là **toàn bộ dự án đã hoàn chỉnh**, gồm:

1. Tính năng "Quản lý & thúc đẩy xử lý câu sai" (Lần 1 / Lần 2 / Lần 3).
2. Tính năng **"Sửa điểm"** — giáo viên chỉnh lại điểm sau khi học sinh nộp bài.
3. Bản vá bảo trì: nâng `vite` 5→8, `vitest` 2→5, `react-router-dom` 6→7,
   `@vitejs/plugin-react` 4→6 (vá 8 lỗ hổng bảo mật → còn 0), sửa `.env.example`.

Đã kiểm tra trước khi đóng gói: typecheck sạch, 370/370 unit test đạt,
`npm run build` thành công, `npm audit` 0 lỗ hổng, và chạy thật trên trình
duyệt (cả giao diện sáng lẫn tối) không có lỗi.

---

## Bước 1 — Upload mã nguồn (GitHub web)

1. Mở repo `TNT-THI-ONLINE` trên GitHub → **Add file** → **Upload files**.
2. Kéo **toàn bộ nội dung bên trong thư mục này** vào (kéo từng thư mục con
   `src`, `supabase`, `public`, `.github` và các file lẻ ở gốc).
3. Commit.

## Bước 2 — Chạy SQL trong Supabase

Vào Supabase → **SQL Editor** → dán từng file rồi Run:

| File | Bắt buộc? | Không chạy thì sao |
|---|---|---|
| `supabase/migration_018_gv_sua_diem_sau_khi_nop.sql` | **BẮT BUỘC** | Nút "Sửa điểm" báo lỗi thiếu cột. Phần còn lại của web vẫn chạy bình thường. |
| `supabase/migration_017_chi_muc_on_tap_cau_sai.sql` | Không | Web vẫn đúng y hệt, chỉ chậm dần khi dữ liệu nhiều lên. |

Cả hai file đều **không đụng tới dữ liệu điểm hay bài làm đã có**, và chạy lại
nhiều lần vẫn an toàn.

## ⚠️ Bước 3 — Xoá file rác cũ (GitHub web không tự làm được)

Upload chỉ **thêm/ghi đè**, không xoá được file đã có sẵn trên repo. Nếu repo
của thầy vẫn còn 16 file rác ở gốc thì xoá thủ công:

- `tsconfig.tsbuildinfo`
- 15 file tên dạng `vite.config.ts.timestamp-*.mjs`

Cách xoá: mở từng file trên GitHub → nút thùng rác (Delete this file) → Commit.
Chỉ làm 1 lần duy nhất; `.gitignore` mới đã chặn không cho chúng quay lại.

> Nếu thầy dùng Git trên máy thì nhanh hơn nhiều — copy đè thư mục này lên bản
> repo ở máy rồi:
> `git add -A && git commit -m "Sua diem + xu ly cau sai" && git push`
> Lệnh `git add -A` tự nhận biết các file rác đã bị xoá, không phải làm tay.

---

## Cách dùng tính năng "Sửa điểm"

1. Vào **Tổng quan → chọn học sinh → Xem chi tiết**.
2. Ở bảng "Kết quả theo từng đề thi", cột **Điểm** có nút **"Sửa điểm"**.
3. Màn hình mở ra mặc định chỉ hiện **câu chưa trọn điểm**. Với câu bị trục trặc:
   - Bấm **"Cho trọn điểm"** nếu xác nhận em đáng ra được trọn điểm, hoặc
   - Tự chọn/gõ lại đúng đáp án em đã nói với thầy.
4. Góc trên phải hiện **điểm cũ → điểm mới** ngay khi sửa, chưa lưu gì cả.
5. **Ghi lý do** (bắt buộc — học sinh sẽ đọc được), rồi bấm **"Lưu & chấm lại"**.

Sau khi lưu:

- Điểm, năng lực theo Chương/Bài và phần chẩn đoán đều tự cập nhật theo.
- Câu được sửa thành đúng sẽ **tự rút khỏi nhật ký ôn tập câu sai** của em
  (trục trặc kỹ thuật không phải lỗ hổng kiến thức).
- Trang kết quả của học sinh hiện nhãn *"Điểm bài này đã được thầy điều chỉnh"*
  kèm điểm gốc → điểm mới và lý do thầy ghi.
- **Đáp án gốc các em đã điền không bị mất** — vẫn xem lại và đối chiếu được.
