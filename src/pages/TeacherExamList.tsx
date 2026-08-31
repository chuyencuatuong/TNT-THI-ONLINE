import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import { groupExamsByFolder } from "../lib/examLibrary";
import type { ExamRow, ExamTag } from "../lib/types";

function ExamCard({ exam, onDeleted }: { exam: ExamRow; onDeleted: (examId: string) => void }) {
  // Xóa đề — VĨNH VIỄN, kéo theo mọi lượt làm + kết quả của mọi HS cho đề
  // này (dựa vào cascade đã có sẵn ở CSDL, xem api.deleteExam). Cảnh báo rõ
  // trong hộp thoại confirm() vì không có cách khôi phục lại sau khi xoá.
  async function handleDelete() {
    if (
      !confirm(
        `Xoá vĩnh viễn đề "${exam.title}"?\n\nThao tác này sẽ xoá LUÔN toàn bộ lượt làm bài và kết quả của mọi học sinh cho đề này. Không thể khôi phục lại được.`,
      )
    ) {
      return;
    }
    await api.deleteExam(exam.id);
    onDeleted(exam.id);
  }

  return (
    <div className="card">
      <div className="card-title">
        {exam.title}
        {exam.mode === "nghiem_tuc" && <span className="tag tag--clay">Nghiêm túc</span>}
        {(exam.assigned_unlock_at || exam.assigned_lock_at) && (
          <span className="tag tag--accent">Được chỉ định</span>
        )}
      </div>
      {exam.description && <p className="card-desc">{exam.description}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="btn-secondary" to={`/giao-vien/de-thi/${exam.id}`}>
          Chỉnh sửa
        </Link>
        <Link className="btn-secondary" to={`/giao-vien/de-thi/${exam.id}/thong-ke`}>
          Xem thống kê
        </Link>
        {exam.drive_link && (
          <a className="btn-secondary" href={exam.drive_link} target="_blank" rel="noreferrer">
            Tải đề
          </a>
        )}
        <button type="button" className="btn-link btn-danger" onClick={handleDelete}>
          Xoá đề
        </button>
      </div>
    </div>
  );
}

export function TeacherExamList() {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [folders, setFolders] = useState<ExamTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([api.listExams(), api.listExamTags("folder")]).then(([e, f]) => {
      setExams(e);
      setFolders(f);
      setLoading(false);
    });
  }, []);

  function handleExamDeleted(examId: string) {
    setExams((prev) => prev.filter((e) => e.id !== examId));
  }

  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const filtered = exams.filter((exam) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      exam.title.toLowerCase().includes(q) ||
      (exam.description ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = useMemo(
    () => groupExamsByFolder(filtered, folderNameById),
    [filtered, folderNameById],
  );

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <h2>Đề thi</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn-primary" to="/giao-vien/tao-de-tu-word">
            + Tạo đề thi mới
          </Link>
          {/* Tạm ẩn 31/08/2026: nút "Tạo đề thủ công" dẫn tới màn hình chọn
              câu từ Ngân hàng câu hỏi (đang tạm ẩn, xem Layout.tsx/App.tsx) —
              ẩn nút này cùng lúc vì không còn nơi nào thêm câu MỚI vào ngân
              hàng để chọn nữa. Route /giao-vien/de-thi/moi vẫn còn hoạt động
              bình thường nếu truy cập thẳng URL, chỉ ẩn lối vào từ đây.
          <Link className="btn-secondary" to="/giao-vien/de-thi/moi">
            + Tạo đề thủ công (từng câu)
          </Link>
          */}
        </div>
      </div>

      <div className="filter-row">
        <input
          type="text"
          placeholder="Tìm theo tên hoặc mô tả đề..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 240 }}
        />
      </div>

      {loading ? (
        <div className="page-loading">Đang tải...</div>
      ) : exams.length === 0 ? (
        <p className="empty-hint">Chưa có đề thi nào.</p>
      ) : filtered.length === 0 ? (
        <p className="empty-hint">Không có đề nào khớp với tìm kiếm hiện tại.</p>
      ) : (
        grouped.map((group) => (
          <details key={group.folderId ?? "__none__"} open className="folder-group">
            <summary className="folder-group-title">
              {group.folderName} ({group.exams.length})
            </summary>
            <div className="card-list">
              {group.exams.map((exam) => (
                <ExamCard key={exam.id} exam={exam} onDeleted={handleExamDeleted} />
              ))}
            </div>
          </details>
        ))
      )}
    </div>
  );
}
