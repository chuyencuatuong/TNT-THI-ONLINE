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
import { accuracyPercent, buildComparisonRows, mergeChapterStats, type ChapterStat } from "../lib/chapterStats";
import type { Profile } from "../lib/types";

interface StudentSummary {
  profile: Profile;
  attemptCount: number;
  averageScore: number | null;
  lastScore: number | null;
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
 */
export function TeacherDashboard() {
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [chapterStatsByStudent, setChapterStatsByStudent] = useState<Map<string, ChapterStat[]>>(
    new Map(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const students = await api.listStudents();
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
      setLoading(false);
    })();
  }, []);

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

  const comparisonData = useMemo(
    () => buildComparisonRows(classStats, selectedStats),
    [classStats, selectedStats],
  );

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="teacher-page">
      <h2>Tổng quan lớp</h2>

      <div className="teacher-dashboard-3col">
        <section className="dashboard-col dashboard-col--students">
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
                  <strong>Tổng quan cả lớp</strong>
                  <span className="empty-hint">{summaries.length} học sinh</span>
                </button>
              </li>
              {summaries.map((s) => (
                <li key={s.profile.id}>
                  <button
                    className={`student-picker-item ${selectedId === s.profile.id ? "student-picker-item--active" : ""}`}
                    onClick={() => setSelectedId(s.profile.id)}
                  >
                    <strong>{s.profile.full_name}</strong>
                    <span className="empty-hint">
                      {s.attemptCount} lượt làm · TB {s.averageScore?.toFixed(2) ?? "—"}
                    </span>
                  </button>
                  <Link className="student-picker-detail-link" to={`/giao-vien/hoc-sinh/${s.profile.id}`}>
                    Xem chi tiết →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-col">
          <h3>
            Năng lực theo chương
            {selectedSummary ? ` — ${selectedSummary.profile.full_name}` : " — cả lớp"}
          </h3>
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
                <YAxis type="category" dataKey="topic_name" width={150} />
                <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                <Bar dataKey="accuracy" fill="#9c1420" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="dashboard-col">
          <h3>{selectedSummary ? "So với trung bình cả lớp" : "Trung bình cả lớp theo chương"}</h3>
          {comparisonData.length === 0 ? (
            <p className="empty-hint">Chưa có dữ liệu chương nào để so sánh.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, comparisonData.length * 42)}>
              <BarChart data={comparisonData} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis type="category" dataKey="topic_name" width={150} />
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
                <Bar dataKey="classAccuracy" name="Cả lớp" fill="#c9973f" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  );
}
