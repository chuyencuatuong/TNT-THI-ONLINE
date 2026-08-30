-- ============================================================================
-- Cập nhật thêm: cho phép tải ảnh minh hoạ (bảng biến thiên, đồ thị...) lên
-- cho từng câu hỏi. Chỉ cần chạy 1 LẦN file này trong Supabase Dashboard >
-- SQL Editor > New query. An toàn chạy lại nhiều lần.
-- ============================================================================

-- 1. Tạo 1 "bucket" lưu trữ file riêng cho ảnh câu hỏi, để công khai (public)
--    để ảnh hiển thị được trực tiếp trên trang web mà không cần đăng nhập
--    (giống hệt cách ảnh trên hầu hết các website hoạt động).
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

-- 2. Chỉ giáo viên (role='teacher') mới được tải/sửa/xoá ảnh trong bucket này.
--    Việc XEM ảnh thì công khai (không cần policy riêng) vì bucket đã public.
drop policy if exists "question_images_insert_teacher" on storage.objects;
create policy "question_images_insert_teacher" on storage.objects
  for insert
  with check (bucket_id = 'question-images' and is_teacher());

drop policy if exists "question_images_update_teacher" on storage.objects;
create policy "question_images_update_teacher" on storage.objects
  for update
  using (bucket_id = 'question-images' and is_teacher());

drop policy if exists "question_images_delete_teacher" on storage.objects;
create policy "question_images_delete_teacher" on storage.objects
  for delete
  using (bucket_id = 'question-images' and is_teacher());
