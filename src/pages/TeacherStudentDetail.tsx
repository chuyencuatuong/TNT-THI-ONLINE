import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import * as api from "../lib/api";
import { generateReportSummary } from "../lib/ai";
import { completionMinutes, formatMinutes, formatScoreDelta, formatTimeDelta } from "../lib/format";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow, Profile } from "../lib/types";

type ScoredAttempt = ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null };

interface ExamGroup {
  examId: string;
  examTitle: string;
  /** Sắp theo attempt_number tăng dần (lần 1, 2, 3...) để tính chênh lệch. */
  items: ScoredAttempt[];
}

/** Nhóm các lượt làm bài theo đề thi — mỗi nhóm sắp theo thứ tự lần làm (1, 2, 3...). */
function groupByExam(attempts: ScoredAttempt[]): ExamGroup[] {
  const map = new Map<string, ExamGroup>();
  for (const a of attempts) {
    const g = map.get(a.exam_id) ?? { examId: a.exam_id, examTitle: a.exam.title, items: [] };
    g.items.push(a);
    map.set(a.exam_id, g);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.items.sort((x, y) => x.attempt_number - y.attempt_number);
  }
  // Đề có lượt làm gần đây nhất lên đầu, cho dễ theo dõi hoạt động mới nhất.
  groups.sort((a, b) => {
    const aLatest = a.items[a.items.length - 1].started_at;
    const bLatest = b.items[b.items.length - 1].started_at;
    return new Date(bLatest).getTime() - new Date(aLatest).getTime();
  });
  return groups;
}

