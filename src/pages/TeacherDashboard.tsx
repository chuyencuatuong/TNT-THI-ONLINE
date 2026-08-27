import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as api from "../lib/api";
import {
  accuracyPercent,
  buildComparisonRows,
  mergeChapterStats,
  truncateChapterLabel,
  type ChapterStat,
} from "../lib/chapterStats";
import type { Profile } from "../lib/types";

interface StudentSummary {
  profile: Profile;
  attemptCount: number;
  averageScore: number | null;
  lastScore: number | null;
}

/** Màu vòng tròn viết tắt tên học sinh, xoay vòng theo thứ tự danh sách (không
 * gắn với trạng thái đang chọn) — chỉ để dễ phân biệt các dòng, không mang ý
 * nghĩa xếp hạng hay đánh giá. */
const AVATAR_PALETTE = [
  { bg: "var(--color-subtle-bg)", text: "var(--color-text)" },
  { bg: "var(--color-accent-light)", text: "#7a5a19" },
  { bg: "var(--color-pine-light)", text: "var(--color-pine-text)" },
  { bg: "var(--color-clay-light)", text: "var(--color-clay-text)" },
];

/** "Nguyễn An" → "NA" — chữ đầu của từ đầu + chữ đầu của từ cuối trong tên. */
function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Dashboard tổng quan giáo viên — 3 cột (mục 19.4 tài liệu đề xuất, Đợt 3):
 * (1) danh sách học sinh (bấm để chọn), (2) biểu đồ năng lực theo CHƯƠNG của
 * học sinh đang chọn, (3) học sinh đang chọn so với TRUNG BÌNH CẢ LỚP theo
 * từng chương. Khi chưa chọn học sinh nào (mở trang lần đầu), cả 3 cột mặc
 * định hiện tổng quan cả lớp — cột (2) hiện biểu đồ cả lớp, cột (3) vẫn dùng
 * đúng 1 component so sánh nhưng chỉ có 1 cột dữ liệu (lớp) vì chưa có học
 * sinh nào để so.
 *
 * Thống kê theo CHƯƠNG (topic_id) thay vì "dạng bài" (question_type_id) —
 * xem lý do đầy đủ ở `src/lib/chapterStats.ts` (dạng bài chi tiết theo mục 14
 * chưa được giáo viên nhập/dùng thật, nhiều khả năng biểu đồ sẽ trống trơn).
 *
 * Để tránh gọi lại API mỗi lần đổi học sinh đang chọn, toàn bộ thống kê theo
 * chương của MỌI học sinh được tải 1 lần khi vào trang (song song từng học
 * sinh), lưu vào 1 map — chọn học sinh chỉ là tra map cục bộ, không gọi mạng
 * thêm lần nào.
 *
 * Dải thống kê đầu trang: 3 số liệu gốc (số học sinh, tổng lượt làm bài, điểm
 * TB lớp) + "buổi ôn tập tuần này" (bổ sung 24/08/2026, audit "check full" —
 * review_sessions vốn đã được ghi nhận nhưng chưa hề hiển thị ở đâu cho giáo
 * viên xem). CỐ TÌNH VẪN CHƯA thêm "học sinh cần chú ý" như bản phác thảo
 * thiết kế — ô đó cần 1 quy tắc nghiệp vụ (thế nào là "cần chú ý"?) chưa được
 * thầy Tường chốt, khác với số đếm buổi ôn tập không cần quy tắc gì cả.
 */
