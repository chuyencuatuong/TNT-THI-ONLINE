# Hướng dẫn cài đặt

Bạn không cần biết code hay dòng lệnh nào. Chỉ cần **2 việc**: tải code lên
GitHub bằng cách kéo-thả file (không cần git), và dán 3 giá trị vào ô cấu
hình. Khoảng 10 phút.

---

## Nếu bạn ĐÃ cài đặt trước đó — chỉ cần làm 1 việc để cập nhật

**Bản cập nhật mới nhất (25/08/2026 — làm mới giao diện toàn bộ + thẻ chia
sẻ + chuẩn bị đi vào vận hành thật)** gộp chung mấy đợt gần đây, thêm:

- **Giao diện responsive trên điện thoại** (menu hamburger, không còn tràn
  màn hình), **làm mới thị giác** (khoảng cách/đổ bóng đồng nhất, khối "Công
  cụ học mỗi ngày" thu gọn mặc định).
- **Trang kết quả thi chia 3 tab** (Tổng quan / Chẩn đoán / Xem lại bài làm)
  + nút **"Tải phiếu kết quả"** (in ra bản gọn, học sinh lưu thành PDF được).
- **Chế độ tối** (nút bật/tắt cạnh nút đăng xuất), nhớ lựa chọn giữa các lần
  vào lại.
- **Hồ sơ học sinh mở rộng**: lần đầu đăng nhập, học sinh điền thêm ngày
  sinh, SĐT, trường, giới tính, tỉnh/TP — giáo viên xem được ở trang chi
  tiết từng học sinh. **Cần chạy 1 file SQL mới, xem mục bên dưới.**
- **Thẻ chia sẻ** (trang chủ học sinh): khi điểm cải thiện so với lần làm
  gần nhất, hoặc chuỗi ôn tập đạt từ 3 ngày liên tiếp, học sinh thấy nút
  "Chia sẻ tiến bộ" / "Chia sẻ chuỗi ôn tập" — bấm vào xem trước thẻ ảnh
  vuông (thương hiệu TNT), tải PNG về tự đăng lên Locket/story nếu muốn.
  Chỉ so học sinh với chính họ ở quá khứ, không xếp hạng/so với bạn khác.
  Không cần SQL gì thêm cho mục này (dùng lại dữ liệu đã có sẵn).

**Trước khi cho học sinh thật dùng, làm thêm 2 việc sau (chỉ 1 lần):**

1. **Chạy migration hồ sơ học sinh** (nếu chưa chạy): Supabase Dashboard >
   SQL Editor > New query > mở file
   `supabase/migration_011_ho_so_hoc_sinh.sql` trong bản zip, copy dán, Run.
2. **Dọn dữ liệu thử nghiệm**: mở file
   `supabase/don_dep_du_lieu_thu_nghiem.sql` trong bản zip — đọc kỹ hướng dẫn
   trong file (chạy PHẦN xem trước rồi mới đến PHẦN xoá), dùng để xoá sạch
   tài khoản/đề thi/câu hỏi/lượt làm bài đã tạo lúc thử nghiệm, chỉ giữ lại
   tài khoản giáo viên của bạn. **Đây là xoá vĩnh viễn, không khôi phục
   được** — đọc kỹ trước khi chạy phần xoá.

<details>
<summary>Bản cập nhật trước đó (23/08/2026 — Đợt 3: xáo đáp án ôn tập, chia đợt ôn tập, dashboard giáo viên 3 cột)</summary>

**Bản cập nhật (23/08/2026 — Đợt 3: xáo đáp án ôn tập, chia đợt ôn
tập, dashboard giáo viên 3 cột)** thêm:

- **Xáo ngẫu nhiên vị trí đáp án ở màn hình Ôn tập câu sai**: mỗi lần 1 câu
  hiện ra để ôn, vị trí các đáp án (A/B/C/D hoặc a/b/c/d) được xáo lại ngẫu
  nhiên — để học sinh không thể "đối phó" yêu cầu 3 buổi làm đúng liên tiếp
  bằng cách nhớ đúng vị trí đã bấm lần trước rồi bấm lại y hệt mà không thực
  sự hiểu bài. Chỉ áp dụng ở màn hình ôn tập — đề thi thật (làm bài chính
  thức) KHÔNG xáo, giữ nguyên như cũ.
- **Chia nhỏ buổi ôn tập thành nhiều "đợt" khi nhật ký có nhiều câu**: mỗi
  đợt tối đa 10 câu. Nếu tổng số câu không chia hết cho số đợt, các đợt SAU
  sẽ nhiều câu hơn đợt trước (dồn phần dư về cuối), đảm bảo không đợt nào
  vượt quá 10 câu. Ví dụ 23 câu đang cần ôn sẽ chia thành 3 đợt: 7-8-8 câu.
  Toàn bộ các đợt này vẫn tính chung là **1 buổi ôn tập** (đúng 1 trong 3
  buổi riêng biệt cần để rút câu khỏi nhật ký) — chia đợt chỉ để đỡ mỏi khi
  làm liền một lúc, không phải chia nhỏ số buổi cần làm đúng liên tiếp.
  *(Lưu ý: ban đầu có nhắc tới "số nguyên tố" như một trường hợp cần chia lẻ
  — thực ra yếu tố quyết định là tổng số câu có chia HẾT cho số đợt hay
  không, không phải bản thân nó có phải số nguyên tố hay không; ví dụ 15 câu
  dù không phải số nguyên tố vẫn chia lẻ 7-8 giống hệt 1 số nguyên tố. Đã
  viết đúng 1 công thức chung xử lý mọi trường hợp, không cần kiểm tra riêng
  số nguyên tố.)*
- **Dashboard tổng quan giáo viên — bố cục 3 cột mới** (trang "Tổng quan" khi
  đăng nhập giáo viên): cột 1 là danh sách học sinh (bấm để chọn), cột 2 là
  biểu đồ % đúng theo TỪNG CHƯƠNG của học sinh đang chọn, cột 3 so sánh học
  sinh đang chọn với TRUNG BÌNH CẢ LỚP theo từng chương. Khi chưa chọn học
  sinh nào (mở trang lần đầu), cả 3 cột mặc định hiện tổng quan cả lớp. Bảng
  thống kê cũ (điểm trung bình, số lần làm bài) vẫn còn, nằm trong cột danh
  sách học sinh; trang chi tiết từng học sinh (bấm "Xem chi tiết") không đổi.
  *(Lưu ý: biểu đồ này gộp theo CHƯƠNG, không phải "dạng bài chi tiết" —
  dạng bài chi tiết vẫn chưa được nhập/dùng thật nên nếu gộp theo đó nhiều
  khả năng biểu đồ sẽ trống trơn; chương thì đã được gán khá đầy đủ từ Đợt 1
  nên có dữ liệu thật để hiển thị ngay.)*

**Không cần chạy SQL nào cho lần cập nhật này** — chỉ cần lặp lại **Việc 1**
bên dưới (kéo-thả toàn bộ file trong bản zip mới đè lên repo cũ trên GitHub),
không cần làm lại Việc 2 và không có migration mới.

<details>
<summary>Bản cập nhật trước đó (23/08/2026 — Đợt 2: Kho đề có bộ lọc + Ôn tập câu sai)</summary>

**Bản cập nhật (23/08/2026 — Đợt 2: Kho đề có bộ lọc + Ôn tập câu
sai)** thêm:

- **Thư mục/Chương trình giờ CHỌN từ danh sách thay vì gõ tự do**: khi
  tạo/sửa đề, ô "Thư mục" (tuyển tập) và ô mới "Chương trình" (kỳ thi — VD
  Giữa kỳ 1, Luyện đề tổng ôn...) giờ là 1 danh sách xổ xuống, chọn cái đã có
  sẵn hoặc bấm "+ ... mới" khi thật sự cần thêm — tránh việc gõ tay dễ tạo ra
  nhiều thư mục na ná nhau (vd "GK1" và "Gk 1"). Đổi tên 1 thư mục sẽ áp dụng
  ngay cho mọi đề đang thuộc thư mục đó.
- **Khối + Chương cho mỗi đề**: đề giờ có thể gán "Khối" (10/11/12) và chọn
  (nhiều) "Chương" mà đề đó bao phủ — màn hình nhập đề tự chọn sẵn theo gợi ý
  AI của từng câu, bạn xem lại/đổi nếu cần. Dùng để lọc ở mục "Kho đề" mới.
- **Trang chủ học sinh gọn lại**: mục "Đề thi có thể làm" giờ chỉ hiện đúng 1
  đề mới thêm gần đây nhất (đỡ rối khi số đề tăng dần), kèm nút "Xem tất cả
  trong Kho đề".
- **Trang mới "Kho đề"** (`/hoc-sinh/kho-de`): mặc định hiện các thẻ theo
  thư mục/tuyển tập (bấm vào xem danh sách đề bên trong, giống các nền tảng
  luyện đề phổ biến). Có bộ lọc chọn nối tiếp **Khối → Chương trình →
  Chương** ở sidebar — hễ chọn bất kỳ điều kiện nào thì chuyển sang xem danh
  sách đề khớp lọc (bỏ qua nhóm thư mục), bấm "Bỏ lọc" để quay lại xem theo
  thư mục.
- **Ôn tập câu sai (nhật ký kiểu Leitner)**: sau khi nộp bài, câu làm
  sai/chưa trọn điểm tự động vào "nhật ký ôn tập" của học sinh đó (thấy số
  lượng ở trang chủ, mục "Ôn tập câu sai"). Trang ôn tập riêng
  (`/hoc-sinh/on-tap-cau-sai`) lấy ngẫu nhiên các câu đang cần ôn, không tính
  giờ, học sinh trả lời lại y hệt lúc làm đề gốc. Câu chỉ được rút khỏi nhật
  ký khi làm đúng **đủ 3 buổi ôn tập RIÊNG BIỆT liên tiếp** (không phải 3
  lần trong cùng 1 lần mở màn hình) — làm sai bất kỳ buổi nào thì tính lại
  từ đầu. Đây mới là bản đơn giản (trả lời lại y hệt câu gốc); chế độ "sắp
  xếp lại các bước lời giải" (kéo thả) sẽ làm ở đợt sau, code đã viết sẵn để
  dễ thêm chế độ mới mà không cần đổi lại phần đã có.

1. **Tải lại code**: lặp lại **Việc 1** bên dưới (kéo-thả toàn bộ file trong
   bản zip mới đè lên repo cũ trên GitHub) — không cần làm lại Việc 2.
2. **Chạy thêm SQL (bắt buộc, chỉ 1 lần)**: vào Supabase Dashboard >
   **SQL Editor** > **New query**, mở file
   `supabase/migration_008_kho_de_va_on_tap_leitner.sql` trong bản zip mới,
   copy toàn bộ nội dung, dán vào query mới, bấm **Run**. File này thêm cột
   mới vào bảng `exams` (giữ nguyên dữ liệu cũ — cột "Thư mục" cũ tự động
   chuyển sang danh sách quản lý mới, không cần bạn nhập lại tay) và vài
   bảng mới, không đụng tới dữ liệu hiện có.

   Nếu bỏ qua bước này, trang sẽ báo lỗi khi tạo/sửa đề hoặc vào "Kho đề" vì
   database chưa có cột/bảng mới.

<details>
<summary>Bản cập nhật trước đó (23/08/2026 — Đợt 1 cải tiến)</summary>

**Bản cập nhật (23/08/2026 — Đợt 1 cải tiến)** thêm:

- **Tự nhận CHƯƠNG khi nhập đề**: khi tạo đề từ PDF/Word, AI gợi ý luôn
  chương phù hợp cho từng câu (dựa trên khung chương đã gieo sẵn) — màn hình
  xem trước có thêm ô chọn "Chương" cho từng câu, đã điền sẵn theo gợi ý AI,
  bạn xem lại/đổi nếu cần trước khi xuất bản. "Ngân hàng câu hỏi" cũng có nút
  "Phân loại lại chương bằng AI" để gán lại chương cho các câu cũ chưa có
  chương — AI chỉ **gợi ý**, mỗi câu vẫn cần bạn bấm "Xác nhận" mới áp dụng
  thật (không tự động gán để tránh sai).
- **Thư mục đề tự do**: khi tạo/sửa đề, có thêm ô "Thư mục" — gõ tên tuỳ ý
  (vd: "Đề giữa kỳ", "Đề ôn chương 1"), để trống thì đề nằm ở nhóm "Chưa phân
  loại". Trang "Đề thi" (giáo viên) và "Đề thi có thể làm" (học sinh) giờ
  hiện theo từng nhóm thư mục, gập/mở được.
- **Link Google Drive cho mỗi đề**: ô "Link Google Drive" khi tạo/sửa đề (dán
  link file đề gốc bạn tự tải lên Drive) — học sinh sẽ thấy nút "Tải đề" bên
  cạnh nút "Bắt đầu làm bài" nếu đề có link. Không bắt buộc, và hệ thống
  không lưu file nào cả (chỉ lưu đường link) để không tốn thêm dung lượng.
- **Thanh tìm kiếm**: thêm ô tìm kiếm ở "Ngân hàng câu hỏi", trang "Đề thi"
  (giáo viên) và "Đề thi có thể làm" (học sinh).
- **Vá thêm (cùng ngày)**: sửa 1 lỗi khiến cả 1 đợt câu hỏi (thường 5-6 câu)
  bị mất trắng khi AI lỡ quên "nhân đôi" dấu `\` trong công thức LaTeX (gặp
  khi tạo đề từ PDF) — giờ hệ thống tự sửa lỗi định dạng này trước khi bỏ
  cuộc, nên không còn mất câu hỏi vì lỗi vặt này nữa. Nếu bấm "Tạo đề thi
  mới" mà vẫn thấy lỗi `503`/"quá tải" từ Google, đó là do Google tạm quá
  tải (không phải lỗi ở web) — bấm thử lại sau ít phút là được, hệ thống đã
  tự thử lại vài lần trước khi báo lỗi cho bạn.

Cần chạy `supabase/migration_007_chuong_thu_muc_drive.sql` nếu chưa chạy.

</details>

<details>
<summary>Bản cập nhật trước đó (22/08/2026)</summary>

**Bản cập nhật (22/08/2026)** thêm:

- **Sửa lỗi màn hình bị "kẹt" sau khi đăng ký/đăng nhập** — trước đây sau khi
  đăng ký xong (hoặc đăng nhập), trang đứng im ở form cũ khiến người dùng
  tưởng bị lag; giờ tự động chuyển thẳng vào trang chủ tương ứng (học sinh
  hoặc giáo viên) ngay khi xong.
- **Trang chủ học sinh có dashboard tiến độ**: lời chào kèm tên, số bài đã
  làm, điểm trung bình, điểm gần nhất, mức cải thiện so với lần trước, tổng
  thời gian làm bài, và biểu đồ xu hướng điểm số.
- **Trang chi tiết học sinh (GV) hiện kết quả theo TỪNG đề thi**: mỗi đề liệt
  kê đủ các lần làm, kèm chênh lệch điểm và thời gian hoàn thành so với lần
  đầu và lần ngay trước đó (lần n-1) — để thấy rõ học sinh có tiến bộ qua các
  lần làm lại hay không (gộp chung với cột mức độ giám sát đã có trước đó).
- **Xem lại bài làm sau khi nộp bài**: trang kết quả của học sinh giờ hiện
  từng câu đã làm — chỗ nào đúng, chỗ nào sai/thiếu, đáp án đúng là gì — và
  **lời giải chi tiết** (nếu giáo viên có nhập) ngay bên dưới mỗi câu.
- **Lời giải chi tiết khi tạo đề**: cả màn hình "Tạo đề thi mới" (JSON dán
  vào, field mới `solution_latex`) lẫn "Ngân hàng câu hỏi" (nhập tay từng
  câu) giờ có thêm ô nhập lời giải — không bắt buộc, và **chỉ hiện ra cho
  học sinh sau khi các em đã nộp bài**, không hiện lúc đang làm bài.

1. **Tải lại code**: lặp lại đúng **Việc 1** bên dưới (kéo-thả toàn bộ file
   trong bản zip mới đè lên repo cũ trên GitHub) — không cần làm lại Việc 2
   (3 giá trị cấu hình vẫn giữ nguyên).
2. **Chạy thêm SQL (bắt buộc, chỉ 1 lần)**: vào Supabase Dashboard >
   **SQL Editor** > **New query**, mở file `supabase/migration_006_loi_giai.sql`
   trong bản zip mới, copy toàn bộ nội dung, dán vào query mới, bấm **Run**.
   Đây là file DUY NHẤT mới ở bản cập nhật này (chỉ thêm 1 cột lưu lời giải
   vào bảng câu hỏi có sẵn) — các file `migration_002` đến `migration_005` đã
   chạy ở các lần cập nhật trước thì bỏ qua, không cần chạy lại.

   Nếu bỏ qua bước này, màn hình nhập lời giải vẫn hiện được nhưng lưu sẽ báo
   lỗi vì database chưa có cột mới.

<details>
<summary>Các lần cập nhật trước — nếu bạn cài lần đầu từ bản zip cũ hơn thì cần chạy đủ các bước dưới đây</summary>

3. **Chạy các file SQL của những lần cập nhật trước (bỏ qua file nào đã chạy
   rồi)**: cùng chỗ SQL Editor > New query như bước 2, mở lần lượt từng file
   sau, copy dán, bấm Run (mỗi file 1 query riêng):
   - `supabase/migration_002_import_and_tracking.sql`
   - `supabase/migration_003_question_images_storage.sql`
   - `supabase/migration_004_giam_sat_thi.sql`
   - `supabase/migration_005_chuong_toan12.sql`
4. **Tắt yêu cầu xác nhận email (bắt buộc, chỉ 1 lần)**: vào Supabase
   Dashboard > **Authentication** > **Sign In / Providers** (hoặc mục
   **Emails**, tuỳ giao diện) > tìm mục **Email** provider > tắt công tắc
   **"Confirm email"** > **Save**. Bỏ qua bước này thì đăng ký tài khoản mới
   sẽ báo lỗi vì hệ thống vẫn cố gửi email xác nhận.

   Nếu trước đó bạn có bật "Custom SMTP" (Resend) theo hướng dẫn cũ, giờ có
   thể tắt luôn cho gọn (không bắt buộc, không dùng nữa) — vào cùng trang
   đó, tắt **"Enable Custom SMTP"**.

</details>

</details>

</details>

Sau khi GitHub Actions build xong (xem tab Actions, đợi dấu tích xanh), vào
lại website là dùng được ngay — nếu là lần cập nhật đầu tiên từ cách đăng
nhập cũ, lưu ý **tài khoản cũ (nếu có) sẽ cần đăng ký lại bằng mật khẩu** vì
cách đăng nhập cũ (gửi link qua email) không còn dùng được nữa (xem mục kế
tiếp).

### Vì sao đổi cách đăng nhập

Cách cũ ("Gửi link đăng nhập" qua email) phụ thuộc vào dịch vụ gửi email
(Resend) — dịch vụ này miễn phí nhưng ở chế độ test chỉ gửi được email tới
đúng địa chỉ bạn dùng đăng ký tài khoản Resend, không gửi được cho học sinh.
Để gửi được cho học sinh cần xác minh 1 tên miền riêng, tốn thêm chi phí và
công sức thiết lập. Vì bạn muốn giữ chi phí 0 đồng, cách gọn nhất là bỏ hẳn
việc gửi email: học sinh/giáo viên tự đặt **email + mật khẩu** khi đăng ký
lần đầu, những lần sau đăng nhập lại bằng đúng email + mật khẩu đó — không
cần dịch vụ gửi email nào cả, không giới hạn số lượng, không tốn phí.

Đánh đổi duy nhất: hệ thống không tự gửi email "quên mật khẩu" được nữa (vì
đúng bản chất là không gửi email nào cả). Nếu học sinh quên mật khẩu, bạn
(giáo viên) dùng công cụ riêng tôi gửi kèm — xem mục "Học sinh quên mật
khẩu" bên dưới — để đặt lại giúp, không cần chờ email.

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

   Có thể thêm 1 secret **không bắt buộc** thứ 4, `VITE_GEMINI_MODEL`, nếu
   sau này thấy báo lỗi gọi AI (model không khả dụng) — điền đúng tên model
   bạn thấy khả dụng trong tài khoản Google AI Studio của mình. Nếu không
   thêm, hệ thống tự dùng model mặc định đã cấu hình sẵn trong code.

Sau khi lưu xong secret thứ 3, vào tab **Actions** ở repo, bạn sẽ thấy 1
workflow đang chạy (biểu tượng vàng đang xoay). Đợi khoảng 1-2 phút tới khi
nó chuyển thành dấu tích xanh — lúc đó website đã lên rồi, mở tại:

`https://<tên-tài-khoản-của-bạn>.github.io/TNT-THI-ONLINE/`

Việc bật GitHub Pages đã được cấu hình tự động trong quy trình build, bạn
không cần bấm thêm gì ở phần Settings > Pages.

---

## Sau khi có website — dùng như thế nào

- **Giáo viên — cách nhanh nhất để tạo đề**: mở link website, đăng nhập,
  lần đầu chọn vai trò "Giáo viên". Vào **"+ Tạo đề thi mới"**. Cách chính
  từ bản cập nhật 23/08/2026: xuất file Word ra **PDF** (Word → File → Save
  As → PDF, giữ nguyên công thức MathType, không cần chỉnh sửa gì), rồi tải
  file PDF đó lên ở màn hình "Tạo đề thi mới". Trình duyệt tự đọc SONG SONG
  2 nguồn cho mỗi trang: văn bản thật nhúng sẵn trong PDF (chính xác tuyệt
  đối, không tốn AI) và ảnh cả trang (chỉ để AI đọc công thức MathType đã
  thành hình khi xuất PDF, nhận diện hình vẽ, và xác định đáp án qua tín
  hiệu thị giác) — nhờ vậy AI không cần tự gõ lại toàn bộ chữ tiếng Việt từ
  ảnh nữa, nên nhanh hơn, nhẹ hơn (tốn ít token AI hơn hẳn) và chính xác hơn
  so với cách đọc ảnh toàn trang trước đây. AI cũng tự nhận diện đáp án đúng
  (tô màu/gạch chân/in đậm/dấu "*"/ghi chú "Đáp án:"...) và lấy luôn lời
  giải chi tiết nếu đề có ghi sẵn dưới mỗi câu — nhưng màn hình xem trước
  sau đó vẫn cho sửa tay bằng LaTeX và **bạn cần xác nhận đáp án đúng cho
  từng câu** trước khi bấm
  "Xuất bản đề thi" (hệ thống không tự công bố đề khi chưa có đáp án được
  xác nhận, để tránh chấm sai — AI đọc ảnh vẫn có thể đọc sai màu/nét mờ,
  nhất là công thức khó hoặc ảnh chụp không rõ). Câu nào có kèm bảng biến
  thiên/đồ thị, AI chưa tự lấy được ảnh đó — sẽ ghi chú rõ câu nào cần dán
  tay ở phần "AI lưu ý", dùng ô "Hình minh hoạ" ở mỗi câu để dán ảnh: **copy
  ảnh trong Word (Ctrl+C) rồi bấm vào ô đó dán luôn (Ctrl+V)**, không cần
  lưu file ảnh ra máy trước. Cách dán JSON đã xử lý sẵn và cách đọc thẳng
  file .docx (kém chính xác hơn với MathType) vẫn còn, nằm trong mục
  "Cách khác" (bấm để mở ra) — dùng khi không có file PDF hoặc muốn kiểm
  soát thủ công hoàn toàn. Ở màn hình xem trước, mỗi câu còn có ô "Chương" đã
  điền sẵn theo gợi ý AI — xem lại/đổi nếu cần. Khi đặt tên đề, có thêm ô
  "Thư mục" (gõ tên tuỳ ý để nhóm đề lại, vd "Đề giữa kỳ") và "Link Google
  Drive" (dán link file đề gốc để học sinh tải về).
- **Giáo viên — cách thủ công (không bắt buộc)**: vào "Ngân hàng câu hỏi" để
  nhập từng câu bằng tay (viết công thức Toán bằng cách đặt trong dấu
  `$...$`, ví dụ gõ `$x^2 - 3x + 2 = 0$` sẽ hiển thị thành công thức đẹp),
  rồi vào "Đề thi" để gom câu hỏi thành 1 đề. Ngân hàng câu hỏi có ô tìm
  kiếm, lọc theo chương, và nút "Phân loại lại chương bằng AI" để gán chương
  cho các câu cũ chưa có (mỗi câu vẫn cần bấm "Xác nhận" mới áp dụng thật).
- **Đăng nhập lần đầu (cả giáo viên và học sinh)**: mở link website, nhập
  email + đặt 1 mật khẩu (ít nhất 6 ký tự), bấm "Đăng ký tài khoản mới".
  Không cần dùng email thật có thể nhận thư — chỉ cần một địa chỉ dạng email
  hợp lệ để hệ thống phân biệt từng người, và **nhớ đúng mật khẩu đã đặt**
  vì không có cách tự lấy lại qua email. Lần đầu đăng nhập xong, hệ thống sẽ
  hỏi họ tên + vai trò (Giáo viên/Học sinh).
- **Học sinh**: mở link website, đăng nhập bằng email tương tự, chọn vai trò
  "Học sinh", sẽ thấy danh sách đề để làm và lịch sử điểm các lần trước. Màn
  hình làm bài có đồng hồ đếm ngược (nếu đề có giới hạn thời gian) và danh
  sách câu hỏi bên phải để nhảy nhanh tới từng câu. Làm xong, dashboard hiện
  ra ngay: điểm số, thời gian từng câu, và chẩn đoán mức độ nắm vững theo
  từng dạng bài (chỉ áp dụng khi câu hỏi đã được gán "dạng bài" — xem ngân
  hàng câu hỏi hoặc gán khi tạo đề từ PDF/Word).
- **Phụ huynh**: không cần tài khoản — giáo viên bấm "Tạo báo cáo" trong
  trang chi tiết học sinh, hệ thống tự sinh 1 link riêng để gửi qua Zalo/tin
  nhắn cho phụ huynh xem trực tiếp.

### Học sinh quên mật khẩu

Vì hệ thống không gửi email nào cả (xem lý do ở trên), không có nút "Quên
mật khẩu" tự động. Cách xử lý: mở file **`reset-mat-khau-hoc-sinh.html`**
tôi gửi kèm riêng (không nằm trong bản zip code, không đưa lên GitHub) —
đây là 1 trang công cụ chỉ chạy trên máy bạn, dùng để đặt mật khẩu mới cho
học sinh trực tiếp trong database, không qua email:

1. Mở file đó bằng trình duyệt (double-click là mở được, không cần cài gì).
2. Lấy **Service Role Key**: vào Supabase Dashboard > Project Settings >
   API > mục "Project API keys" > dòng **service_role** > bấm "Reveal" >
   copy. Dán vào ô "Service Role Key" trong trang công cụ, cùng với Project
   URL (giống giá trị `VITE_SUPABASE_URL` đã dùng ở Việc 2).
3. Nhập email học sinh + mật khẩu mới, bấm "Đặt lại mật khẩu".
4. Đọc mật khẩu mới cho học sinh để họ đăng nhập lại.

**Lưu ý quan trọng**: Service Role Key là chìa khoá quản trị cao nhất của
toàn bộ database — tuyệt đối không chia sẻ file này hay key này cho ai,
không đưa lên GitHub hay bất kỳ nơi công khai nào. Chỉ dùng trên máy riêng
của bạn.

### Giám sát khi học sinh làm bài (giới hạn cần biết)

Màn hình làm bài giờ có thêm: ghi nhận nếu học sinh rời tab/cửa sổ đang làm
bài hoặc thoát toàn màn hình giữa chừng, và **chặn hẳn** việc sao chép nội
dung đề hoặc dán nội dung vào ô trả lời. Vào trang chi tiết học sinh (bấm
vào tên học sinh), mục "Lịch sử làm bài & mức độ nghi ngờ" hiện nhãn Bình
thường / Nghi ngờ nhẹ / Nghi ngờ cao cho từng lượt làm bài, dựa trên số lần
có các dấu hiệu trên.

**Giới hạn thật của một website thường (không phải phần mềm thi cử chuyên
dụng)**: không thể ngăn học sinh dùng điện thoại/máy khác để tra cứu, hay mở
hẳn 1 trình duyệt/thiết bị thứ hai — những việc này không để lại dấu vết
trên trang. Nhãn "mức độ nghi ngờ" chỉ là gợi ý để bạn hỏi lại học sinh, hoàn
toàn không phải bằng chứng gian lận chắc chắn. Nếu cần giám sát chặt hơn nữa
(ví dụ khoá thiết bị thật sự), sẽ cần phần mềm/thiết bị chuyên dụng riêng,
ngoài phạm vi 1 website.

### Khung 6 chương Toán 12

Đã gieo sẵn 6 chương lớn của Toán 12 vào khung kiến thức (chạy
`migration_005_chuong_toan12.sql` là có ngay, không cần tạo tay): Ứng dụng
đạo hàm để khảo sát và vẽ đồ thị hàm số, Véc tơ và hệ trục tọa độ trong
không gian, Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm,
Nguyên hàm và tích phân, Phương pháp tọa độ trong không gian, Xác suất có
điều kiện. Dạng bài chi tiết trong từng chương và mức độ khó (nhận biết /
thông hiểu / vận dụng / vận dụng cao) để làm sau — hiện tại gán câu hỏi vào
đúng chương là đủ.

### Lưu ý về phần "chẩn đoán mất gốc / chưa vững"

Đây là gợi ý dựa trên 1 quy tắc đơn giản do tôi tự đặt ra (độ chính xác +
thời gian làm bài + số lần đổi đáp án), **không phải** một công cụ chẩn đoán
giáo dục đã được kiểm chứng khoa học. Nên dùng để gợi ý hướng ôn tập ban
đầu, đối chiếu thêm với quan sát thực tế trên lớp, không nên coi là kết luận
cuối cùng về học sinh.

Nếu tôi cập nhật thêm code sau này, tôi sẽ gửi lại 1 file zip mới — bạn chỉ
cần lặp lại **Việc 1** (tải lên GitHub) với các file mới, không cần làm lại
Việc 2. Có chỗ nào vướng cứ nhắn lại trong đây.
