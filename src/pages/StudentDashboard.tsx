import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { completionMinutes, formatMinutes, formatScoreDelta } from "../lib/format";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow } from "../lib/types";

const UNCATEGORIZED = "Chưa phân loại";

export function StudentDashboard() {
  const { profile } = useAuth();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<
    (ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [examSearch, setExamSearch] = useState("");

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

  // Chỉ tính trên các lượt đã nộp bài và đã có điểm, xếp theo thời gian tăng
  // dần để tính "cải thiện" (so lần gần nhất với lần ngay trước đó) và vẽ biểu
  // đồ xu hướng theo đúng trình tự thời gian.
  const submittedAsc = useMemo(
    () =>
      attempts
        .filter((a) => a.submitted_at && a.score)
        .slice()
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()),
    [attempts],
  );

  const totalAttempts = submittedAsc.length;
  const averageScore =
    totalAttempts > 0
      ? submittedAsc.reduce((sum, a) => sum + a.score!.total_score, 0) / totalAttempts
      : null;
  const latest = totalAttempts > 0 ? submittedAsc[totalAttempts - 1] : null;
  const previous = totalAttempts > 1 ? submittedAsc[totalAttempts - 2] : null;
  const improvement =
    latest && previous ? latest.score!.total_score - previous.score!.total_score : null;
  const totalStudyMinutes = submittedAsc.reduce(
    (sum, a) => sum + (completionMinutes(a) ?? 0),
    0,
  );
  const trendData = submittedAsc.map((a, i) => ({
    name: `Lần ${i + 1}`,
    score: a.score!.total_score,
  }));

  const filteredExams = exams.filter((exam) => {
    if (!examSearch.trim()) return true;
    const q = examSearch.trim().toLowerCase();
    return (
      exam.title.toLowerCase().includes(q) ||
      (exam.description ?? "").toLowerCase().includes(q)
    );
  });
  const groupedExams = useMemo(() => {
    const map = new Map<string, ExamRow[]>();
    for (const exam of filteredExams) {
      const key = exam.folder?.trim() || UNCATEGORIZED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(exam);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "vi");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredExams]);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="dashboard">
      <h2>Chào em, {profile?.full_name}!</h2>

      <section>
        <h3>Tổng quan tiến độ</h3>
        {totalAttempts === 0 ? (
          <p className="empty-hint">
            Chưa có dữ liệu — hãy làm bài kiểm tra đầu tiên để xem tiến độ ở đây.
          </p>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-card-label">Số bài đã làm</div>
                <div className="stat-card-value">{totalAttempts}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Điểm trung bình</div>
                <div className="stat-card-value">{averageScore!.toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Điểm gần nhất</div>
                <div className="stat-card-value">{latest!.score!.total_score.toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Cải thiện so với lần trước</div>
                {improvement === null ? (
                  <div className="stat-card-value stat-card-value--muted">—</div>
                ) : (
                  <div className={`stat-card-value ${formatScoreDelta(improvement).className}`}>
                    {formatScoreDelta(improvement).text}
                  </div>
                )}
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Tổng thời gian làm bài</div>
                <div className="stat-card-value stat-card-value--small">
                  {formatMinutes(totalStudyMinutes)}
                </div>
              </div>
            </div>

            {trendData.length >= 2 && (
              <div className="dashboard-trend">
                <div className="dashboard-trend-title">Xu hướng điểm số</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis domain={[0, 10]} fontSize={12} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#9c1420" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h3>Đề thi có thể làm</h3>
        {exams.length === 0 ? (
          <p className="empty-hint">Chưa có đề thi nào.</p>
        ) : (
          <>
            <div className="filter-row">
              <input
                type="text"
                placeholder="Tìm theo tên hoặc mô tả đề..."
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
                style={{ minWidth: 240 }}
              />
            </div>
            {filteredExams.length === 0 ? (
              <p className="empty-hint">Không có đề nào khớp với tìm kiếm hiện tại.</p>
            ) : (
              groupedExams.map(([folderName, folderExams]) => (
                <details key={folderName} open className="folder-group">
                  <summary className="folder-group-title">
                    {folderName} ({folderExams.length})
                  </summary>
                  <div className="card-list">
                    {folderExams.map((exam) => (
                      <div key={exam.id} className="card">
                        <div className="card-title">{exam.title}</div>
                        {exam.description && <p className="card-desc">{exam.description}</p>}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Link className="btn-primary" to={`/lam-bai/${exam.id}`}>
                            Bắt đầu làm bài
                          </Link>
                          {exam.drive_link && (
                            <a
                              className="btn-secondary"
                              href={exam.drive_link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Tải đề
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))
            )}
          </>
        )}
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
