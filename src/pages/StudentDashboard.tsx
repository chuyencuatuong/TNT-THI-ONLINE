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

export function StudentDashboard() {
  const { profile } = useAuth();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<
    (ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]
  >([]);
  const [wrongCount, setWrongCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    Promise.all([
      api.listExams(),
      api.listStudentAttempts(profile.id),
      api.getWrongAnswerJournalCount(profile.id),
    ]).then(([e, a, wc]) => {
      setExams(e);
      setAttempts(a);
      setWrongCount(wc);
      setLoading(false);
    });
  }, [profile]);

  const latestExam = exams.length > 0 ? exams[0] : null; // listExams() đã sắp created_at desc

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
        <div className="page-header-row">
          <h3>Đề thi mới nhất</h3>
          <Link className="btn-secondary" to="/hoc-sinh/kho-de">
            Xem tất cả trong Kho đề →
          </Link>
        </div>
        {!latestExam ? (
          <p className="empty-hint">Chưa có đề thi nào.</p>
        ) : (
          <div className="card-list">
            <div className="card">
              <div className="card-title">{latestExam.title}</div>
              {latestExam.description && <p className="card-desc">{latestExam.description}</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="btn-primary" to={`/lam-bai/${latestExam.id}`}>
                  Bắt đầu làm bài
                </Link>
                {latestExam.drive_link && (
                  <a
                    className="btn-secondary"
                    href={latestExam.drive_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Tải đề
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3>Ôn tập câu sai</h3>
        {wrongCount === 0 ? (
          <p className="empty-hint">
            Chưa có câu nào trong nhật ký ôn tập — nhật ký sẽ tự có câu sau khi bạn làm sai 1 câu
            nào đó trong lúc làm đề.
          </p>
        ) : (
          <div className="card-list">
            <div className="card">
              <div className="card-title">{wrongCount} câu đang cần ôn</div>
              <p className="card-desc">
                Làm đúng đủ 3 buổi ôn tập riêng biệt liên tiếp thì câu đó mới được rút khỏi nhật ký.
              </p>
              <Link className="btn-primary" to="/hoc-sinh/on-tap-cau-sai">
                Bắt đầu ôn tập
              </Link>
            </div>
          </div>
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
