-- ============================================================================
-- Khung kiến thức Lớp → Chương → Bài + tiến độ bài dạy (31/08/2026).
-- Chạy 1 LẦN trong Supabase Dashboard > SQL Editor > New query. An toàn chạy
-- lại nhiều lần (mọi lệnh đều "if not exists"/"if exists", các thao tác đổi
-- tên đều tự kiểm tra trước khi đổi).
--
-- Bối cảnh: "dạng bài" (question_types) chưa từng được giáo viên nhập/dùng
-- thật (xem ghi chú trong src/lib/chapterStats.ts, migration_005) — dashboard
-- và trang chẩn đoán học sinh đều đã né dữ liệu này vì luôn trống. Thay vì
-- thêm 1 tầng phân cấp MỚI (Lớp → Chương → Bài → Dạng bài), migration này TÁI
-- SỬ DỤNG THẲNG bảng question_types cho khái niệm "Bài" (đổi tên bảng + cột),
-- tận dụng lại nguyên cơ chế "AI gợi ý, giáo viên xác nhận" đã có sẵn cho
-- Chương. Xem đầy đủ bối cảnh & các phương án đã cân nhắc trong tài liệu dự
-- án "Website thi Online" (Claude Project), mục nói về Lớp-Chương-Bài.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Đổi tên question_types -> lessons, và các cột liên quan trên questions.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'question_types')
     and not exists (select 1 from information_schema.tables where table_name = 'lessons') then
    alter table question_types rename to lessons;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'questions' and column_name = 'question_type_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'questions' and column_name = 'lesson_id'
  ) then
    alter table questions rename column question_type_id to lesson_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'questions' and column_name = 'ai_suggested_type_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'questions' and column_name = 'ai_suggested_lesson_id'
  ) then
    alter table questions rename column ai_suggested_type_id to ai_suggested_lesson_id;
  end if;
end $$;

-- Đổi tên luôn 2 khoá ngoại cho khớp cột mới (PostgREST không tự đổi tên
-- constraint khi đổi tên cột) -- toàn bộ code dùng embed kiểu
-- `lessons!questions_lesson_id_fkey(...)` để tránh lỗi PGRST201 (câu hỏi có 2
-- khoá ngoại trỏ cùng 1 bảng lessons: lesson_id và ai_suggested_lesson_id).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'questions_question_type_id_fkey')
     and not exists (select 1 from pg_constraint where conname = 'questions_lesson_id_fkey') then
    alter table questions rename constraint questions_question_type_id_fkey to questions_lesson_id_fkey;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'questions_ai_suggested_type_id_fkey')
     and not exists (select 1 from pg_constraint where conname = 'questions_ai_suggested_lesson_id_fkey') then
    alter table questions rename constraint questions_ai_suggested_type_id_fkey to questions_ai_suggested_lesson_id_fkey;
  end if;
end $$;

comment on table lessons is
  'Trước đây là "question_types" (dạng bài, chưa từng dùng thật) -- đổi tên +
   đổi ý nghĩa thành "Bài" (theo phân phối chương trình), migration_016.';
comment on column questions.lesson_id is
  'Bài (theo PPCT) mà câu hỏi này thuộc về -- giáo viên xác nhận (trước đây
   là question_type_id / "dạng bài"). Xem ai_suggested_lesson_id cho gợi ý AI
   chờ duyệt.';
comment on column questions.ai_suggested_lesson_id is
  'Gợi ý Bài của AI khi nhập đề (migration_016), chờ giáo viên xác nhận --
   giống cơ chế ai_suggested_topic_id đã có cho Chương.';

-- ----------------------------------------------------------------------------
-- 2) Thứ tự hiển thị Chương/Bài (order_index) -- trước đây không có cột nào
--    đảm bảo đúng thứ tự sách giáo khoa, chỉ dựa vào thứ tự chèn dữ liệu.
-- ----------------------------------------------------------------------------
alter table topics add column if not exists order_index smallint;
alter table lessons add column if not exists order_index smallint;