export function TeacherDashboard() {
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [chapterStatsByStudent, setChapterStatsByStudent] = useState<Map<string, ChapterStat[]>>(
    new Map(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt] = useState(() => new Date());
  const [reviewSessionsThisWeek, setReviewSessionsThisWeek] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const students = await api.listStudents();
      const sevenDaysAgo = new Date(loadedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [summaryResults, chapterResults] = await Promise.all([
        Promise.all(
          students.map(async (s) => {
            const attempts = (await api.listStudentAttempts(s.id)).filter((a) => a.score);
            const scores = attempts.map((a) => a.score!.total_score);
            const avg =
              scores.length > 0 ? scores.reduce((sum, v) => sum + v, 0) / scores.length : null;
            return {
              profile: s,
              attemptCount: attempts.length,
              averageScore: avg,
              lastScore: scores[0] ?? null,
            };
          }),
        ),
        Promise.all(students.map((s) => api.getStudentChapterStats(s.id))),
      ]);
      setSummaries(summaryResults);
      const map = new Map<string, ChapterStat[]>();
      students.forEach((s, i) => map.set(s.id, chapterResults[i]));
      setChapterStatsByStudent(map);
      api
        .getReviewSessionCountSince(sevenDaysAgo)
        .then(setReviewSessionsThisWeek)
        .catch((err) => console.error("Không lấy được số buổi ôn tập:", err));
      setLoading(false);
    })();
  }, [loadedAt]);

  const classStats = useMemo(
    () => mergeChapterStats(Array.from(chapterStatsByStudent.values())),
    [chapterStatsByStudent],
  );
  const selectedStats = selectedId ? chapterStatsByStudent.get(selectedId) ?? [] : null;
  const selectedSummary = summaries.find((s) => s.profile.id === selectedId) ?? null;

  const chapterChartData = useMemo(() => {
    const stats = selectedStats ?? classStats;
    return stats
      .filter((s) => s.maxScore > 0)
      .map((s) => ({ topic_name: s.topic_name, accuracy: accuracyPercent(s) ?? 0 }));
  }, [selectedStats, classStats]);

  const chapterAverage =
    chapterChartData.length > 0
      ? Math.round(
          chapterChartData.reduce((sum, c) => sum + c.accuracy, 0) / chapterChartData.length,
        )
      : null;

  const comparisonData = useMemo(
    () => buildComparisonRows(classStats, selectedStats),
    [classStats, selectedStats],
  );

  const totalAttempts = summaries.reduce((sum, s) => sum + s.attemptCount, 0);
  const classAverageScore = useMemo(() => {
    const scored = summaries.filter((s) => s.averageScore !== null);
    if (scored.length === 0) return null;
    return scored.reduce((sum, s) => sum + s.averageScore!, 0) / scored.length;
  }, [summaries]);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <div>
          <h2 style={{ marginBottom: 4 }}>Tổng quan lớp</h2>
          <div className="empty-hint" style={{ padding: 0 }}>
            Cập nhật lúc {loadedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })},{" "}
            {loadedAt.toLocaleDateString("vi-VN")}
          </div>
        </div>
      </div>

      <div className="student-stat-strip">
        <div className="student-stat-cell">
          <div className="student-stat-cell-label">Học sinh đang theo dõi</div>
          <div className="student-stat-cell-value">{summaries.length}</div>
        </div>
        <div className="student-stat-cell">
          <div className="student-stat-cell-label">Tổng lượt làm bài</div>
          <div className="student-stat-cell-value">{totalAttempts}</div>
        </div>
        <div className="student-stat-cell">
          <div className="student-stat-cell-label">Điểm trung bình lớp</div>
          <div className="student-stat-cell-value student-stat-cell-value--muted">
            {classAverageScore === null ? "—" : classAverageScore.toFixed(2)}
          </div>
        </div>
        <div className="student-stat-cell">
          <div className="student-stat-cell-label">Buổi ôn tập tuần này</div>
          <div className="student-stat-cell-value student-stat-cell-value--muted">
            {reviewSessionsThisWeek === null ? "—" : reviewSessionsThisWeek}
          </div>
        </div>
      </div>

      <div className="teacher-dashboard-3col">
        <section className="dashboard-col dashboard-col--students hover-card">
          <h3>Học sinh</h3>
          {summaries.length === 0 ? (
            <p className="empty-hint">
              Chưa có học sinh nào đăng ký. Gửi link website cho học sinh để họ đăng nhập bằng
              email.
            </p>
          ) : (
            <ul className="student-picker-list">
              <li>
                <button
                  className={`student-picker-item ${selectedId === null ? "student-picker-item--active" : ""}`}
                  onClick={() => setSelectedId(null)}
                >
                  <span className="student-picker-item-text">
                    <strong>Tổng quan cả lớp</strong>
                    <span className="empty-hint" style={{ padding: 0 }}>{summaries.length} học sinh</span>
                  </span>
                </button>
              </li>
              {summaries.map((s, i) => {
                const palette = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                return (
                  <li key={s.profile.id}>
                    <button
                      className={`student-picker-item ${selectedId === s.profile.id ? "student-picker-item--active" : ""}`}
                      onClick={() => setSelectedId(s.profile.id)}
                    >
                      <span
                        className="student-avatar"
                        style={{ background: palette.bg, color: palette.text }}
                      >
                        {initialsOf(s.profile.full_name)}
                      </span>
                      <span className="student-picker-item-text">
                        <strong>{s.profile.full_name}</strong>
                        <span className="empty-hint" style={{ padding: 0 }}>
                          {s.attemptCount} lượt · TB {s.averageScore?.toFixed(2) ?? "—"}
                        </span>
                      </span>
                    </button>
                    <Link className="student-picker-detail-link" to={`/giao-vien/hoc-sinh/${s.profile.id}`}>
                      Xem chi tiết →
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dashboard-col hover-card">
          <div className="teacher-chart-header">
            <div>
              <h3 style={{ marginBottom: 2 }}>Năng lực theo chương</h3>
              <div className="empty-hint" style={{ padding: 0 }}>
                {selectedSummary ? selectedSummary.profile.full_name : "Cả lớp"}
              </div>
            </div>
            {chapterAverage !== null && (
              <div className="teacher-chart-badge">
                {chapterAverage}
                <span className="teacher-chart-badge-unit">%</span>
              </div>
            )}
          </div>
          {chapterChartData.length === 0 ? (
            <p className="empty-hint">
              Chưa có dữ liệu chương nào — cần học sinh làm ít nhất 1 đề có câu đã được gán chương
              (mục 19, Đợt 1).
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, chapterChartData.length * 42)}>
              <BarChart data={chapterChartData} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis
                  type="category"
                  dataKey="topic_name"
                  width={150}
                  tickFormatter={truncateChapterLabel}
                />
                <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                <Bar dataKey="accuracy" fill="#9c1420" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="dashboard-col hover-card">
          <div className="teacher-chart-header">
            <div>
              <h3 style={{ marginBottom: 2 }}>
                {selectedSummary ? "So với trung bình cả lớp" : "Trung bình cả lớp theo chương"}
              </h3>
              {selectedSummary && (
                <div className="empty-hint" style={{ padding: 0 }}>{selectedSummary.profile.full_name}</div>
              )}
            </div>
          </div>
          {comparisonData.length === 0 ? (
            <p className="empty-hint">Chưa có dữ liệu chương nào để so sánh.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, comparisonData.length * 42)}>
              <BarChart data={comparisonData} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis
                  type="category"
                  dataKey="topic_name"
                  width={150}
                  tickFormatter={truncateChapterLabel}
                />
                <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                <Legend />
                {selectedSummary && (
                  <Bar
                    dataKey="studentAccuracy"
                    name={selectedSummary.profile.full_name}
                    fill="#9c1420"
                    radius={[0, 4, 4, 0]}
                  />
                )}
                <Bar dataKey="classAccuracy" name="Cả lớp" fill="#3e6259" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  );
}
