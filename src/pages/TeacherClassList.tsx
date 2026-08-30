import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { AVATAR_PALETTE, initialsOf } from "../lib/avatar";
import { resolveTier, TIER_LABELS } from "../lib/studentTier";
import type { ClassRow, Profile } from "../lib/types";

const TIER_BADGE_CLASS: Record<string, string> = {
  gioi: "tier-badge--gioi",
  kha: "tier-badge--kha",
  tb: "tier-badge--tb",
  yeu: "tier-badge--yeu",
};

const GRADE_OPTIONS: (10 | 11 | 12)[] = [10, 11, 12];

/**
 * Quản lý lớp học (Nhóm 1, "quản lý lớp học", 28/08/2026 — demo đã duyệt).
 * Trước trang này, hệ thống không có khái niệm "lớp" nào hoạt động được —
 * xem migration_013 + tài liệu dự án "de-xuat-quan-ly-lop-hoc-v1" cho bối
 * cảnh đầy đủ. Trang này CHỈ lo việc tạo/sửa/xoá lớp + thêm/bớt học sinh —
 * số liệu tiến độ/năng lực theo lớp nằm ở TeacherDashboard.tsx (đã có bộ lọc
 * lớp riêng).
 */
export function TeacherClassList() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Điểm TB từng học sinh trong lớp đang xem — chỉ tải khi cần (khi mở lớp
  // đó), không tải hết mọi học sinh như TeacherDashboard (trang đó đã lo
  // phần phân tích, trang này chỉ lo quản lý thành viên lớp).
  const [avgScoreByStudent, setAvgScoreByStudent] = useState<Map<string, number | null>>(new Map());
  const [loadingRosterStats, setLoadingRosterStats] = useState(false);

  const [classModal, setClassModal] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [modalName, setModalName] = useState("");
  const [modalGrade, setModalGrade] = useState<10 | 11 | 12 | "">("");
  const [savingClass, setSavingClass] = useState(false);
  const [addStudentId, setAddStudentId] = useState("");

  useEffect(() => {
    (async () => {
      const [classesData, studentsData] = await Promise.all([api.listClasses(), api.listStudents()]);
      setClasses(classesData);
      setStudents(studentsData);
      if (classesData.length > 0) setActiveClassId(classesData[0].id);
      setLoading(false);
    })();
  }, []);

  const studentsByClass = useMemo(() => {
    const map = new Map<string, Profile[]>();
    for (const c of classes) map.set(c.id, []);
    for (const s of students) {
      if (s.class_id && map.has(s.class_id)) map.get(s.class_id)!.push(s);
    }
    return map;
  }, [classes, students]);

  const activeClass = classes.find((c) => c.id === activeClassId) ?? null;
  const activeRoster = activeClassId ? studentsByClass.get(activeClassId) ?? [] : [];
  const unassignedStudents = students.filter((s) => !s.class_id);

  useEffect(() => {
    if (!activeClassId) return;
    const roster = studentsByClass.get(activeClassId) ?? [];
    const missing = roster.filter((s) => !avgScoreByStudent.has(s.id));
    if (missing.length === 0) return;
    setLoadingRosterStats(true);
    Promise.all(
      missing.map(async (s) => {
        const attempts = (await api.listStudentAttempts(s.id)).filter((a) => a.score);
        const scores = attempts.map((a) => a.score!.total_score);
        const avg = scores.length > 0 ? scores.reduce((sum, v) => sum + v, 0) / scores.length : null;
        return [s.id, avg] as const;
      }),
    )
      .then((pairs) => {
        setAvgScoreByStudent((prev) => {
          const next = new Map(prev);
          for (const [id, avg] of pairs) next.set(id, avg);
          return next;
        });
      })
      .finally(() => setLoadingRosterStats(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClassId, studentsByClass]);

  function openCreateModal() {
    setModalName("");
    setModalGrade("");
    setClassModal({ mode: "create" });
  }
  function openEditModal(c: ClassRow) {
    setModalName(c.name);
    setModalGrade(c.grade ?? "");
    setClassModal({ mode: "edit", id: c.id });
  }
  function closeModal() {
    setClassModal(null);
  }

  async function submitClassModal() {
    if (!modalName.trim() || !classModal) return;
    setSavingClass(true);
    try {
      const grade = modalGrade === "" ? null : modalGrade;
      if (classModal.mode === "create") {
        const created = await api.createClass(modalName.trim(), grade);
        setClasses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "vi")));
        setActiveClassId(created.id);
      } else if (classModal.id) {
        await api.updateClass(classModal.id, { name: modalName.trim(), grade });
        setClasses((prev) =>
          prev.map((c) => (c.id === classModal.id ? { ...c, name: modalName.trim(), grade } : c)),
        );
      }
      closeModal();
    } finally {
      setSavingClass(false);
    }
  }

  async function handleDeleteClass(c: ClassRow) {
    const roster = studentsByClass.get(c.id) ?? [];
    const warning =
      roster.length > 0
        ? `Xoá lớp "${c.name}"? ${roster.length} học sinh trong lớp sẽ trở thành "chưa xếp lớp" (không xoá học sinh, không xoá điểm/lịch sử làm bài).`
        : `Xoá lớp "${c.name}"?`;
    if (!confirm(warning)) return;
    await api.deleteClass(c.id);
    setClasses((prev) => prev.filter((x) => x.id !== c.id));
    setStudents((prev) => prev.map((s) => (s.class_id === c.id ? { ...s, class_id: null } : s)));
    if (activeClassId === c.id) setActiveClassId(null);
  }

  async function handleAddStudent() {
    if (!addStudentId || !activeClassId) return;
    await api.setStudentClass(addStudentId, activeClassId);
    setStudents((prev) => prev.map((s) => (s.id === addStudentId ? { ...s, class_id: activeClassId } : s)));
    setAddStudentId("");
  }

  async function handleRemoveStudent(studentId: string) {
    if (!confirm("Bỏ học sinh này khỏi lớp? (Không xoá điểm/lịch sử làm bài, chỉ bỏ khỏi lớp.)")) return;
    await api.setStudentClass(studentId, null);
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, class_id: null } : s)));
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <div>
          <h2 style={{ marginBottom: 4 }}>Quản lý lớp</h2>
          <div className="empty-hint" style={{ padding: 0 }}>
            {classes.length} lớp · {students.length} học sinh
            {unassignedStudents.length > 0 && ` (${unassignedStudents.length} chưa xếp lớp)`}
          </div>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          + Thêm lớp mới
        </button>
      </div>

      {classes.length === 0 ? (
        <p className="empty-hint">Chưa có lớp nào — bấm "+ Thêm lớp mới" để bắt đầu.</p>
      ) : (
        <div className="class-grid">
          {classes.map((c) => {
            const roster = studentsByClass.get(c.id) ?? [];
            const scored = roster
              .map((s) => avgScoreByStudent.get(s.id))
              .filter((v): v is number => typeof v === "number");
            const avg = scored.length > 0 ? scored.reduce((sum, v) => sum + v, 0) / scored.length : null;
            return (
              <button
                key={c.id}
                className={`class-card ${c.id === activeClassId ? "class-card--active" : ""}`}
                onClick={() => setActiveClassId(c.id)}
              >
                <div className="class-card-top">
                  <div>
                    <p className="class-card-name">{c.name}</p>
                    <span className="class-card-grade">{roster.length} học sinh</span>
                  </div>
                  {c.grade && <span className="class-card-khoi-badge">Khối {c.grade}</span>}
                </div>
                <div className="class-card-stats">
                  <div>
                    <div className="class-card-stat-value">{avg === null ? "—" : avg.toFixed(1)}</div>
                    <div className="class-card-stat-label">Điểm TB lớp</div>
                  </div>
                </div>
                <div className="class-card-avatars">
                  {roster.slice(0, 4).map((s, i) => {
                    const palette = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                    return (
                      <span
                        key={s.id}
                        className="student-avatar"
                        style={{ background: palette.bg, color: palette.text }}
                      >
                        {initialsOf(s.full_name)}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {activeClass && (
        <div className="hover-card roster-section">
          <div className="roster-header">
            <div>
              <h3>{activeClass.name}</h3>
              <div className="roster-header-sub">
                {activeClass.grade ? `Khối ${activeClass.grade} · ` : ""}
                {activeRoster.length} học sinh
                {loadingRosterStats && " · đang tải điểm..."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" onClick={() => openEditModal(activeClass)}>
                Sửa thông tin lớp
              </button>
              <button className="btn-secondary" style={{ color: "var(--color-danger)" }} onClick={() => handleDeleteClass(activeClass)}>
                Xoá lớp
              </button>
            </div>
          </div>

          {activeRoster.length === 0 ? (
            <p className="empty-hint">Lớp này chưa có học sinh nào — thêm bên dưới.</p>
          ) : (
            <table className="roster-table history-table">
              <thead>
                <tr>
                  <th>Học sinh</th>
                  <th>Tầng</th>
                  <th>Điểm TB</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeRoster.map((s, i) => {
                  const palette = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                  const avg = avgScoreByStudent.get(s.id) ?? null;
                  const { tier, isOverride } = resolveTier(s.manual_tier, avg);
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="student-name-cell">
                          <span className="student-avatar" style={{ background: palette.bg, color: palette.text }}>
                            {initialsOf(s.full_name)}
                          </span>
                          <span>{s.full_name}</span>
                        </div>
                      </td>
                      <td>
                        {tier ? (
                          <span className={`tier-badge ${TIER_BADGE_CLASS[tier]}`}>
                            {TIER_LABELS[tier]}
                            {isOverride && <span title="Giáo viên đã ghi đè tay"> ✎</span>}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{avg === null ? "—" : avg.toFixed(1)}</td>
                      <td>
                        <button className="roster-remove-btn" onClick={() => handleRemoveStudent(s.id)}>
                          Bỏ khỏi lớp
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="add-student-row" style={{ display: "flex", gap: 8, alignItems: "center", borderTop: activeRoster.length === 0 ? "none" : undefined }}>
            <select value={addStudentId} onChange={(e) => setAddStudentId(e.target.value)} style={{ flex: 1 }}>
              <option value="">+ Thêm học sinh vào lớp...</option>
              {students
                .filter((s) => s.class_id !== activeClassId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.class_id ? ` (đang ở lớp khác)` : ""}
                  </option>
                ))}
            </select>
            <button className="btn-secondary" disabled={!addStudentId} onClick={handleAddStudent}>
              Thêm
            </button>
          </div>
        </div>
      )}

      <div className={`modal-overlay ${classModal ? "modal-overlay--open" : ""}`}>
        <div className="modal-box">
          <div className="modal-head">
            <h3>{classModal?.mode === "create" ? "Thêm lớp mới" : "Sửa thông tin lớp"}</h3>
            <button className="modal-close" onClick={closeModal}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Tên lớp</label>
              <input
                type="text"
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                placeholder="vd. Lớp 12 – Ca tối"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Khối (không bắt buộc)</label>
              <select value={modalGrade} onChange={(e) => setModalGrade(e.target.value === "" ? "" : (Number(e.target.value) as 10 | 11 | 12))}>
                <option value="">Không chọn (lớp ôn ghép nhiều khối)</option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    Khối {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn-secondary" onClick={closeModal}>
              Huỷ
            </button>
            <button className="btn-primary" disabled={!modalName.trim() || savingClass} onClick={submitClassModal}>
              {savingClass ? "Đang lưu..." : classModal?.mode === "create" ? "Tạo lớp" : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
