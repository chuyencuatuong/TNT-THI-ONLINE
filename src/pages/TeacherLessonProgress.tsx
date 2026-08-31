import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { AVATAR_PALETTE } from "../lib/avatar";
import { formatRelativeDate } from "../lib/format";
import type { ClassRow, Lesson, LessonProgressRow, Topic } from "../lib/types";

/**
 * Tiến độ bài dạy (migration_016, đề xuất "tiến độ bài dạy" đã duyệt) — giải
 * quyết đúng 2 nhu cầu Thầy Tường nêu, KHÔNG so sánh/xếp hạng lớp nào
 * nhanh/chậm vì 4 lớp thực tế tiến độ khác nhau CÓ CHỦ ĐÍCH (nâng cao/cơ bản,
 * tuyển sinh sớm/muộn):
 *  1) "Quên hôm trước dạy tới đâu" -> recall-card hiện ngay Bài đang dạy dở
 *     (Bài đầu tiên theo đúng thứ tự PPCT mà lớp CHƯA tick xong) + % hoàn
 *     thành, không cần nhớ hay lục lại.
 *  2) "So các lớp cùng khối để lên kế hoạch" -> danh sách trung lập (không
 *     tô đậm lớp nào là "nhanh nhất"), chỉ hiện vị trí hiện tại từng lớp.
 *
 * "Đang dạy tới" được suy ra (không có cột riêng lưu) từ chính danh sách Bài
 * đã tick: Bài đầu tiên theo (topics.order_index, lessons.order_index) CHƯA
 * có dòng lesson_progress cho lớp đó. Tick không bắt buộc đúng thứ tự (giáo
 * viên có thể tick trước/tick lại) nên đây là suy luận hợp lý nhất, không
 * phải quy tắc cứng.
 */

interface ClassProgress {
  cls: ClassRow;
  lessonsInOrder: Lesson[];
  completedIds: Set<string>;
  percent: number;
  currentLesson: Lesson | null;
  lastTickAt: string | null;
}

