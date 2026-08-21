import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import type { ExamRow } from "../lib/types";

export function TeacherExamList() {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listExams().then((data) => {
      setExams(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <h2>Đề thi</h2>
        <Link className="btn-primary" to="/giao-vien/de-thi/moi">
          + Tạo đề mới
        </Link>
      </div>
      {loading ? (
        <div className="page-loading">Đang tải...</div>
      ) : exams.length === 0 ? (
        <p className="empty-hint">Chưa có đề thi nào.</p>
      ) : (
        <div className="card-list">
          {exams.map((exam) => (
            <div key={exam.id} className="card">
              <div className="card-title">{exam.title}</div>
              {exam.description && <p className="card-desc">{exam.description}</p>}
              <Link className="btn-secondary" to={`/giao-vien/de-thi/${exam.id}`}>
                Chỉnh sửa
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