-- ----------------------------------------------------------------------------
-- 3) Gieo đầy đủ Chương cho Lớp 10 và Lớp 11 (Lớp 12 đã có 6 chương từ
--    migration_005 -- chỉ set order_index cho khối đó ở bước dưới, không
--    chèn lại/đổi tên).
-- ----------------------------------------------------------------------------
insert into topics (name, grade, order_index)
select v.name, 10, v.order_index
from (values
    ('Mệnh đề và tập hợp', 1),
    ('Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 2),
    ('Hệ thức lượng trong tam giác', 3),
    ('Vectơ', 4),
    ('Các số đặc trưng của mẫu số liệu không ghép nhóm', 5),
    ('Hàm số, đồ thị và ứng dụng', 6),
    ('Phương pháp toạ độ trong mặt phẳng', 7),
    ('Đại số tổ hợp', 8),
    ('Tính xác suất theo định nghĩa cổ điển', 9)
) as v(name, order_index)
where not exists (select 1 from topics t where t.name = v.name and t.grade = 10);

insert into topics (name, grade, order_index)
select v.name, 11, v.order_index
from (values
    ('Hàm số lượng giác và phương trình lượng giác', 1),
    ('Dãy số. Cấp số cộng và cấp số nhân', 2),
    ('Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm', 3),
    ('Quan hệ song song trong không gian', 4),
    ('Giới hạn. Hàm số liên tục', 5),
    ('Hàm số mũ và hàm số lôgarit', 6),
    ('Quan hệ vuông góc trong không gian', 7),
    ('Các quy tắc tính xác suất', 8),
    ('Đạo hàm', 9)
) as v(name, order_index)
where not exists (select 1 from topics t where t.name = v.name and t.grade = 11);

-- Set order_index cho 6 chương Lớp 12 đã seed từ trước (migration_005) --
-- khớp đúng nguyên văn tên đã lưu, không đổi tên.
update topics set order_index = v.order_index
from (values
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 1),
    ('Véc tơ và hệ trục tọa độ trong không gian', 2),
    ('Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm', 3),
    ('Nguyên hàm và tích phân', 4),
    ('Phương pháp tọa độ trong không gian', 5),
    ('Xác suất có điều kiện', 6)
) as v(name, order_index)
where topics.grade = 12 and topics.name = v.name and topics.order_index is null;

