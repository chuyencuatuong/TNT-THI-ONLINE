-- Xuất toàn bộ câu Phần 1 của Chương 1 Lớp 12 để Claude gắn nhãn lỗi hộ.
-- CHỈ ĐỌC, không sửa gì trong database.
-- Cách dùng: Supabase Dashboard > SQL Editor > New query > dán file này > Run
-- > bấm "Export" / "Download CSV" ở khung kết quả > lưu file CSV vào thư mục
-- dự án (TNT-THI-ONLINE-main).
select
  q.id,
  l.order_index as bai_so,
  l.name as bai,
  q.difficulty,
  q.content_latex,
  q.options,
  q.correct_answer,
  q.solution_latex,
  q.image_url
from questions q
join topics t on t.id = q.topic_id
left join lessons l on l.id = q.lesson_id
where q.part = 1
  and t.grade = 12
  and t.order_index = 1
order by l.order_index nulls last, q.created_at;
