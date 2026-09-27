import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { diagnosisFromTotals, type LessonEvidence, type PrereqEdge } from "../lib/knowledgeGraph";
import type { LessonStat } from "../lib/lessonStats";
import type { ClassRow, Lesson, Profile, Topic } from "../lib/types";
import { MASTERY_COLOR } from "../lib/diagnosis";
import { RootCauseTree } from "../components/RootCauseTree";

const WEIGHT_OPTIONS = [
  { value: 0.8, label: "Quan trọng" },
  { value: 0.5, label: "Vừa" },
  { value: 0.3, label: "Nhẹ" },
];

function weightLabel(w: number): string {
  if (w >= 0.7) return "Quan trọng";
  if (w >= 0.45) return "Vừa";
  return "Nhẹ";
}

/**
 * Bản đồ kiến thức (Module 3, 27/09/2026): giáo viên khai báo "Bài nào là nền
 * tảng cho Bài nào" (skill_prerequisites) và xem cây phân nhánh tô màu theo
 * độ chính xác của cả lớp. Cạnh "theo PPCT" do hệ thống tự thêm (nhẹ), cạnh
 * quan trọng xuyên chương do thầy xác nhận — gợi ý ban đầu cho Chương 1 Lớp 12
 * đã có sẵn trong migration_020, thầy sửa/xoá tuỳ ý.
 */