-- ----------------------------------------------------------------------------
-- 4) Gieo Bài cho cả 3 khối, gắn vào đúng topic_id theo (tên chương, khối).
--    Bỏ qua "Ôn tập/Kiểm tra giữa kì-cuối kì" và "Hoạt động thực hành trải
--    nghiệm" -- đây là buổi ôn tập/hoạt động trải nghiệm, không phải 1 Bài có
--    nội dung để gắn nhãn câu hỏi vào. "Bài tập cuối chương" thì GIỮ LẠI vì
--    câu hỏi tổng hợp cuối chương là loại câu rất thường gặp trong đề thi.
-- ----------------------------------------------------------------------------
insert into lessons (topic_id, name, order_index)
select t.id, v.lesson_name, v.order_index
from (values
    ('Mệnh đề và tập hợp', 10, 'Bài 1. Mệnh đề', 1),
    ('Mệnh đề và tập hợp', 10, 'Bài 2. Tập hợp và các phép toán trên tập hợp', 2),
    ('Mệnh đề và tập hợp', 10, 'Bài tập cuối chương I', 3),
    ('Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 10, 'Bài 3. Bất phương trình bậc nhất hai ẩn', 1),
    ('Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 10, 'Bài 4. Hệ bất phương trình bậc nhất hai ẩn', 2),
    ('Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 10, 'Bài tập cuối chương II', 3),
    ('Hệ thức lượng trong tam giác', 10, 'Bài 5. Giá trị lượng giác của một góc từ 0° đến 180°', 1),
    ('Hệ thức lượng trong tam giác', 10, 'Bài 6. Hệ thức lượng trong tam giác', 2),
    ('Hệ thức lượng trong tam giác', 10, 'Bài tập cuối chương III', 3),
    ('Vectơ', 10, 'Bài 7. Các khái niệm mở đầu', 1),
    ('Vectơ', 10, 'Bài 8. Tổng và hiệu của hai vectơ', 2),
    ('Vectơ', 10, 'Bài 9. Tích của một vectơ với một số', 3),
    ('Vectơ', 10, 'Bài 10. Vectơ trong mặt phẳng toạ độ', 4),
    ('Vectơ', 10, 'Bài 11. Tích vô hướng của hai vectơ', 5),
    ('Vectơ', 10, 'Bài tập cuối chương IV', 6),
    ('Các số đặc trưng của mẫu số liệu không ghép nhóm', 10, 'Bài 12. Số gần đúng và sai số', 1),
    ('Các số đặc trưng của mẫu số liệu không ghép nhóm', 10, 'Bài 13. Các số đặc trưng đo xu thế trung tâm', 2),
    ('Các số đặc trưng của mẫu số liệu không ghép nhóm', 10, 'Bài 14. Các số đặc trưng đo độ phân tán', 3),
    ('Các số đặc trưng của mẫu số liệu không ghép nhóm', 10, 'Bài tập cuối chương V', 4),
    ('Hàm số, đồ thị và ứng dụng', 10, 'Bài 15. Hàm số', 1),
    ('Hàm số, đồ thị và ứng dụng', 10, 'Bài 16. Hàm số bậc hai', 2),
    ('Hàm số, đồ thị và ứng dụng', 10, 'Bài 17. Dấu của tam thức bậc hai', 3),
    ('Hàm số, đồ thị và ứng dụng', 10, 'Bài 18. Phương trình quy về phương trình bậc hai', 4),
    ('Hàm số, đồ thị và ứng dụng', 10, 'Bài tập cuối chương VI', 5),
    ('Phương pháp toạ độ trong mặt phẳng', 10, 'Bài 19. Phương trình đường thẳng', 1),
    ('Phương pháp toạ độ trong mặt phẳng', 10, 'Bài 20. Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách', 2),
    ('Phương pháp toạ độ trong mặt phẳng', 10, 'Bài 21. Đường tròn trong mặt phẳng toạ độ', 3),
    ('Phương pháp toạ độ trong mặt phẳng', 10, 'Bài 22. Ba đường conic', 4),
    ('Phương pháp toạ độ trong mặt phẳng', 10, 'Bài tập cuối chương VII', 5),
    ('Đại số tổ hợp', 10, 'Bài 23. Quy tắc đếm', 1),
    ('Đại số tổ hợp', 10, 'Bài 24. Hoán vị, chỉnh hợp và tổ hợp', 2),
    ('Đại số tổ hợp', 10, 'Bài 25. Nhị thức Newton', 3),
    ('Đại số tổ hợp', 10, 'Bài tập cuối chương VIII', 4),
    ('Tính xác suất theo định nghĩa cổ điển', 10, 'Bài 26. Biến cố và định nghĩa cổ điển của xác suất', 1),
    ('Tính xác suất theo định nghĩa cổ điển', 10, 'Bài 27. Thực hành tính xác suất theo định nghĩa cổ điển', 2),
    ('Tính xác suất theo định nghĩa cổ điển', 10, 'Bài tập cuối chương IX', 3)
) as v(topic_name, grade, lesson_name, order_index)
join topics t on t.name = v.topic_name and t.grade = v.grade
where not exists (
  select 1 from lessons l where l.topic_id = t.id and l.name = v.lesson_name
);

insert into lessons (topic_id, name, order_index)
select t.id, v.lesson_name, v.order_index
from (values
    ('Hàm số lượng giác và phương trình lượng giác', 11, 'Bài 1. Giá trị lượng giác của góc lượng giác', 1),
    ('Hàm số lượng giác và phương trình lượng giác', 11, 'Bài 2. Công thức lượng giác', 2),
    ('Hàm số lượng giác và phương trình lượng giác', 11, 'Bài 3. Hàm số lượng giác', 3),
    ('Hàm số lượng giác và phương trình lượng giác', 11, 'Bài 4. Phương trình lượng giác cơ bản', 4),
    ('Hàm số lượng giác và phương trình lượng giác', 11, 'Bài tập cuối chương I', 5),
    ('Dãy số. Cấp số cộng và cấp số nhân', 11, 'Bài 5. Dãy số', 1),
    ('Dãy số. Cấp số cộng và cấp số nhân', 11, 'Bài 6. Cấp số cộng', 2),
    ('Dãy số. Cấp số cộng và cấp số nhân', 11, 'Bài 7. Cấp số nhân', 3),
    ('Dãy số. Cấp số cộng và cấp số nhân', 11, 'Bài tập cuối chương II', 4),
    ('Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm', 11, 'Bài 8. Mẫu số liệu ghép nhóm', 1),
    ('Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm', 11, 'Bài 9. Các số đặc trưng đo xu thế trung tâm', 2),
    ('Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm', 11, 'Bài tập cuối chương III', 3),
    ('Quan hệ song song trong không gian', 11, 'Bài 10. Đường thẳng và mặt phẳng trong không gian', 1),
    ('Quan hệ song song trong không gian', 11, 'Bài 11. Hai đường thẳng song song', 2),
    ('Quan hệ song song trong không gian', 11, 'Bài 12. Đường thẳng song song với mặt phẳng', 3),
    ('Quan hệ song song trong không gian', 11, 'Bài 13. Hai mặt phẳng song song', 4),
    ('Quan hệ song song trong không gian', 11, 'Bài 14. Phép chiếu song song', 5),
    ('Quan hệ song song trong không gian', 11, 'Bài tập cuối chương IV', 6),
    ('Giới hạn. Hàm số liên tục', 11, 'Bài 15. Giới hạn của dãy số', 1),
    ('Giới hạn. Hàm số liên tục', 11, 'Bài 16. Giới hạn của hàm số', 2),
    ('Giới hạn. Hàm số liên tục', 11, 'Bài 17. Hàm số liên tục', 3),
    ('Giới hạn. Hàm số liên tục', 11, 'Bài tập cuối chương V', 4),
    ('Hàm số mũ và hàm số lôgarit', 11, 'Bài 18. Luỹ thừa với số mũ thực', 1),
    ('Hàm số mũ và hàm số lôgarit', 11, 'Bài 19. Lôgarit', 2),
    ('Hàm số mũ và hàm số lôgarit', 11, 'Bài 20. Hàm số mũ và hàm số lôgarit', 3),
    ('Hàm số mũ và hàm số lôgarit', 11, 'Bài 21. Phương trình, bất phương trình mũ và lôgarit', 4),
    ('Hàm số mũ và hàm số lôgarit', 11, 'Bài tập cuối chương VI', 5),
    ('Quan hệ vuông góc trong không gian', 11, 'Bài 22. Hai đường thẳng vuông góc', 1),
    ('Quan hệ vuông góc trong không gian', 11, 'Bài 23. Đường thẳng vuông góc với mặt phẳng', 2),
    ('Quan hệ vuông góc trong không gian', 11, 'Bài 24. Phép chiếu vuông góc', 3),
    ('Quan hệ vuông góc trong không gian', 11, 'Bài 25. Hai mặt phẳng vuông góc', 4),
    ('Quan hệ vuông góc trong không gian', 11, 'Bài 26. Khoảng cách', 5),
    ('Quan hệ vuông góc trong không gian', 11, 'Bài 27. Thể tích', 6),
    ('Quan hệ vuông góc trong không gian', 11, 'Bài tập cuối chương VII', 7),
    ('Các quy tắc tính xác suất', 11, 'Bài 28. Biến cố hợp, biến cố giao, biến cố độc lập', 1),
    ('Các quy tắc tính xác suất', 11, 'Bài 29. Công thức cộng', 2),
    ('Các quy tắc tính xác suất', 11, 'Bài 30. Công thức nhân cho hai biến cố độc lập', 3),
    ('Các quy tắc tính xác suất', 11, 'Bài tập cuối chương VIII', 4),
    ('Đạo hàm', 11, 'Bài 31. Định nghĩa và ý nghĩa của đạo hàm', 1),
    ('Đạo hàm', 11, 'Bài 32. Các quy tắc tính đạo hàm', 2),
    ('Đạo hàm', 11, 'Bài 33. Đạo hàm cấp hai', 3),
    ('Đạo hàm', 11, 'Bài tập cuối chương IX', 4)
) as v(topic_name, grade, lesson_name, order_index)
join topics t on t.name = v.topic_name and t.grade = v.grade
where not exists (
  select 1 from lessons l where l.topic_id = t.id and l.name = v.lesson_name
);

insert into lessons (topic_id, name, order_index)
select t.id, v.lesson_name, v.order_index
from (values
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 12, 'Bài 1. Tính đơn điệu và cực trị của hàm số', 1),
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 12, 'Bài 2. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số', 2),
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 12, 'Bài 3. Đường tiệm cận của đồ thị hàm số', 3),
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 12, 'Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số', 4),
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 12, 'Bài 5. Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn', 5),
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 12, 'Bài tập cuối chương I', 6),
    ('Véc tơ và hệ trục tọa độ trong không gian', 12, 'Bài 6. Vectơ trong không gian', 1),
    ('Véc tơ và hệ trục tọa độ trong không gian', 12, 'Bài 7. Hệ trục toạ độ trong không gian', 2),
    ('Véc tơ và hệ trục tọa độ trong không gian', 12, 'Bài 8. Biểu thức toạ độ của các phép toán vectơ', 3),
    ('Véc tơ và hệ trục tọa độ trong không gian', 12, 'Bài tập cuối chương II', 4),
    ('Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm', 12, 'Bài 9. Khoảng biến thiên và khoảng tứ phân vị', 1),
    ('Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm', 12, 'Bài 10. Phương sai và độ lệch chuẩn', 2),
    ('Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm', 12, 'Bài tập cuối chương III', 3),
    ('Nguyên hàm và tích phân', 12, 'Bài 11. Nguyên hàm', 1),
    ('Nguyên hàm và tích phân', 12, 'Bài 12. Tích phân', 2),
    ('Nguyên hàm và tích phân', 12, 'Bài 13. Ứng dụng hình học của tích phân', 3),
    ('Nguyên hàm và tích phân', 12, 'Bài tập cuối chương IV', 4),
    ('Phương pháp tọa độ trong không gian', 12, 'Bài 14. Phương trình mặt phẳng', 1),
    ('Phương pháp tọa độ trong không gian', 12, 'Bài 15. Phương trình đường thẳng trong không gian', 2),
    ('Phương pháp tọa độ trong không gian', 12, 'Bài 16. Công thức tính góc trong không gian', 3),
    ('Phương pháp tọa độ trong không gian', 12, 'Bài 17. Phương trình mặt cầu', 4),
    ('Phương pháp tọa độ trong không gian', 12, 'Bài tập cuối chương V', 5),
    ('Xác suất có điều kiện', 12, 'Bài 18. Xác suất có điều kiện', 1),
    ('Xác suất có điều kiện', 12, 'Bài 19. Công thức xác suất toàn phần và công thức Bayes', 2),
    ('Xác suất có điều kiện', 12, 'Bài tập cuối chương VI', 3)
) as v(topic_name, grade, lesson_name, order_index)
join topics t on t.name = v.topic_name and t.grade = v.grade
where not exists (
  select 1 from lessons l where l.topic_id = t.id and l.name = v.lesson_name
);