export function TeacherLessonProgress() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progressByClass, setProgressByClass] = useState<Map<string, LessonProgressRow[]>>(new Map());
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // lessonId đang lưu, để disable đúng 1 checkbox

  useEffect(() => {
    (async () => {
      const [classesData, topicsData, lessonsData] = await Promise.all([
        api.listClasses(),
        api.listTopics(),
        api.listLessons(),
      ]);
      setClasses(classesData);
      setTopics(topicsData);
      setLessons(lessonsData);
      const gradedClassIds = classesData.filter((c) => c.grade !== null).map((c) => c.id);
      const progress = await api.listLessonProgressForClasses(gradedClassIds);
      const map = new Map<string, LessonProgressRow[]>();
      for (const p of progress) {
        const arr = map.get(p.class_id) ?? [];
        arr.push(p);
        map.set(p.class_id, arr);
      }
      setProgressByClass(map);
      const firstGraded = classesData.find((c) => c.grade !== null) ?? null;
      setSelectedClassId(firstGraded?.id ?? null);
      setLoading(false);
    })();
  }, []);

  const gradedClasses = useMemo(() => classes.filter((c) => c.grade !== null), [classes]);

  // Bài của 1 khối, ĐÚNG thứ tự PPCT (topics.order_index rồi lessons.order_index).
  const lessonsByGrade = useMemo(() => {
    const topicsByGrade = new Map<number, Topic[]>();
    for (const t of topics) {
      const arr = topicsByGrade.get(t.grade) ?? [];
      arr.push(t);
      topicsByGrade.set(t.grade, arr);
    }
    const result = new Map<number, Lesson[]>();
    for (const [grade, gradeTopics] of topicsByGrade) {
      const sortedTopics = [...gradeTopics].sort(
        (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999),
      );
      const topicOrder = new Map(sortedTopics.map((t, i) => [t.id, i]));
      const gradeLessons = lessons
        .filter((l) => topicOrder.has(l.topic_id))
        .sort((a, b) => {
          const ta = topicOrder.get(a.topic_id)!;
          const tb = topicOrder.get(b.topic_id)!;
          if (ta !== tb) return ta - tb;
          return (a.order_index ?? 999) - (b.order_index ?? 999);
        });
      result.set(grade, gradeLessons);
    }
    return result;
  }, [topics, lessons]);

  function buildClassProgress(cls: ClassRow): ClassProgress | null {
    if (cls.grade === null) return null;
    const lessonsInOrder = lessonsByGrade.get(cls.grade) ?? [];
    const rows = progressByClass.get(cls.id) ?? [];
    const completedIds = new Set(rows.map((r) => r.lesson_id));
    const percent = lessonsInOrder.length > 0 ? Math.round((completedIds.size / lessonsInOrder.length) * 100) : 0;
    const currentLesson = lessonsInOrder.find((l) => !completedIds.has(l.id)) ?? null;
    const lastTickAt = rows.reduce<string | null>((latest, r) => {
      if (!latest || r.completed_at > latest) return r.completed_at;
      return latest;
    }, null);
    return { cls, lessonsInOrder, completedIds, percent, currentLesson, lastTickAt };
  }

  const selectedClass = gradedClasses.find((c) => c.id === selectedClassId) ?? null;
  const selectedProgress = selectedClass ? buildClassProgress(selectedClass) : null;
  const peerClasses = selectedClass
    ? gradedClasses.filter((c) => c.grade === selectedClass.grade)
    : [];
  const peerProgress = peerClasses
    .map((c) => buildClassProgress(c))
    .filter((p): p is ClassProgress => p !== null);

  async function handleToggleLesson(classId: string, lessonId: string, checked: boolean) {
    if (!profile) return;
    setSaving(lessonId);
    try {
      if (checked) {
        const row = await api.markLessonTaught({ class_id: classId, lesson_id: lessonId, marked_by: profile.id });
        setProgressByClass((prev) => {
          const next = new Map(prev);
          const arr = (next.get(classId) ?? []).filter((r) => r.lesson_id !== lessonId);
          arr.push(row);
          next.set(classId, arr);
          return next;
        });
      } else {
        await api.unmarkLessonTaught(classId, lessonId);
        setProgressByClass((prev) => {
          const next = new Map(prev);
          next.set(classId, (next.get(classId) ?? []).filter((r) => r.lesson_id !== lessonId));
          return next;
        });
      }
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <div className="page-title-wrap">
          <h2>Tiến độ bài dạy</h2>
          <p className="empty-hint" style={{ padding: 0 }}>
            Tick từng Bài đã dạy xong cho 1 lớp — xem nhanh đang dạy tới đâu và vị trí các lớp cùng
            khối để lên kế hoạch dạy.
          </p>
        </div>
      </div>

      {gradedClasses.length === 0 ? (
        <p className="empty-hint">
          Chưa có lớp nào được gán khối — vào "Lớp học" để chọn khối (10/11/12) cho từng lớp trước
          khi dùng trang này (Bài theo PPCT được gieo riêng cho từng khối).
        </p>
      ) : (
        <>
          <div className="dash-filter-row">
            <span className="dash-filter-label">Lớp:</span>
            {gradedClasses.map((c) => (
              <button
                key={c.id}
                className={`class-filter-chip ${selectedClassId === c.id ? "class-filter-chip--active" : ""}`}
                onClick={() => setSelectedClassId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          {selectedClass && selectedProgress && (
            <>
              <div className="card hover-card recall-card">
                <div style={{ flex: 1 }}>
                  <div className="card-desc" style={{ marginBottom: 2 }}>
                    {selectedClass.name} — đang dạy tới
                  </div>
                  {selectedProgress.currentLesson ? (
                    <>
                      <div className="recall-name">{selectedProgress.currentLesson.name}</div>
                      <div className="recall-sub">
                        Đã tick xong {selectedProgress.completedIds.size}/{selectedProgress.lessonsInOrder.length} bài
                        {selectedProgress.lastTickAt &&
                          ` · lần tick gần nhất: ${formatRelativeDate(selectedProgress.lastTickAt)}`}
                      </div>
                    </>
                  ) : selectedProgress.lessonsInOrder.length === 0 ? (
                    <div className="recall-name">Chưa có Bài nào cho khối này</div>
                  ) : (
                    <>
                      <div className="recall-name">Đã dạy xong toàn bộ chương trình</div>
                      <div className="recall-sub">
                        {selectedProgress.completedIds.size}/{selectedProgress.lessonsInOrder.length} bài
                      </div>
                    </>
                  )}
                </div>
                <div className="recall-num num">
                  {selectedProgress.percent}
                  <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-muted)" }}>%</span>
                </div>
              </div>

              <div className="dashboard-3col" style={{ gridTemplateColumns: "1.3fr 1.7fr", marginTop: 18 }}>
                <section className="dashboard-col hover-card">
                  <h3>Các lớp khối {selectedClass.grade}</h3>
                  <ul className="student-picker-list">
                    {peerProgress.map((p, i) => {
                      const palette = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                      return (
                        <li key={p.cls.id}>
                          <button
                            className={`student-picker-item ${p.cls.id === selectedClassId ? "student-picker-item--active" : ""}`}
                            onClick={() => setSelectedClassId(p.cls.id)}
                          >
                            <span
                              className="class-avatar"
                              style={{ background: palette.bg, color: palette.text }}
                            >
                              {p.cls.name.slice(0, 4)}
                            </span>
                            <span className="student-picker-item-text">
                              <strong>{p.cls.name}</strong>
                              <span className="card-desc">
                                {p.currentLesson ? p.currentLesson.name : "Đã xong chương trình"} ·{" "}
                                {p.completedIds.size}/{p.lessonsInOrder.length} bài
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="dashboard-col hover-card">
                  <h3 style={{ marginBottom: 2 }}>Vị trí các lớp khối {selectedClass.grade}</h3>
                  <p className="card-desc" style={{ marginTop: 0, marginBottom: 12 }}>
                    Chỉ để tham khảo khi lên kế hoạch dạy — không phải bảng xếp hạng nhanh/chậm.
                  </p>
                  {peerProgress.map((p) => (
                    <div key={p.cls.id} className={`peer-row ${p.cls.id === selectedClassId ? "self" : ""}`}>
                      <span>
                        {p.cls.name}
                        {p.cls.id === selectedClassId ? " (đang xem)" : ""}
                      </span>
                      <div className="peer-bar-track">
                        <div className="peer-bar-fill" style={{ width: `${p.percent}%` }} />
                      </div>
                      <span className="num">{p.currentLesson ? p.currentLesson.name.split(".")[0] : "Xong"}</span>
                    </div>
                  ))}
                </section>
              </div>

              {selectedProgress.lessonsInOrder.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="card-title" style={{ marginBottom: 10 }}>
                    Danh sách Bài — {selectedClass.name}
                  </div>
                  <div className="table-scroll">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th style={{ width: 44 }}></th>
                          <th>Bài</th>
                          <th style={{ width: 110 }}>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const rowsOut: JSX.Element[] = [];
                          let lastTopicId: string | null = null;
                          for (const lesson of selectedProgress.lessonsInOrder) {
                            if (lesson.topic_id !== lastTopicId) {
                              lastTopicId = lesson.topic_id;
                              const topic = topics.find((t) => t.id === lesson.topic_id);
                              const topicLessons = selectedProgress.lessonsInOrder.filter(
                                (l) => l.topic_id === lesson.topic_id,
                              );
                              const doneInTopic = topicLessons.filter((l) =>
                                selectedProgress.completedIds.has(l.id),
                              ).length;
                              rowsOut.push(
                                <tr className="chapter-tr" key={`chapter-${lesson.topic_id}`}>
                                  <td colSpan={3}>
                                    {topic?.name ?? "(chương chưa rõ)"} — {doneInTopic}/{topicLessons.length} bài
                                  </td>
                                </tr>,
                              );
                            }
                            const done = selectedProgress.completedIds.has(lesson.id);
                            rowsOut.push(
                              <tr key={lesson.id}>
                                <td>
                                  <input
                                    className="lesson-tick"
                                    type="checkbox"
                                    checked={done}
                                    disabled={saving === lesson.id}
                                    onChange={(e) =>
                                      handleToggleLesson(selectedClass.id, lesson.id, e.target.checked)
                                    }
                                  />
                                </td>
                                <td>
                                  <span className={`lesson-name-cell ${done ? "done" : ""}`}>
                                    <span className="lname">{lesson.name}</span>
                                  </span>
                                </td>
                                <td>
                                  {done ? (
                                    <span className="badge badge-ok">Đã dạy</span>
                                  ) : (
                                    <span className="badge badge-muted">Chưa dạy</span>
                                  )}
                                </td>
                              </tr>,
                            );
                          }
                          return rowsOut;
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
