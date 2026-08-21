import { useEffect, useState } from "react";
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
import type { AttemptScoreRow, ExamAttemptRow, ExamRow, Profile } from "../lib/types";

export function TeacherStudentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempts, setAttempts] = useState<
    (ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]
  >([]);
  const [topicStats, setTopicStats] = useState<
    { type_name: string; accuracyPercent: number }[]
  >([]);
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
      setAttempts(attemptsData.filter((a) => a.score));
      setTopicStats(
        stats.map((s) => ({
          type_name: s.type_name,
          accuracyPercent: s.maxScore > 0 ? (s.correctScore / s.maxScore) * 100 : 0,
        })),
      );
      const { data } = await import("../lib/supabaseClient").then((m) =>
        m.supabase.from("profiles").select("*").eq("id", studentId).single(),
      );
      setProfile(data as Profile);
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
              <Line type="monotone" dataKey="score" stroke="#3b6fd6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
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
              <Bar dataKey="accuracyPercent" fill="#3b6fd6" radius={[0, 4, 4, 0]} />
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
