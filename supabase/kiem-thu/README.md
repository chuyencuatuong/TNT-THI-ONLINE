# Kiểm thử SQL (chạy trên máy, không đụng Supabase thật)

Dựng một Postgres trong bộ nhớ (PGlite), chạy `schema.sql` + mọi `migration_0xx`
theo thứ tự, rồi kiểm tra:

- `parity.mts` — hàm chấm điểm SQL (`submit_attempt`) cho kết quả y hệt
  `src/lib/scoring.ts` (hàng nghìn trường hợp ngẫu nhiên + cách JS đọc số).
- `e2e.mts` — 3 kiểu chấm điểm, nộp lại, quyền RLS: học sinh không đọc được
  đáp án trước khi nộp, không tự sửa điểm, không tự lên giáo viên.
- `guest.mts` — luồng khách từ link công khai: chỉ làm được đề công khai,
  không đổi cờ khách, trang landing đọc được khi chưa đăng nhập.

Chạy:

```
cd supabase/kiem-thu
npm install
npm test
```

Mỗi file in `TẤT CẢ ĐẠT` khi qua. Bắt buộc chạy lại sau khi sửa luật chấm ở
`src/lib/scoring.ts` hoặc ở `submit_attempt` (migration_022) — hai nơi phải
khớp nhau.
