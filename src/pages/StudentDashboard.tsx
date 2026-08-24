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
import { accuracyPercent, type ChapterStat } from "../lib/chapterStats";
import { completionMinutes, formatMinutes, formatScoreDelta } from "../lib/format";
import {
  formatCountdownLabel,
  getAssignmentStatus,
  pickFeaturedAssignedExam,
} from "../lib/examAssignment";
import { PomodoroGarden } from "../components/PomodoroGarden";
import { ExamCountdown } from "../components/ExamCountdown";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow } from "../lib/types";

export function StudentDashboard() {
  const { profile } = useAuth();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<
    (ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]
  >([]);
  const [wrongCount, setWrongCount] = useState(0);
  const [chapterStats, setChapterStats] = useState<ChapterStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Chỉ cần cập nhật mỗi phút là đủ để đếm ngược mở khoá/khoá đề được chỉ
  // định tự nhảy đúng lúc, không cần theo giây.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!profile) return;
    Promise.all([
      api.listExams(),
      api.listStudentAttempts(profile.id),
      api.getWrongAnswerJournalCount(profile.id),
      api.getStudentChapterStats(profile.id),
    ]).then(([e, a, wc, cs]) => {
      setExams(e);
      setAttempts(a);
      setWrongCount(wc);
      setChapterStats(cs);
      setLoading(false);
    });
  }, [profile]);

  const latestExam = exams.length > 0 ? exams[0] : null; // listExams() đã sắp created_at desc

  const featuredExam = useMemo(() => pickFeaturedAssignedExam(exams, nowMs), [exams, nowMs]);
  const featuredStatus = featuredExam ? getAssignmentStatus(featuredExam, nowMs) : null;

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

  // Chương ưu tiên ôn tập — chương có độ chính xác THẤP NHẤT trong số các
  // chương đã có ít nhất 1 câu (maxScore > 0), tránh gợi ý chương chưa từng
  // làm (không phải "yếu", chỉ là chưa có dữ liệu).
  const priorityChapter = useMemo(() => {
    const withData = chapterStats.filter((c) => c.maxScore > 0);
    if (withData.length === 0) return null;
    return withData.reduce((worst, c) =>
      (accuracyPercent(c) ?? 100) < (accuracyPercent(worst) ?? 100) ? c : worst,
    );
  }, [chapterStats]);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="dashboard">
      <h2>Chào em, {profile?.full_name}!</h2>

      {featuredExam && featuredStatus && (
        <div className="featured-assigned-card">
          <div className="featured-assigned-eyebrow">Đề thi được chỉ định</div>
          <div className="featured-assigned-title">{featuredExam.title}</div>
          {featuredStatus === "open" ? (
            <>
              <Link className="btn-primary featured-assigned-cta" to={`/lam-bai/${featuredExam.id}`}>
                Vào thi ngay
              </Link>
              {featuredExam.assigned_lock_at && (
                <div className="featured-assigned-note">
                  Đóng sau {formatCountdownLabel(
                    new Date(featuredExam.assigned_lock_at).getTime() - nowMs,
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="featured-assigned-note">
              Mở khoá sau {formatCountdownLabel(
                new Date(featuredExam.assigned_unlock_at!).getTime() - nowMs,
              )}
            </div>
          )}
        </div>
      )}

      {totalAttempts === 0 ? (
        <p className="empty-hint">
          Chưa có dữ liệu — hãy làm bài kiểm tra đầu tiên để xem tiến độ ở đây.
        </p>
      ) : (
        <>
          <div className="student-stat-strip">
            <div className="student-stat-cell">
              <div className="student-stat-cell-label">Số bài đã làm</div>
              <div className="student-stat-cell-value">{totalAttempts}</div>
            </div>
            <div className="student-stat-cell">
              <div className="student-stat-cell-label">Điểm trung bình</div>
              <div className="student-stat-cell-value">{averageScore!.toFixed(2)}</div>
            </div>
            <div className="student-stat-cell">
              <div className="student-stat-cell-label">Điểm gần nhất</div>
              <div className="student-stat-cell-delta-row">
                <div className="student-stat-cell-value">{latest!.score!.total_score.toFixed(2)}</div>
                {improvement !== null && (
                  <span
                    className={`student-stat-cell-delta student-stat-cell-delta--${
                      improvement >= 0 ? "up" : "down"
                    }`}
                  >
                    {formatScoreDelta(improvement).text}
                  </span>
                )}
              </div>
            </div>
            <div className="student-stat-cell">
              <div className="student-stat-cell-label">Tổng thời gian làm bài</div>
              <div className="student-stat-cell-value student-stat-cell-value--muted">
                {formatMinutes(totalStudyMinutes)}
              </div>
            </div>
          </div>

          {trendData.length >= 2 && (
            <div className="dashboard-trend hover-card">
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

      <div className="student-2col">
        <div className="student-2col-col">
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
                <div className="card hover-card">
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

        <div className="student-2col-col">
          <section>
            <h3>Ôn tập câu sai</h3>
            {wrongCount === 0 ? (
              <p className="empty-hint">
                Chưa có câu nào trong nhật ký ôn tập — nhật ký sẽ tự có câu sau khi bạn làm sai 1
                câu nào đó trong lúc làm đề.
              </p>
            ) : (
              <div className="card-list">
                <div className="card hover-card">
                  <div className="card-title">{wrongCount} câu đang cần ôn</div>
                  <p className="card-desc">
                    Làm đúng đủ 3 buổi ôn tập riêng biệt liên tiếp thì câu đó mới được rút khỏi
                    nhật ký.
                  </p>
                  <Link className="btn-primary" to="/hoc-sinh/on-tap-cau-sai">
                    Bắt đầu ôn tập
                  </Link>
                </div>
              </div>
            )}
          </section>

          {priorityChapter && (
            <section>
              <h3>Chương cần ôn ưu tiên</h3>
              <div className="card-list">
                <div className="card hover-card">
                  <div className="priority-chapter-title">{priorityChapter.topic_name}</div>
                  <div className="priority-chapter-meta">
                    Độ chính xác hiện tại: {accuracyPercent(priorityChapter)}% ·{" "}
                    {priorityChapter.total} câu đã làm
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="daily-tools-heading">Công cụ học mỗi ngày</div>
      <div className="daily-tools-row">
        {profile && <PomodoroGarden studentId={profile.id} />}
        <ExamCountdown />
        <div className="coming-soon-tile">
          <div className="coming-soon-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9c1420" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
          </div>
          <div>
            <div className="coming-soon-label">Kế hoạch ôn tập</div>
            <div className="priority-chapter-meta">
              Tự lập chiến lược ôn theo ngày thi — đang phát triển.
            </div>
          </div>
          <div className="coming-soon-chip">Sắp có</div>
        </div>
      </div>
    </div>
  );
}
