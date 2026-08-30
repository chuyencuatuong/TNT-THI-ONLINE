-- ============================================================================
-- Thêm các trường hồ sơ cho học sinh (thu thập khi đăng nhập lần đầu, xem
-- LoginPage.tsx "Hoàn tất hồ sơ"): ngày sinh, số điện thoại, trường đang học,
-- giới tính, tỉnh/thành. Chỉ cần chạy 1 LẦN file này trong Supabase Dashboard
-- > SQL Editor > New query. An toàn chạy lại nhiều lần.
--
-- Toàn bộ cột đều NULLABLE — không bắt buộc với hồ sơ cũ đã tạo trước migration
-- này (GV hoặc HS đăng ký trước đó không cần điền lại gì). Form nhập chỉ hiện
-- các trường này khi vai trò = học sinh (GV giữ nguyên form ngắn như cũ).
-- ============================================================================

alter table profiles add column if not exists date_of_birth date;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists school_name text;
alter table profiles add column if not exists gender text
  check (gender is null or gender in ('nam', 'nu', 'khac'));
alter table profiles add column if not exists province text;

comment on column profiles.date_of_birth is 'Ngày sinh — chỉ thu thập cho học sinh, không bắt buộc với GV.';
comment on column profiles.phone is 'Số điện thoại liên hệ — không validate chặt định dạng (công cụ nội bộ, không phải form công khai).';
comment on column profiles.school_name is 'Tên trường đang học — nhập tự do (không có danh sách trường cố định để chọn).';
comment on column profiles.gender is '''nam'' | ''nu'' | ''khac'' — giới hạn 1 tập giá trị cố định vì đây là form nội bộ có kiểm soát, không phải free text.';
comment on column profiles.province is 'Tỉnh/thành phố (chọn từ danh sách cố định ở src/lib/vietnamProvinces.ts, không phải free text) — tránh dữ liệu phân mảnh do gõ tay.';
