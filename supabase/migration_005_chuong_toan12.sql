-- ============================================================================
-- Cập nhật thêm: gieo sẵn 6 chương của Toán 12 vào khung kiến thức (bảng
-- topics), theo đúng chương trình bạn cung cấp. Chỉ cần chạy 1 LẦN file này
-- trong Supabase Dashboard > SQL Editor > New query. An toàn chạy lại nhiều
-- lần (không tạo trùng nếu đã có).
--
-- Dạng bài chi tiết + mức độ khó trong từng chương sẽ làm sau (theo yêu cầu),
-- bước này chỉ tạo khung 6 chương lớn để gán câu hỏi vào trước.
-- ============================================================================

insert into topics (name, chapter, grade)
select v.name, v.chapter, 12
from (
  values
    ('Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 'Chương 1'),
    ('Véc tơ và hệ trục tọa độ trong không gian', 'Chương 2'),
    ('Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm', 'Chương 3'),
    ('Nguyên hàm và tích phân', 'Chương 4'),
    ('Phương pháp tọa độ trong không gian', 'Chương 5'),
    ('Xác suất có điều kiện', 'Chương 6')
) as v(name, chapter)
where not exists (
  select 1 from topics t where t.name = v.name and t.grade = 12
);