export function TeacherKnowledgeMap() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [edges, setEdges] = useState<PrereqEdge[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [topicId, setTopicId] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [classStats, setClassStats] = useState<LessonStat[]>([]);
  const [openTree, setOpenTree] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, { prereq: string; weight: number }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reloadEdges() {
    const r = await api.listSkillPrerequisites();
    setEdges(r.edges);
    setTableMissing(r.tableMissing);
  }

  useEffect(() => {
    Promise.all([api.listTopics(), api.listLessons(), api.listClasses(), api.listStudents(), reloadEdges()])
      .then(([ts, ls, cs, ss]) => {
        const sorted = [...ts].sort((a, b) => b.grade - a.grade || (a.order_index ?? 99) - (b.order_index ?? 99));
        setTopics(sorted);
        setLessons(ls);
        setClasses(cs);
        setStudents(ss);
        setTopicId(sorted.find((t) => t.grade === 12 && t.order_index === 1)?.id ?? sorted[0]?.id ?? "");
      })
      .catch((err) => setMessage(`Không tải được dữ liệu: ${(err as Error).message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const ids = classId === "" ? [] : students.filter((s) => classId === "*" || s.class_id === classId).map((s) => s.id);
    if (ids.length === 0) {
      setClassStats([]);
      return;
    }
    api.getClassLessonStats(ids).then(setClassStats).catch(() => setClassStats([]));
  }, [classId, students]);

  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const lessonNames = useMemo(() => new Map(lessons.map((l) => [l.id, l.name])), [lessons]);
  const lessonsInTopic = lessons
    .filter((l) => l.topic_id === topicId)
    .sort((a, b) => (a.order_index ?? 99) - (b.order_index ?? 99));
  const evidence = useMemo(() => {
    const m = new Map<string, LessonEvidence>();
    for (const s of classStats) {
      m.set(s.lesson_id, {
        lessonId: s.lesson_id,
        name: s.lesson_name,
        diagnosis: diagnosisFromTotals(s.total, s.correctScore, s.maxScore),
        errorTypeCounts: {},
        patternLabels: [],
      });
    }
    return m;
  }, [classStats]);

  const lessonLabel = (id: string) => {
    const l = lessons.find((x) => x.id === id);
    const t = l ? topicById.get(l.topic_id) : undefined;
    return l ? `${l.name}${t && t.id !== topicId ? ` (Lớp ${t.grade} · ${t.name})` : ""}` : "(Bài đã xoá)";
  };

  async function handleAdd(lessonId: string) {
    const form = adding[lessonId];
    if (!form?.prereq) return;
    setMessage(null);
    try {
      await api.upsertSkillPrerequisite({ lessonId, prerequisiteLessonId: form.prereq, weight: form.weight });
      await reloadEdges();
      setAdding((prev) => ({ ...prev, [lessonId]: { prereq: "", weight: 0.8 } }));
    } catch (err) {
      setMessage(`Không thêm được: ${(err as Error).message}`);
    }
  }

  async function handleDelete(id: string) {
    setMessage(null);
    try {
      await api.deleteSkillPrerequisite(id);
      await reloadEdges();
    } catch (err) {
      setMessage(`Không xoá được: ${(err as Error).message}`);
    }
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  const lessonOptionsByTopic = topics.map((t) => ({
    topic: t,
    lessons: lessons.filter((l) => l.topic_id === t.id).sort((a, b) => (a.order_index ?? 99) - (b.order_index ?? 99)),
  }));

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <h2>Bản đồ kiến thức</h2>
      </div>
      <p className="empty-hint">
        Khai báo Bài nền tảng cho từng Bài. Hệ thống dùng bản đồ này để đề xuất <em>gốc rễ khả dĩ</em> khi học sinh
        yếu 1 Bài (kèm số liệu làm bằng chứng, không bao giờ khẳng định chắc chắn) — xem trong Hồ sơ năng lực của
        từng học sinh.
      </p>
      {tableMissing && (
        <p className="ai-hint">
          Chưa chạy migration_020_knowledge_graph.sql trên Supabase (SQL Editor) — chạy xong tải lại trang.
        </p>
      )}
      {message && <p className="ai-hint">{message}</p>}

      <div className="filter-row">
        <label>Chương:</label>
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              Lớp {t.grade} · {t.name}
            </option>
          ))}
        </select>
        <label>Tô màu theo số liệu:</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Không hiện</option>
          <option value="*">Tất cả học sinh</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              Lớp {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="li-node-list">
        {lessonsInTopic.map((l) => {
          const own = edges.filter((e) => e.lessonId === l.id).sort((a, b) => b.weight - a.weight);
          const ev = evidence.get(l.id);
          const form = adding[l.id] ?? { prereq: "", weight: 0.8 };
          return (
            <div key={l.id} className="li-card">
              <div className="li-card-head">
                <strong>{l.name}</strong>
                {ev && (
                  <span className="diagnosis-badge" style={{ background: MASTERY_COLOR[ev.diagnosis.label] }}>
                    Lớp đúng {Math.round(ev.diagnosis.avgScoreRatio * 100)}% · {ev.diagnosis.sampleCount} câu
                  </span>
                )}
              </div>
              {own.length === 0 ? (
                <p className="li-summary-line">Chưa có Bài nền tảng nào.</p>
              ) : (
                <div className="li-rows">
                  {own.map((e) => (
                    <div key={e.id ?? e.prerequisiteLessonId} className="li-actions" style={{ marginTop: 0 }}>
                      <span>↑ {lessonLabel(e.prerequisiteLessonId)}</span>
                      <span className="tag tag--muted">{weightLabel(e.weight)}</span>
                      <span className="tag tag--muted">{e.source === "ppct_order" ? "theo thứ tự PPCT" : "thầy xác nhận"}</span>
                      {e.id && (
                        <button type="button" className="btn-link btn-danger" onClick={() => handleDelete(e.id!)}>
                          Xoá
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!tableMissing && (
                <div className="li-actions">
                  <select
                    value={form.prereq}
                    onChange={(e) => setAdding((prev) => ({ ...prev, [l.id]: { ...form, prereq: e.target.value } }))}
                  >
                    <option value="">+ Thêm Bài nền tảng...</option>
                    {lessonOptionsByTopic.map(({ topic, lessons: ls }) =>
                      ls.length === 0 ? null : (
                        <optgroup key={topic.id} label={`Lớp ${topic.grade} · ${topic.name}`}>
                          {ls
                            .filter((x) => x.id !== l.id && !own.some((e) => e.prerequisiteLessonId === x.id))
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                        </optgroup>
                      ),
                    )}
                  </select>
                  <select
                    value={form.weight}
                    onChange={(e) =>
                      setAdding((prev) => ({ ...prev, [l.id]: { ...form, weight: Number(e.target.value) } }))
                    }
                  >
                    {WEIGHT_OPTIONS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary" disabled={!form.prereq} onClick={() => handleAdd(l.id)}>
                    Thêm
                  </button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn-link" onClick={() => setOpenTree(openTree === l.id ? null : l.id)}>
                    {openTree === l.id ? "Ẩn cây" : "Xem cây"}
                  </button>
                </div>
              )}
              {openTree === l.id && (
                <div style={{ marginTop: 8 }}>
                  <RootCauseTree
                    lessonId={l.id}
                    edges={edges}
                    tableMissing={tableMissing}
                    lessonNames={lessonNames}
                    evidence={evidence}
                    audience="teacher"
                    showCandidates={false}
                  />
                </div>
              )}
            </div>
          );
        })}
        {lessonsInTopic.length === 0 && <p className="empty-hint">Chương này chưa có Bài nào.</p>}
      </div>
    </div>
  );
}
