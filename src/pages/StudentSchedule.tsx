import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { computeAttendanceRate } from "../lib/api";
import type { AttendanceRow, AttendanceStatus, ClassRow, ClassSessionRow } from "../lib/types";

const DOW_NAMES_SHORT_SUN_FIRST = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const ATTEND_LABELS: Record<AttendanceStatus, string> = {
  co_mat: "Có mặt",
  tre: "Đi trễ",
  phep: "Nghỉ phép",
  vang: "Vắng (không phép)",
};
const ATTEND_BADGE_CLASS: Record<AttendanceStatus, string> = {
  co_mat: "attend-badge--co_mat",
  tre: "attend-badge--tre",
  phep: "attend-badge--phep",
  vang: "attend-badge--vang",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Lịch học của em (Nhóm 3+4, "quản lý lớp học", 28/08/2026 — demo đã duyệt).
 * CỐ TÌNH dạng danh sách/thẻ đơn giản, KHÔNG dùng lịch lưới kiểu Google
 * Calendar (quyết định đã chốt — lịch lưới chỉ cần bên giáo viên, xem
 * TeacherSchedule.tsx). Học sinh CHỈ XEM — không tự điểm danh được, giáo
 * viên điểm danh trong buổi học (tránh gian lận điểm danh).
 */
export function StudentSchedule() {
  const { profile } = useAuth();
  const [classInfo, setClassInfo] = useState<ClassRow | null>(null);
  const [upcoming, setUpcoming] = useState<ClassSessionRow[]>([]);
  const [history, setHistory] = useState<(AttendanceRow & { session: ClassSessionRow })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      if (profile.class_id) {
        const classes = await api.listClasses();
        setClassInfo(classes.find((c) => c.id === profile.class_id) ?? null);

        const now = new Date();
        const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        const sessions = await api.listClassSessions(
          now.toISOString(),
          in60Days.toISOString(),
          profile.class_id,
        );
        setUpcoming(sessions);
      }
      const hist = await api.listAttendanceHistoryForStudent(profile.id, 10);
      setHistory(hist);
      setLoading(false);
    })();
  }, [profile]);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  if (!profile?.class_id) {
    return (
      <div className="teacher-page">
        <h2>Lịch học của em</h2>
        <p className="empty-hint">
          Em chưa được xếp vào lớp nào — báo giáo viên để được thêm vào lớp, khi đó lịch học và điểm
          danh sẽ hiện ở đây.
        </p>
      </div>
    );
  }

  const attendanceRate = computeAttendanceRate(history.map((h) => ({ status: h.status })));

  return (
    <div className="teacher-page">
      <h2 style={{ marginBottom: 4 }}>Lịch học của em</h2>
      <div className="empty-hint" style={{ padding: 0, marginBottom: "var(--space-4)" }}>
        {classInfo?.name ?? "—"}. Điểm danh do giáo viên thực hiện trong buổi học, em chỉ xem lại ở đây.
      </div>

      <div className="student-stat-strip">
        <div className="student-stat-cell">
          <div className="student-stat-cell-label">Buổi sắp tới</div>
          <div className="student-stat-cell-value">{upcoming.length}</div>
        </div>
        <div className="student-stat-cell">
          <div className="student-stat-cell-label">Đã điểm danh</div>
          <div className="student-stat-cell-value">{history.length}</div>
        </div>
        <div className="student-stat-cell">
          <div className="student-stat-cell-label">Chuyên cần</div>
          <div className="student-stat-cell-value" style={{ color: attendanceRate !== null && attendanceRate < 80 ? "var(--color-danger)" : "var(--color-pine-text)" }}>
            {attendanceRate === null ? "—" : `${attendanceRate}%`}
          </div>
        </div>
      </div>

      <div className="hover-card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <h3 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--font-size-base)" }}>Buổi học sắp tới</h3>
        {upcoming.length === 0 ? (
          <p className="empty-hint">Chưa có buổi học nào được xếp lịch.</p>
        ) : (
          <div className="session-list">
            {upcoming.map((s) => {
              const d = new Date(s.starts_at);
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div className="hover-card session-card" key={s.id}>
                  <div className="session-date-block">
                    <div className="session-date-dow">{DOW_NAMES_SHORT_SUN_FIRST[d.getDay()]}</div>
                    <div className="session-date-day">{d.getDate()}</div>
                  </div>
                  <div className="session-info">
                    <div className="session-info-title">{classInfo?.name}</div>
                    <div className="session-info-sub">
                      {formatHm(s.starts_at)}–{formatHm(s.ends_at)}
                      {isToday && " · Hôm nay"}
                    </div>
                  </div>
                  <span className={`session-status ${isToday ? "session-status--pending" : "session-status--upcoming"}`}>
                    {isToday ? "Hôm nay" : "Sắp tới"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="hover-card">
        <div className="day-panel-header">
          <h3>Lịch sử điểm danh</h3>
          <span className="empty-hint" style={{ padding: 0 }}>{history.length} buổi gần nhất</span>
        </div>
        {history.length === 0 ? (
          <p className="empty-hint" style={{ padding: "16px 20px" }}>Chưa có dữ liệu điểm danh.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.session.starts_at).toLocaleDateString("vi-VN")}</td>
                  <td>
                    <span className={`attend-badge ${ATTEND_BADGE_CLASS[h.status]}`}>
                      {ATTEND_LABELS[h.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
