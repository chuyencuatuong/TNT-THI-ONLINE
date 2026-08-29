import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { initialsOf } from "../lib/avatar";
import type { AttendanceRow, AttendanceStatus, ClassRow, ClassSessionRow, Profile } from "../lib/types";

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];
const DOW_NAMES_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const DOW_NAMES_FULL = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const DOW_NAMES_FULL_SUN_FIRST = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

// Bảng màu cố định theo VỊ TRÍ lớp trong danh sách (không đổi theo lựa chọn
// đang xem) — chỉ để phân biệt các lớp trên lịch, không mang ý nghĩa xếp hạng.
const CLASS_COLORS = ["#7b8fd6", "#5aa08e", "#c98a3f", "#9c1420", "#8256a8", "#3d7dbf"];

const ATTENDANCE_CHOICES: { value: AttendanceStatus; label: string }[] = [
  { value: "co_mat", label: "Có mặt" },
  { value: "tre", label: "Trễ" },
  { value: "phep", label: "Phép" },
  { value: "vang", label: "Vắng" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** JS getDay(): 0=Chủ nhật..6=Thứ 7 -> quy đổi 0=Thứ 2..6=Chủ nhật (thứ tự hiển thị VN). */
function jsDowToMonFirst(jsDow: number): number {
  return (jsDow + 6) % 7;
}
function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Lịch học (Nhóm 3, "quản lý lớp học", 28/08/2026 — demo đã duyệt) — CHỈ
 * giao diện giáo viên (học sinh dùng StudentSchedule.tsx dạng danh sách đơn
 * giản hơn, quyết định đã chốt). Lưới tháng kiểu Google Calendar; buổi học
 * tạo TAY từng buổi (quyết định đã chốt, xem migration_013) — công cụ "tạo
 * nhiều buổi lặp lại" chỉ là tạo hàng loạt cho tiện, vẫn ra N bản ghi riêng.
 *
 * Kết nối Google Calendar thật: Thầy Tường quyết định để đợt sau (28/08/2026)
 * — hạ tầng (class_sessions.external_source/external_event_id) đã chuẩn bị
 * sẵn ở migration_013 để việc nối API sau này không cần thêm migration.
 */
export function TeacherSchedule() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<"month" | "agenda">("month");
  const [sessions, setSessions] = useState<ClassSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [attendanceOpenFor, setAttendanceOpenFor] = useState<string | null>(null);
  const [attendanceBySession, setAttendanceBySession] = useState<Record<string, AttendanceRow[]>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"single" | "repeat">("single");
  const [modalClassId, setModalClassId] = useState<string>("");
  const [singleDate, setSingleDate] = useState("");
  const [singleStart, setSingleStart] = useState("19:00");
  const [singleEnd, setSingleEnd] = useState("21:00");
  const [repeatDows, setRepeatDows] = useState<Set<number>>(new Set());
  const [repeatStart, setRepeatStart] = useState("19:00");
  const [repeatEnd, setRepeatEnd] = useState("21:00");
  const [repeatFrom, setRepeatFrom] = useState("");
  const [repeatTo, setRepeatTo] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);

  const today = new Date();

  useEffect(() => {
    (async () => {
      const [classesData, studentsData] = await Promise.all([api.listClasses(), api.listStudents()]);
      setClasses(classesData);
      setStudents(studentsData);
      if (classesData.length > 0) setModalClassId(classesData[0].id);
      setLoading(false);
    })();
  }, []);

  // Nạp buổi học trong khoảng lưới đang hiển thị (bao gồm cả ngày tháng
  // trước/sau tràn vào ô lịch) mỗi khi đổi tháng.
  useEffect(() => {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - jsDowToMonFirst(firstOfMonth.getDay()));
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridEnd.getDate() + 42);
    api
      .listClassSessions(gridStart.toISOString(), gridEnd.toISOString())
      .then(setSessions)
      .catch((err) => console.error("Không lấy được buổi học:", err));
  }, [viewMonth]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const classColor = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c, i) => map.set(c.id, CLASS_COLORS[i % CLASS_COLORS.length]));
    return map;
  }, [classes]);
  const studentsByClass = useMemo(() => {
    const map = new Map<string, Profile[]>();
    for (const c of classes) map.set(c.id, []);
    for (const s of students) {
      if (s.class_id && map.has(s.class_id)) map.get(s.class_id)!.push(s);
    }
    return map;
  }, [classes, students]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, ClassSessionRow[]>();
    for (const s of sessions) {
      const key = dateKey(new Date(s.starts_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [sessions]);

  function openModal(prefillDate?: string) {
    setModalMode("single");
    setSingleDate(prefillDate ?? dateKey(new Date()));
    if (classes.length > 0 && !modalClassId) setModalClassId(classes[0].id);
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    setRepeatFrom(dateKey(from));
    setRepeatTo(dateKey(to));
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
  }
  function toggleRepeatDow(i: number) {
    setRepeatDows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const repeatPreview = useMemo(() => {
    if (!repeatFrom || !repeatTo || repeatDows.size === 0) return [];
    const out: string[] = [];
    const cur = new Date(repeatFrom + "T00:00:00");
    const end = new Date(repeatTo + "T00:00:00");
    while (cur <= end && out.length < 80) {
      if (repeatDows.has(jsDowToMonFirst(cur.getDay()))) {
        out.push(`${DOW_NAMES_FULL[jsDowToMonFirst(cur.getDay())]}, ${cur.getDate()}/${cur.getMonth() + 1}`);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [repeatFrom, repeatTo, repeatDows]);

  async function refreshSessionsInView() {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - jsDowToMonFirst(firstOfMonth.getDay()));
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridEnd.getDate() + 42);
    const data = await api.listClassSessions(gridStart.toISOString(), gridEnd.toISOString());
    setSessions(data);
  }

  async function submitModal() {
    if (!modalClassId) return;
    setCreatingSession(true);
    try {
      if (modalMode === "single") {
        if (!singleDate) return;
        await api.createClassSession(
          modalClassId,
          new Date(`${singleDate}T${singleStart}:00`).toISOString(),
          new Date(`${singleDate}T${singleEnd}:00`).toISOString(),
        );
      } else {
        if (repeatDows.size === 0 || !repeatFrom || !repeatTo) return;
        await api.createRecurringClassSessions(
          modalClassId,
          Array.from(repeatDows),
          repeatStart,
          repeatEnd,
          repeatFrom,
          repeatTo,
        );
      }
      await refreshSessionsInView();
      closeModal();
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleDeleteSession(s: ClassSessionRow) {
    if (!confirm("Xoá buổi học này? Điểm danh đã ghi (nếu có) cũng sẽ bị xoá theo.")) return;
    await api.deleteClassSession(s.id);
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    if (attendanceOpenFor === s.id) setAttendanceOpenFor(null);
  }

  async function openAttendance(sessionId: string) {
    if (attendanceOpenFor === sessionId) {
      setAttendanceOpenFor(null);
      return;
    }
    setAttendanceOpenFor(sessionId);
    if (!attendanceBySession[sessionId]) {
      const rows = await api.listAttendanceForSession(sessionId);
      setAttendanceBySession((prev) => ({ ...prev, [sessionId]: rows }));
    }
  }

  async function markAttendance(sessionId: string, studentId: string, status: AttendanceStatus) {
    setSavingAttendance(true);
    try {
      await api.setAttendance(sessionId, studentId, status);
      setAttendanceBySession((prev) => {
        const existing = prev[sessionId] ?? [];
        const others = existing.filter((r) => r.student_id !== studentId);
        const updated: AttendanceRow = existing.find((r) => r.student_id === studentId)
          ? { ...existing.find((r) => r.student_id === studentId)!, status }
          : {
              id: `temp-${studentId}`,
              session_id: sessionId,
              student_id: studentId,
              status,
              note: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
        return { ...prev, [sessionId]: [...others, updated] };
      });
    } finally {
      setSavingAttendance(false);
    }
  }

  function navMonth(delta: number) {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }
  function goToday() {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  const monthGridCells: { date: Date; key: string; isOtherMonth: boolean; isToday: boolean }[] = [];
  {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - jsDowToMonFirst(firstOfMonth.getDay()));
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      monthGridCells.push({
        date: d,
        key: dateKey(d),
        isOtherMonth: d.getMonth() !== viewMonth.getMonth(),
        isToday: dateKey(d) === dateKey(today),
      });
    }
  }

  const agendaKeys = Array.from(sessionsByDate.keys())
    .filter((k) => {
      const d = new Date(k);
      return d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth();
    })
    .sort();

  const selectedDaySessions = selectedDateKey ? sessionsByDate.get(selectedDateKey) ?? [] : [];

  function renderAttendancePanel(s: ClassSessionRow) {
    const roster = studentsByClass.get(s.class_id) ?? [];
    const records = attendanceBySession[s.id];
    if (!records) return <p className="empty-hint" style={{ padding: "8px 20px" }}>Đang tải điểm danh...</p>;
    return (
      <div style={{ borderTop: "1px solid var(--color-border)" }}>
        {roster.length === 0 ? (
          <p className="empty-hint" style={{ padding: "8px 20px" }}>Lớp này chưa có học sinh nào.</p>
        ) : (
          roster.map((st) => {
            const current = records.find((r) => r.student_id === st.id)?.status ?? null;
            return (
              <div className="attendance-row" key={st.id}>
                <div className="attendance-name">
                  <span className="student-avatar" style={{ background: "var(--color-subtle-bg)", color: "var(--color-text)" }}>
                    {initialsOf(st.full_name)}
                  </span>
                  {st.full_name}
                </div>
                <div className="attendance-choices">
                  {ATTENDANCE_CHOICES.map((c) => (
                    <button
                      key={c.value}
                      className={`attendance-choice attendance-choice--${c.value} ${current === c.value ? "attendance-choice--active" : ""}`}
                      disabled={savingAttendance}
                      onClick={() => markAttendance(s.id, st.id, c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <div>
          <h2 style={{ marginBottom: 4 }}>Lịch học</h2>
          <div className="empty-hint" style={{ padding: 0 }}>
            Tất cả lớp trên 1 lịch — mỗi lớp 1 màu. Bấm 1 ngày để xem chi tiết/điểm danh.
          </div>
        </div>
        <button className="btn-primary" onClick={() => openModal()}>
          + Thêm buổi học
        </button>
      </div>

      <div className="gcal-banner gcal-banner--off">
        <span className="gcal-banner-text">
          <span className="gcal-dot"></span>
          <strong>Google Calendar</strong> — chưa kết nối.
          <span className="gcal-banner-note">
            Đã chuẩn bị sẵn hạ tầng dữ liệu để nối sau này — Thầy quyết định làm ở đợt sau.
          </span>
        </span>
        <button className="btn-secondary" disabled title="Sẽ làm ở đợt sau, theo quyết định của Thầy">
          Kết nối (sắp có)
        </button>
      </div>

      {classes.length === 0 ? (
        <p className="empty-hint">Chưa có lớp nào — vào "Lớp học" để tạo lớp trước khi thêm buổi học.</p>
      ) : (
        <>
          <div className="cal-legend">
            {classes.map((c) => (
              <div className="cal-legend-item" key={c.id}>
                <span className="cal-legend-dot" style={{ background: classColor.get(c.id) }} />
                {c.name}
              </div>
            ))}
          </div>

          <div className="cal-toolbar">
            <div className="cal-toolbar-left">
              <button className="cal-nav-btn" onClick={() => navMonth(-1)}>‹</button>
              <button className="cal-nav-btn" onClick={() => navMonth(1)}>›</button>
              <button className="cal-today-btn" onClick={goToday}>Hôm nay</button>
              <span className="cal-month-label">
                {MONTH_NAMES[viewMonth.getMonth()]}, {viewMonth.getFullYear()}
              </span>
            </div>
            <div className="cal-view-switch">
              <button
                className={`cal-view-btn ${view === "month" ? "cal-view-btn--active" : ""}`}
                onClick={() => setView("month")}
              >
                Tháng
              </button>
              <button className="cal-view-btn cal-view-btn--soon" title="Sắp có">Tuần</button>
              <button
                className={`cal-view-btn ${view === "agenda" ? "cal-view-btn--active" : ""}`}
                onClick={() => setView("agenda")}
              >
                Danh sách
              </button>
            </div>
          </div>

          {view === "month" ? (
            <>
              <div className="cal-dow-row">
                {DOW_NAMES_SHORT.map((d) => (
                  <div className="cal-dow-cell" key={d}>{d}</div>
                ))}
              </div>
              <div className="cal-grid">
                {monthGridCells.map((cell) => {
                  const daySessions = sessionsByDate.get(cell.key) ?? [];
                  const shown = daySessions.slice(0, 3);
                  const extra = daySessions.length - shown.length;
                  return (
                    <button
                      key={cell.key}
                      className={`cal-cell ${cell.isOtherMonth ? "cal-cell--other" : ""} ${cell.isToday ? "cal-cell--today" : ""} ${cell.key === selectedDateKey ? "cal-cell--selected" : ""}`}
                      onClick={() => setSelectedDateKey(cell.key)}
                    >
                      <span className="cal-date-num">{cell.date.getDate()}</span>
                      {shown.map((s) => (
                        <span key={s.id} className="cal-chip" style={{ background: classColor.get(s.class_id) }}>
                          {formatHm(s.starts_at)} {classById.get(s.class_id)?.name ?? ""}
                        </span>
                      ))}
                      {extra > 0 && <span className="cal-more">+{extra} khác</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ marginBottom: "var(--space-5)" }}>
              {agendaKeys.length === 0 ? (
                <p className="empty-hint">Không có buổi học nào trong tháng này.</p>
              ) : (
                agendaKeys.map((key) => {
                  const d = new Date(key);
                  const daySessions = sessionsByDate.get(key) ?? [];
                  return (
                    <div className="agenda-group" key={key}>
                      <div className="agenda-group-title">
                        {DOW_NAMES_FULL_SUN_FIRST[d.getDay()]}, {d.getDate()}/{d.getMonth() + 1}
                      </div>
                      <div className="hover-card">
                        {daySessions.map((s) => (
                          <div className="day-item" key={s.id}>
                            <div className="day-item-color" style={{ background: classColor.get(s.class_id) }} />
                            <div className="day-item-time">
                              {formatHm(s.starts_at)}–{formatHm(s.ends_at)}
                            </div>
                            <div className="day-item-body">
                              <div className="day-item-title">{classById.get(s.class_id)?.name ?? "—"}</div>
                            </div>
                            <div className="day-item-action">
                              <button className="btn-secondary" onClick={() => openAttendance(s.id)}>
                                {attendanceOpenFor === s.id ? "Đóng điểm danh" : "Điểm danh"}
                              </button>
                            </div>
                          </div>
                        ))}
                        {daySessions.map((s) => attendanceOpenFor === s.id && (
                          <div key={`att-${s.id}`}>{renderAttendancePanel(s)}</div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {selectedDateKey && (
            <div className="hover-card" style={{ marginBottom: "var(--space-5)" }}>
              <div className="day-panel-header">
                <h3>
                  {(() => {
                    const d = new Date(selectedDateKey);
                    return `${DOW_NAMES_FULL_SUN_FIRST[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                  })()}
                </h3>
                <button className="btn-secondary" onClick={() => openModal(selectedDateKey)}>
                  + Thêm buổi vào ngày này
                </button>
              </div>
              {selectedDaySessions.length === 0 ? (
                <p className="empty-hint" style={{ padding: "16px 20px" }}>Không có buổi học nào.</p>
              ) : (
                selectedDaySessions.map((s) => (
                  <div key={s.id}>
                    <div className="day-item">
                      <div className="day-item-color" style={{ background: classColor.get(s.class_id) }} />
                      <div className="day-item-time">
                        {formatHm(s.starts_at)}–{formatHm(s.ends_at)}
                      </div>
                      <div className="day-item-body">
                        <div className="day-item-title">{classById.get(s.class_id)?.name ?? "—"}</div>
                        <div className="day-item-sub">{(studentsByClass.get(s.class_id) ?? []).length} học sinh</div>
                      </div>
                      <div className="day-item-action" style={{ display: "flex", gap: 6 }}>
                        <button className="btn-primary" onClick={() => openAttendance(s.id)}>
                          {attendanceOpenFor === s.id ? "Đóng" : "Điểm danh"}
                        </button>
                        <button className="btn-secondary" style={{ color: "var(--color-danger)" }} onClick={() => handleDeleteSession(s)}>
                          Xoá
                        </button>
                      </div>
                    </div>
                    {attendanceOpenFor === s.id && renderAttendancePanel(s)}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      <div className={`modal-overlay ${modalOpen ? "modal-overlay--open" : ""}`}>
        <div className="modal-box">
          <div className="modal-head">
            <h3>Thêm buổi học</h3>
            <button className="modal-close" onClick={closeModal}>✕</button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Lớp</label>
              <div className="class-pick-row">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    className={`class-pick-chip ${modalClassId === c.id ? "class-pick-chip--active" : ""}`}
                    style={modalClassId === c.id ? { background: classColor.get(c.id) } : undefined}
                    onClick={() => setModalClassId(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-mode-tabs">
              <button
                className={`modal-mode-tab ${modalMode === "single" ? "modal-mode-tab--active" : ""}`}
                onClick={() => setModalMode("single")}
              >
                1 buổi
              </button>
              <button
                className={`modal-mode-tab ${modalMode === "repeat" ? "modal-mode-tab--active" : ""}`}
                onClick={() => setModalMode("repeat")}
              >
                Nhiều buổi (lặp lại)
              </button>
            </div>

            {modalMode === "single" ? (
              <div className="field-row">
                <div className="field">
                  <label>Ngày</label>
                  <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Giờ bắt đầu – kết thúc</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="time" value={singleStart} onChange={(e) => setSingleStart(e.target.value)} />
                    <input type="time" value={singleEnd} onChange={(e) => setSingleEnd(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="field">
                  <label>Lặp vào các thứ</label>
                  <div className="dow-pick-row">
                    {DOW_NAMES_SHORT.map((label, i) => (
                      <button
                        key={i}
                        className={`dow-pick-chip ${repeatDows.has(i) ? "dow-pick-chip--active" : ""}`}
                        onClick={() => toggleRepeatDow(i)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field-row" style={{ marginTop: "var(--space-4)" }}>
                  <div className="field">
                    <label>Giờ bắt đầu – kết thúc</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="time" value={repeatStart} onChange={(e) => setRepeatStart(e.target.value)} />
                      <input type="time" value={repeatEnd} onChange={(e) => setRepeatEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Từ ngày → đến ngày</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="date" value={repeatFrom} onChange={(e) => setRepeatFrom(e.target.value)} />
                      <input type="date" value={repeatTo} onChange={(e) => setRepeatTo(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="field" style={{ marginTop: "var(--space-4)" }}>
                  <label>Xem trước — mỗi buổi vẫn tạo riêng, sửa/xoá được từng buổi</label>
                  <div className="repeat-preview">
                    {repeatPreview.length === 0 ? (
                      "Chọn ít nhất 1 thứ trong tuần để xem trước."
                    ) : (
                      <>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--color-text)" }}>
                          Sẽ tạo {repeatPreview.length} buổi:
                        </div>
                        {repeatPreview.map((s, i) => (
                          <div className="repeat-preview-item" key={i}>{s}</div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn-secondary" onClick={closeModal}>Huỷ</button>
            <button
              className="btn-primary"
              disabled={creatingSession || !modalClassId || (modalMode === "repeat" && repeatDows.size === 0)}
              onClick={submitModal}
            >
              {creatingSession ? "Đang tạo..." : modalMode === "single" ? "Tạo buổi học" : "Tạo tất cả buổi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
