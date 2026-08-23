import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import type { ExamRow } from "../lib/types";

const UNCATEGORIZED = "Chưa phân loại";

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.listExams().then((data) => {
      setExams(data);
      setLoading(false);
    });
  }, []);

  const filtered = exams.filter((exam) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      exam.title.toLowerCase().includes(q) ||
      (exam.description ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ExamRow[]>();
    for (const exam of filtered) {
      const key = exam.folder?.trim() || UNCATEGORIZED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(exam);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "vi");
    });
  }, [filtered]);

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
        grouped.map(([folderName, folderExams]) => (
          <details key={folderName} open className="folder-group">
            <summary className="folder-group-title">
              {folderName} ({folderExams.length})
            </summary>
            <div className="card-list">
              {folderExams.map((exam) => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          </details>
        ))
      )}
    </div>
  );
}