export function TeacherStudentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempts, setAttempts] = useState<
    (ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]
  >([]);
  const [topicStats, setTopicStats] = useState<
    { type_name: string; accuracyPercent: number }[]
  >([]);
  const [proctoringCounts, setProctoringCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reportLink, setReportLink] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const [attemptsData, stats] = await Promise.all([
        api.listStudentAttempts(studentId),
        api.getStudentTopicStats(studentId),
      ]);
      const scoredAttempts = attemptsData.filter((a) => a.score);
      setAttempts(scoredAttempts);
      setTopicStats(
        stats.map((s) => ({
          type_name: s.type_name,
          accuracyPercent: s.maxScore > 0 ? (s.correctScore / s.maxScore) * 100 : 0,
        })),
      );
      const studentProfile = await api.getProfile(studentId);
      setProfile(studentProfile);
      api
        .getProctoringCounts(scoredAttempts.map((a) => a.id))
        .then(setProctoringCounts)
        .catch((err) => console.error("Không lấy được dữ liệu giám sát:", err));
      setLoading(false);
    })();
  }, [studentId]);

  async function handleGenerateReport() {
    if (!studentId || !profile) return;
    setGenerating(true);
    try {
      const scoreTrend = attempts
        .slice()
        .reverse()
        .map((a) => ({
          examTitle: a.exam.title,
          date: new Date(a.started_at).toLocaleDateString("vi-VN"),
          score: a.score!.total_score,
        }));
      const averageScore =
        attempts.length > 0
          ? attempts.reduce((sum, a) => sum + a.score!.total_score, 0) / attempts.length
          : null;

      const summary = await generateReportSummary({
        studentName: profile.full_name,
        periodLabel: "gần đây",
        totalAttempts: attempts.length,
        averageScore,
        scoreTrend,
        topicStats,
      });

      const report = await api.createReport({
        student_id: studentId,
        period_start: attempts.length
          ? attempts[attempts.length - 1].started_at.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        period_end: new Date().toISOString().slice(0, 10),
        summary_text: summary,
        chart_data: { topicStats },
      });

      setReportLink(`${window.location.origin}${import.meta.env.BASE_URL}bao-cao/${report.share_token}`);
    } finally {
      setGenerating(false);
    }
  }

  function suspicionLabel(count: number): { text: string; className: string } {
    if (count === 0) return { text: "Bình thường", className: "badge-ok" };
    if (count <= 3) return { text: `Nghi ngờ nhẹ (${count})`, className: "badge-warn" };
    return { text: `Nghi ngờ cao (${count})`, className: "badge-danger" };
  }

  const examGroups = useMemo(() => groupByExam(attempts), [attempts]);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  const trendData = attempts
    .slice()
    .reverse()
    .map((a, i) => ({ name: `Lần ${i + 1}`, score: a.score!.total_score }));

  return (
    <div className="teacher-page">
      <h2>{profile?.full_name}</h2>

      <section>
        <h3>Xu hướng điểm số</h3>
        {trendData.length === 0 ? (
          <p className="empty-hint">Chưa có lượt làm bài nào.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#9c1420" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section>
        <h3>Kết quả theo từng đề thi</h3>
        <p className="empty-hint">
          Mỗi đề liệt kê đủ các lần làm, kèm chênh lệch điểm và thời gian hoàn thành so với lần
          đầu và lần ngay trước đó (lần n-1) — để thấy rõ học sinh có tiến bộ qua các lần làm lại
          hay không. Cột "Giám sát" dựa trên số lần rời tab, thoát toàn màn hình, hoặc cố sao
          chép/dán trong lúc làm bài — chỉ để gợi ý hỏi lại học sinh, không phải bằng chứng gian
          lận chắc chắn.
        </p>
        {examGroups.length === 0 ? (
          <p className="empty-hint">Chưa có lượt làm bài nào.</p>
        ) : (
          <div className="exam-group-list">
            {examGroups.map((g) => (
              <div key={g.examId} className="exam-group-card">
                <div className="exam-group-header">
                  <span className="exam-group-title">{g.examTitle}</span>
                  <span className="tag tag--muted">Đã làm {g.items.length} lần</span>
                </div>
                <div className="table-scroll">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Lần</th>
                        <th>Ngày làm</th>
                        <th>Điểm</th>
                        <th>So với lần đầu</th>
                        <th>So với lần trước</th>
                        <th>Thời gian làm bài</th>
                        <th>TG so với lần đầu</th>
                        <th>TG so với lần trước</th>
                        <th>Giám sát</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((a, idx) => {
                        const first = g.items[0];
                        const prev = idx > 0 ? g.items[idx - 1] : null;
                        const score = a.score!.total_score;
                        const scoreVsFirst = idx === 0 ? null : score - first.score!.total_score;
                        const scoreVsPrev =
                          idx === 0 || !prev ? null : score - prev.score!.total_score;
                        const mins = completionMinutes(a);
                        const firstMins = completionMinutes(first);
                        const prevMins = prev ? completionMinutes(prev) : null;
                        const timeVsFirst =
                          idx === 0 || mins === null || firstMins === null
                            ? null
                            : mins - firstMins;
                        const timeVsPrev =
                          idx === 0 || mins === null || prevMins === null
                            ? null
                            : mins - prevMins;
                        const suspicion = suspicionLabel(proctoringCounts[a.id] ?? 0);
                        return (
                          <tr key={a.id}>
                            <td>Lần {a.attempt_number}</td>
                            <td>{new Date(a.started_at).toLocaleDateString("vi-VN")}</td>
                            <td>
                              <strong>{score.toFixed(2)}</strong>
                            </td>
                            <td>
                              {scoreVsFirst === null ? (
                                "—"
                              ) : (
                                <span className={formatScoreDelta(scoreVsFirst).className}>
                                  {formatScoreDelta(scoreVsFirst).text}
                                </span>
                              )}
                            </td>
                            <td>
                              {scoreVsPrev === null ? (
                                "—"
                              ) : (
                                <span className={formatScoreDelta(scoreVsPrev).className}>
                                  {formatScoreDelta(scoreVsPrev).text}
                                </span>
                              )}
                            </td>
                            <td>{mins === null ? "—" : formatMinutes(mins)}</td>
                            <td>{timeVsFirst === null ? "—" : formatTimeDelta(timeVsFirst)}</td>
                            <td>{timeVsPrev === null ? "—" : formatTimeDelta(timeVsPrev)}</td>
                            <td>
                              <span className={`badge ${suspicion.className}`}>
                                {suspicion.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>Tỉ lệ đúng theo dạng bài</h3>
        {topicStats.length === 0 ? (
          <p className="empty-hint">Chưa có dữ liệu.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, topicStats.length * 40)}>
            <BarChart data={topicStats} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="type_name" width={160} />
              <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
              <Bar dataKey="accuracyPercent" fill="#9c1420" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section>
        <h3>Báo cáo gửi phụ huynh</h3>
        <button className="btn-primary" onClick={handleGenerateReport} disabled={generating}>
          {generating ? "Đang tạo báo cáo..." : "Tạo báo cáo mới"}
        </button>
        {reportLink && (
          <p className="report-link-box">
            Link báo cáo (gửi cho phụ huynh, không cần đăng nhập):
            <br />
            <a href={reportLink} target="_blank" rel="noreferrer">
              {reportLink}
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
