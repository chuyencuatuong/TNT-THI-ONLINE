import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import { groupExamsByFolder } from "../lib/examLibrary";
import type { ExamRow, ExamTag } from "../lib/types";

function ExamCard({ exam }: { exam: ExamRow }) {
  return (
    <div className="card">
      <div className="card-title">{exam.title}</div>
      {exam.description && <p className="card-desc">{exam.description}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="btn-secondary" to={`/giao-vien/de-thi/${exam.id}`}>
          Chỉnh sửa
        </Link>
        {exam.drive_link && (
          <a className="btn-secondary" href={exam.drive_link} target="_blank" rel="noreferrer">
            Tải đề
          </a>
        )}
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
          <Link className="btn-secondary" to="/giao-vien/de-thi/moi">
            + Tạo đề thủ công (từng câu)
          </Link>
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
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          </details>
        ))
      )}
    </div>
  );
}