-- ----------------------------------------------------------------------------
-- 5) Tiến độ bài dạy -- giáo viên tick từng Bài đã dạy xong cho 1 lớp (không
--    bắt buộc theo đúng thứ tự PPCT, xem đề xuất "quản lý lớp học" đã duyệt).
-- ----------------------------------------------------------------------------
create table if not exists lesson_progress (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  marked_by uuid references profiles(id),
  unique (class_id, lesson_id)
);
create index if not exists lesson_progress_class_id_idx on lesson_progress (class_id);

alter table lesson_progress enable row level security;

drop policy if exists "lesson_progress_select" on lesson_progress;
create policy "lesson_progress_select" on lesson_progress for select using (
  is_teacher() or class_id in (select class_id from profiles where id = auth.uid())
);
drop policy if exists "lesson_progress_write_teacher" on lesson_progress;
create policy "lesson_progress_write_teacher" on lesson_progress for all using (is_teacher()) with check (is_teacher());

-- ----------------------------------------------------------------------------
-- 6) Đổi tên policy cũ cho khớp tên bảng mới (cosmetic, không đổi hành vi).
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'lessons' and policyname = 'qtypes_read_all') then
    alter policy "qtypes_read_all" on lessons rename to "lessons_read_all";
  end if;
  if exists (select 1 from pg_policies where tablename = 'lessons' and policyname = 'qtypes_write_teacher') then
    alter policy "qtypes_write_teacher" on lessons rename to "lessons_write_teacher";
  end if;
end $$;
