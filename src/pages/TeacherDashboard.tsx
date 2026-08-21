import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import type { Profile } from "../lib/types";

interface StudentSummary {
  profile: Profile;
  attemptCount: number;
  averageScore: number | null;
  lastScore: number | null;
}

export function TeacherDashboard() {
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const students = await api.listStudents();
      const results: StudentSummary[] = [];
      for (const s of students) {
        const attempts = (await api.listStudentAttempts(s.id)).filter(
          (a) => a.score,
        );
        const scores = attempts.map((a) => a.score!.total_score);
        const avg =
          scores.length > 0
            ? scores.reduce((sum, v) => sum + v, 0) / scores.length
            : null;
        results.push({
          profile: s,
          attemptCount: attempts.length,
          averageScore: avg,
          lastScore: scores[0] ?? null,
        });
      }
      setSummaries(results);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="teacher-page">
      <h2>Tổng quan học sinh</h2>
      {summaries.length === 0 ? (
        <p className="empty-hint">
          Chưa có học sinh nào đăng ký. Gửi link website cho học sinh để họ đăng
          nhập bằng email.
        </p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Học sinh</th>
              <th>Số lần kiểm tra</th>
              <th>Điểm trung bình</th>
              <th>Điểm gần nhất</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.profile.id}>
                <td>{s.profile.full_name}</td>
                <td>{s.attemptCount}</td>
                <td>{s.averageScore?.toFixed(2) ?? "—"}</td>
                <td>{s.lastScore?.toFixed(2) ?? "—"}</td>
                <td>
                  <Link to={`/giao-vien/hoc-sinh/${s.profile.id}`}>Xem chi tiết</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
