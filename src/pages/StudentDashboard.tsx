import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow } from "../lib/types";

export function StudentDashboard() {
  const { profile } = useAuth();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<
    (ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    Promise.all([api.listExams(), api.listStudentAttempts(profile.id)]).then(
      ([e, a]) => {
        setExams(e);
        setAttempts(a);
        setLoading(false);
      },
    );
  }, [profile]);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="dashboard">
      <h2>Xin chào, {profile?.full_name}</h2>

      <section>
        <h3>Đề thi có thể làm</h3>
        {exams.length === 0 && <p className="empty-hint">Chưa có đề thi nào.</p>}
        <div className="card-list">
          {exams.map((exam) => (
            <div key={exam.id} className="card">
              <div className="card-title">{exam.title}</div>
              {exam.description && <p className="card-desc">{exam.description}</p>}
              <Link className="btn-primary" to={`/lam-bai/${exam.id}`}>
                Bắt đầu làm bài
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Lịch sử làm bài</h3>
        {attempts.length === 0 && (
          <p className="empty-hint">Bạn chưa làm bài kiểm tra nào.</p>
        )}
        <table className="history-table">
          <thead>
            <tr>
              <th>Đề thi</th>
              <th>Lần</th>
              <th>Ngày làm</th>
              <th>Điểm</th>
            </tr>
          </thead>
          <tbody>
            {attempts
              .filter((a) => a.submitted_at)
              .map((a) => (
                <tr key={a.id}>
                  <td>{a.exam?.title}</td>
                  <td>{a.attempt_number}</td>
                  <td>{new Date(a.started_at).toLocaleDateString("vi-VN")}</td>
                  <td>
                    <Link to={`/ket-qua/${a.id}`}>
                      {a.score ? a.score.total_score.toFixed(2) : "—"}
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
