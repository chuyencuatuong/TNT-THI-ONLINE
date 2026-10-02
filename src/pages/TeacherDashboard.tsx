import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
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
import {
  lessonAccuracyPercent,
  mergeLessonStats,
  truncateLessonLabel,
  type LessonStat,
} from "../lib/lessonStats";
import { MASTERY_COLOR, summarizeClassRecurringGroups, type RecurringGroupInput } from "../lib/diagnosis";
import type { TopicTrendGroup } from "../lib/api";
import { AVATAR_PALETTE, initialsOf } from "../lib/avatar";
import { resolveTier, TIER_LABELS } from "../lib/studentTier";
import { useDocumentTheme } from "../lib/useTheme";
import {
  computeNudge,
  EMPTY_JOURNAL_SUMMARY,
  JOURNAL_STAGE_HINTS,
  JOURNAL_STAGE_LABELS,
  NUDGE_SORT_ORDER,
  type JournalStage,
  type JournalSummary,
  type NudgeState,
} from "../lib/journalProgress";
import type { ClassRow, Profile } from "../lib/types";

const TIER_BADGE_CLASS: Record<string, string> = {
  gioi: "tier-badge--gioi",
  kha: "tier-badge--kha",
  tb: "tier-badge--tb",
  yeu: "tier-badge--yeu",
};

interface StudentSummary {
  profile: Profile;
  attemptCount: number;
  averageScore: number | null;
  lastScore: number | null;
}

// AVATAR_PALETTE/initialsOf chuyển sang src/lib/avatar.ts (28/08/2026, đợt
// "quản lý lớp học") để dùng lại được ở các trang mới (Quản lý lớp, Lịch học).

/**
 * Dashboard tổng quan giáo viên — 3 cột (mục 19.4 tài liệu đề xuất, Đợt 3):
 * (1) danh sách học sinh (bấm để chọn), (2) biểu đồ năng lực theo CHƯƠNG của
 * học sinh đang chọn, (3) học sinh đang chọn so với TRUNG BÌNH CẢ LỚP theo
 * từng chương. Khi chưa chọn học sinh nào (mở trang lần đầu), cả 3 cột mặc
 * định hiện tổng quan cả lớp — cột (2) hiện biểu đồ cả lớp, cột (3) vẫn dùng
 * đúng 1 component so sánh nhưng chỉ có 1 cột dữ liệu (lớp) vì chưa có học
 * sinh nào để so.
 *
 * Biểu đồ (2) mặc định theo CHƯƠNG (topic_id) — xem lý do lịch sử ở
 * `src/lib/chapterStats.ts`. Toggle "Theo Bài" (migration_016) cho xem
 * breakdown chi tiết hơn theo 1 chương đang chọn (lessonStats.ts).
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
/** Nhãn trục chữ 1 dòng, cắt bằng "…" (Recharts mặc định tự xuống dòng làm nhãn chồng nhau). */
function AxisLabel({ x, y, payload, fill, maxChars }: { x?: number; y?: number; payload?: { value: string }; fill: string; maxChars: number }) {
  const full = String(payload?.value ?? "");
  const text = full.length > maxChars ? `${full.slice(0, maxChars - 1).trimEnd()}…` : full;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={fill} fontSize={12}>
      <title>{full}</title>
      {text}
    </text>
  );
}

function useNarrow(query = "(max-width: 640px)") {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

export function TeacherDashboard() {
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [chapterStatsByStudent, setChapterStatsByStudent] = useState<Map<string, ChapterStat[]>>(
    new Map(),
  );
  const [lessonStatsByStudent, setLessonStatsByStudent] = useState<Map<string, LessonStat[]>>(
    new Map(),
  );
  // Giai đoạn 2 gốc (31/08/2026), mục "cả lớp": chương nào có nhiều học sinh
  // đang lặp lại lỗi sai qua nhiều đề gần đây — xem summarizeClassRecurringGroups
  // (diagnosis.ts) + getStudentTopicTrend (api.ts). Tải 1 lần cho mọi học
  // sinh giống chapterStatsByStudent ở trên, lọc theo lớp bằng useMemo bên dưới.
  const [topicTrendByStudent, setTopicTrendByStudent] = useState<Map<string, TopicTrendGroup[]>>(
    new Map(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt] = useState(() => new Date());
  const [reviewSessionsThisWeek, setReviewSessionsThisWeek] = useState<number | null>(null);
  // Tiến độ xử lý câu sai của TOÀN BỘ học sinh (14/09/2026) — 2 truy vấn duy
  // nhất cho cả lớp, KHÔNG lặp theo từng học sinh như các map bên trên (xem
  // api.listActiveJournalProgressByStudent). Học sinh không có dòng nào thì
  // không nằm trong map -> nơi dùng rơi về EMPTY_JOURNAL_SUMMARY.
  const [journalByStudent, setJournalByStudent] = useState<Map<string, JournalSummary>>(new Map());
  const [lastReviewByStudent, setLastReviewByStudent] = useState<Map<string, string>>(new Map());
  // Bộ lọc theo LỚP (Nhóm 1, "quản lý lớp học", 28/08/2026) — trước đây trang
  // này gộp chung TẤT CẢ học sinh của mọi lớp thực tế vào 1 "cả lớp" vô nghĩa
  // (Thầy Tường có 4 lớp <5 HS mỗi lớp, tiến độ khác nhau hẳn nhau). null =
  // xem tất cả (giữ hành vi cũ làm lựa chọn rõ ràng, không ngầm định).
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  // Chuyển đổi cột/radar cho card "Năng lực theo chương" (nâng cấp giao diện
  // dashboard, demo đã duyệt) — mặc định vẫn "cot" (giữ nguyên hành vi cũ),
  // radar là lựa chọn THÊM để nhìn nhiều chương cùng lúc gọn hơn khi chương
  // nhiều (bar chart ngang khi đó phải cuộn dọc dài).
  const [chapterView, setChapterView] = useState<"cot" | "radar" | "bai">("cot");
  // Chương đang xem breakdown theo Bài (chỉ dùng khi chapterView === "bai") —
  // null = chưa chọn, mặc định rơi về chương đầu tiên có dữ liệu (xem
  // drilldownTopicId bên dưới) để không hiện màn hình trống ngay khi bấm.
  const [drilldownTopicId, setDrilldownTopicId] = useState<string | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const theme = useDocumentTheme();
  const narrow = useNarrow();

  useEffect(() => {
    (async () => {
      const [students] = await Promise.all([
        api.listStudents(),
        api.listClasses().then(setClasses),
      ]);
      const sevenDaysAgo = new Date(loadedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [summaryResults, chapterResults, lessonResults, topicTrendResults] = await Promise.all([
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
        Promise.all(students.map((s) => api.getStudentLessonStats(s.id))),
        Promise.all(students.map((s) => api.getStudentTopicTrend(s.id))),
      ]);
      setSummaries(summaryResults);
      const map = new Map<string, ChapterStat[]>();
      students.forEach((s, i) => map.set(s.id, chapterResults[i]));
      setChapterStatsByStudent(map);
      const lessonMap = new Map<string, LessonStat[]>();
      students.forEach((s, i) => lessonMap.set(s.id, lessonResults[i]));
      setLessonStatsByStudent(lessonMap);
      const topicTrendMap = new Map<string, TopicTrendGroup[]>();
      students.forEach((s, i) => topicTrendMap.set(s.id, topicTrendResults[i]));
      setTopicTrendByStudent(topicTrendMap);
      api
        .getReviewSessionCountSince(sevenDaysAgo)
        .then(setReviewSessionsThisWeek)
        .catch((err) => console.error("Không lấy được số buổi ôn tập:", err));
      Promise.all([
        api.listActiveJournalProgressByStudent(),
        api.listLastReviewSessionByStudent(),
      ])
        .then(([journalMap, lastReviewMap]) => {
          setJournalByStudent(journalMap);
          setLastReviewByStudent(lastReviewMap);
        })
        .catch((err) => console.error("Không lấy được tiến độ ôn câu sai:", err));
      setLoading(false);
    })();
  }, [loadedAt]);

  // Lọc học sinh theo lớp đang chọn — ảnh hưởng TOÀN BỘ số liệu bên dưới
  // (danh sách, điểm TB, biểu đồ chương) thay vì chỉ lọc mỗi danh sách hiển
  // thị, đúng nỗi đau Thầy Tường nêu ("điểm trung bình của tất cả sẽ vô nghĩa").
  const filteredSummaries = useMemo(
    () =>
      selectedClassId === null
        ? summaries
        : summaries.filter((s) => s.profile.class_id === selectedClassId),
    [summaries, selectedClassId],
  );
  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;

  const classStats = useMemo(
    () =>
      mergeChapterStats(
        filteredSummaries.map((s) => chapterStatsByStudent.get(s.profile.id) ?? []),
      ),
    [filteredSummaries, chapterStatsByStudent],
  );
  const selectedStats = selectedId ? chapterStatsByStudent.get(selectedId) ?? [] : null;
  const selectedSummary = filteredSummaries.find((s) => s.profile.id === selectedId) ?? null;

  const chapterChartData = useMemo(() => {
    const stats = selectedStats ?? classStats;
    return stats
      .filter((s) => s.maxScore > 0)
      .map((s) => ({ topic_id: s.topic_id, topic_name: s.topic_name, accuracy: accuracyPercent(s) ?? 0 }));
  }, [selectedStats, classStats]);

  // Bài (Chương -> Bài, migration_016) — cùng cách tính với classStats/selectedStats
  // ở trên nhưng theo Bài, dùng cho toggle "Theo Bài" (drilldown 1 chương).
  const classLessonStats = useMemo(
    () =>
      mergeLessonStats(
        filteredSummaries.map((s) => lessonStatsByStudent.get(s.profile.id) ?? []),
      ),
    [filteredSummaries, lessonStatsByStudent],
  );
  const selectedLessonStats = selectedId ? lessonStatsByStudent.get(selectedId) ?? [] : null;
  // Chương đang xem breakdown theo Bài — mặc định chương đầu tiên có dữ liệu
  // nếu giáo viên chưa tự chọn (hoặc đã chọn 1 chương giờ không còn dữ liệu).
  const activeDrilldownTopicId =
    (drilldownTopicId && chapterChartData.some((c) => c.topic_id === drilldownTopicId)
      ? drilldownTopicId
      : chapterChartData[0]?.topic_id) ?? null;
  const lessonChartData = useMemo(() => {
    if (!activeDrilldownTopicId) return [];
    const stats = selectedLessonStats ?? classLessonStats;
    return stats
      .filter((s) => s.topic_id === activeDrilldownTopicId && s.maxScore > 0)
      .map((s) => ({ lesson_name: s.lesson_name, accuracy: lessonAccuracyPercent(s) ?? 0 }));
  }, [selectedLessonStats, classLessonStats, activeDrilldownTopicId]);


  // Độ chính xác trung bình các chương của LỚP đang lọc (ô thống kê đầu trang,
  // không đổi theo học sinh đang chọn).
  const classChapterAverage = useMemo(() => {
    const rows = classStats.filter((s) => s.maxScore > 0).map((s) => accuracyPercent(s) ?? 0);
    return rows.length > 0 ? Math.round(rows.reduce((a, b) => a + b, 0) / rows.length) : null;
  }, [classStats]);

  const comparisonData = useMemo(
    () => buildComparisonRows(classStats, selectedStats),
    [classStats, selectedStats],
  );

  // Giai đoạn 2 gốc, mục "cả lớp" — tôn trọng đúng bộ lọc lớp (selectedClassId)
  // giống classStats ở trên, KHÔNG phụ thuộc selectedId (học sinh đang chọn)
  // vì đây là tổng quan cả lớp, không phải của riêng 1 học sinh.
  const classRecurringTopics = useMemo(
    () =>
      summarizeClassRecurringGroups(
        filteredSummaries.map((s): RecurringGroupInput[] =>
          (topicTrendByStudent.get(s.profile.id) ?? []).map((t) => ({
            id: t.topic_id,
            name: t.topic_name,
            trend: t.trend,
          })),
        ),
      ),
    [filteredSummaries, topicTrendByStudent],
  );

  const totalAttempts = filteredSummaries.reduce((sum, s) => sum + s.attemptCount, 0);
  const classAverageScore = useMemo(() => {
    const scored = filteredSummaries.filter((s) => s.averageScore !== null);
    if (scored.length === 0) return null;
    return scored.reduce((sum, s) => sum + s.averageScore!, 0) / scored.length;
  }, [filteredSummaries]);

  function selectClassFilter(classId: string | null) {
    setSelectedClassId(classId);
    setSelectedId(null); // tránh học sinh đang chọn thuộc lớp khác lớp vừa lọc
  }

  // Bảng "Xử lý câu sai" — ghép summary + mốc ôn gần nhất cho từng học sinh
  // của LỚP ĐANG CHỌN, xếp cần-chú-ý lên trước (gấp -> nhắc -> ổn -> sạch),
  // trong cùng mức thì nhiều câu tồn đọng hơn lên trước.
  const journalRows = useMemo(() => {
    const now = new Date();
    return filteredSummaries
      .map((s) => {
        const summary = journalByStudent.get(s.profile.id) ?? EMPTY_JOURNAL_SUMMARY;
        const lastReviewAt = lastReviewByStudent.get(s.profile.id) ?? null;
        const nudge: NudgeState = computeNudge({ summary, lastReviewAt, now });
        return { profile: s.profile, summary, nudge };
      })
      .sort((a, b) => {
        const order = NUDGE_SORT_ORDER[a.nudge.level] - NUDGE_SORT_ORDER[b.nudge.level];
        if (order !== 0) return order;
        if (b.summary.total !== a.summary.total) return b.summary.total - a.summary.total;
        return a.profile.full_name.localeCompare(b.profile.full_name, "vi");
      });
  }, [filteredSummaries, journalByStudent, lastReviewByStudent]);

  // Tổng của lớp đang chọn — cộng từ chính journalRows để con số ở dải thống
  // kê đầu trang không bao giờ lệch với bảng bên dưới.
  const journalClassTotals = useMemo(() => {
    const byStage: [number, number, number] = [0, 0, 0];
    let total = 0;
    let needAttention = 0;
    for (const row of journalRows) {
      total += row.summary.total;
      for (let i = 0; i < 3; i++) byStage[i] += row.summary.byStage[i];
      if (row.nudge.level === "gap" || row.nudge.level === "nhac") needAttention += 1;
    }
    return { total, byStage, needAttention };
  }, [journalRows]);

  if (loading) return <div className="page-loading">Đang tải...</div>;

  const scope = selectedClass ? selectedClass.name : "Tất cả lớp";
  const q = studentQuery.trim().toLowerCase();
  const listedStudents = q
    ? filteredSummaries.filter((s) => s.profile.full_name.toLowerCase().includes(q))
    : filteredSummaries;
  const chart = {
    student: theme === "dark" ? "#e2545e" : "#9c1420",
    cls: theme === "dark" ? "#5b8c7f" : "#3e6259",
    grid: theme === "dark" ? "#3a332a" : "#e8ddc9",
    tick: theme === "dark" ? "#c9bfb2" : "#5e6b76",
  };
  const tickStyle = { fill: chart.tick, fontSize: 12 };
  const axisWidth = narrow ? 118 : 230;
  const axisChars = narrow ? 16 : 34;
  const chapterRows = selectedSummary
    ? comparisonData.map((r) => ({ ...r, studentAccuracy: r.studentAccuracy ?? 0 }))
    : chapterChartData.map((c) => ({ topic_id: c.topic_id, topic_name: c.topic_name, classAccuracy: c.accuracy }));
  const chartHeight = (rows: number, perRow: number) => Math.max(240, rows * perRow + 40);

  return (
    <div className="teacher-page tdash">
      <header className="tdash-head">
        <div>
          <span className="tdash-eyebrow">Tổng quan</span>
          <h1 className="tdash-title">{scope}</h1>
          <p className="tdash-sub">
            {filteredSummaries.length} học sinh · cập nhật lúc{" "}
            {loadedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}, {loadedAt.toLocaleDateString("vi-VN")}
          </p>
        </div>
        <div className="tdash-head-actions">
          {classes.length > 0 && (
            <label className="tdash-select">
              <span>Lớp</span>
              <select value={selectedClassId ?? ""} onChange={(e) => selectClassFilter(e.target.value || null)}>
                <option value="">Tất cả ({summaries.length} HS)</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({summaries.filter((s) => s.profile.class_id === c.id).length} HS)
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link className="btn-secondary" to="/giao-vien/lop-hoc">
            Quản lý lớp
          </Link>
        </div>
      </header>

      <div className="tdash-kpis">
        <div className="tdash-kpi">
          <span className="tdash-kpi-label">Học sinh</span>
          <b className="tdash-kpi-value">{filteredSummaries.length}</b>
          <span className="tdash-kpi-sub">{totalAttempts} lượt làm bài</span>
        </div>
        <div className="tdash-kpi">
          <span className="tdash-kpi-label">Điểm trung bình</span>
          <b className="tdash-kpi-value">{classAverageScore === null ? "—" : classAverageScore.toFixed(2)}</b>
          <span className="tdash-kpi-sub">thang 10, mọi lượt đã chấm</span>
        </div>
        <div className="tdash-kpi">
          <span className="tdash-kpi-label">Độ chính xác theo chương</span>
          <b className="tdash-kpi-value">
            {classChapterAverage ?? "—"}
            {classChapterAverage !== null && <small>%</small>}
          </b>
          <span className="tdash-kpi-sub">trung bình {classStats.filter((c) => c.maxScore > 0).length} chương có dữ liệu</span>
        </div>
        <div className="tdash-kpi">
          <span className="tdash-kpi-label">Buổi ôn tập 7 ngày</span>
          <b className="tdash-kpi-value">{reviewSessionsThisWeek === null ? "—" : reviewSessionsThisWeek}</b>
          <span className="tdash-kpi-sub">tất cả học sinh</span>
        </div>
        <div className={`tdash-kpi${journalClassTotals.needAttention > 0 ? " tdash-kpi--warn" : ""}`}>
          <span className="tdash-kpi-label">Câu sai chưa ôn xong</span>
          <b className="tdash-kpi-value">{journalClassTotals.total}</b>
          <span className="tdash-kpi-sub">
            {journalClassTotals.needAttention > 0 ? `${journalClassTotals.needAttention} HS cần nhắc` : "không ai cần nhắc"}
          </span>
        </div>
      </div>

      <div className="tdash-grid">
        <section className="tdash-card tdash-students" aria-labelledby="tdash-students-title">
          <div className="tdash-card-head">
            <h2 className="tdash-card-title" id="tdash-students-title">
              Học sinh
            </h2>
            <span className="tdash-card-meta">Bấm để xem biểu đồ</span>
          </div>
          {filteredSummaries.length > 6 && (
            <input
              className="tdash-search"
              type="search"
              placeholder="Tìm học sinh…"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              aria-label="Tìm học sinh"
            />
          )}
          {filteredSummaries.length === 0 ? (
            <p className="empty-hint">
              {summaries.length === 0
                ? "Chưa có học sinh nào đăng ký. Gửi link website cho học sinh để họ đăng nhập bằng email."
                : "Lớp này chưa có học sinh nào. Vào \"Quản lý lớp\" để thêm."}
            </p>
          ) : (
            <ul className="tdash-student-list">
              {listedStudents.map((s) => {
                const palette = AVATAR_PALETTE[filteredSummaries.indexOf(s) % AVATAR_PALETTE.length];
                const { tier } = resolveTier(s.profile.manual_tier, s.averageScore);
                const active = selectedId === s.profile.id;
                return (
                  <li key={s.profile.id} className={`tdash-student${active ? " is-active" : ""}`}>
                    <button
                      type="button"
                      className="tdash-student-pick"
                      aria-pressed={active}
                      onClick={() => setSelectedId(active ? null : s.profile.id)}
                    >
                      <span className="student-avatar" style={{ background: palette.bg, color: palette.text }}>
                        {initialsOf(s.profile.full_name)}
                      </span>
                      <span className="tdash-student-text">
                        <b>{s.profile.full_name}</b>
                        <small>
                          {s.attemptCount} lượt · TB {s.averageScore?.toFixed(2) ?? "—"}
                        </small>
                      </span>
                      {tier && <span className={`tier-badge ${TIER_BADGE_CLASS[tier]}`}>{TIER_LABELS[tier]}</span>}
                    </button>
                    <Link
                      className="tdash-student-open"
                      to={`/giao-vien/hoc-sinh/${s.profile.id}`}
                      aria-label={`Mở hồ sơ ${s.profile.full_name}`}
                      title="Mở hồ sơ học sinh"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 3.5 10.5 8 6 12.5" />
                      </svg>
                    </Link>
                  </li>
                );
              })}
              {listedStudents.length === 0 && <li className="empty-hint">Không có học sinh nào khớp “{studentQuery}”.</li>}
            </ul>
          )}
        </section>

        <section className="tdash-card tdash-chart" aria-labelledby="tdash-chart-title">
          <div className="tdash-card-head">
            <div>
              <h2 className="tdash-card-title" id="tdash-chart-title">
                Năng lực theo chương
              </h2>
              <span className="tdash-card-meta">
                {selectedSummary ? (
                  <>
                    <b>{selectedSummary.profile.full_name}</b> so với {selectedClass ? selectedClass.name : "cả lớp"}
                    <button type="button" className="tdash-clear" onClick={() => setSelectedId(null)}>
                      Bỏ chọn
                    </button>
                  </>
                ) : (
                  `Trung bình ${scope.toLowerCase() === "tất cả lớp" ? "tất cả học sinh" : scope}`
                )}
              </span>
            </div>
            {chapterChartData.length > 0 && (
              <div className="tdash-seg" role="tablist" aria-label="Kiểu biểu đồ">
                {(
                  [
                    ["cot", "Theo chương"],
                    ["radar", "Radar"],
                    ["bai", "Theo bài"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={chapterView === key}
                    className={chapterView === key ? "is-active" : ""}
                    onClick={() => setChapterView(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {chapterView === "bai" && chapterChartData.length > 0 && (
            <label className="tdash-select tdash-select--inline">
              <span>Chương</span>
              <select value={activeDrilldownTopicId ?? ""} onChange={(e) => setDrilldownTopicId(e.target.value || null)}>
                {chapterChartData.map((c) => (
                  <option key={c.topic_id} value={c.topic_id}>
                    {c.topic_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {chapterChartData.length === 0 ? (
            <p className="empty-hint">
              Chưa có dữ liệu chương. Cần học sinh làm ít nhất 1 đề có câu đã gán chương.
            </p>
          ) : chapterView === "bai" ? (
            lessonChartData.length === 0 ? (
              <p className="empty-hint">Chương này chưa có câu nào gán Bài. Gán Bài khi nhập đề để xem chi tiết.</p>
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight(lessonChartData.length, 36)}>
                <BarChart data={lessonChartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={tickStyle} stroke={chart.grid} />
                  <YAxis type="category" dataKey="lesson_name" width={axisWidth} tick={<AxisLabel fill={chart.tick} maxChars={axisChars} />} stroke={chart.grid} interval={0} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                  <Bar dataKey="accuracy" name={selectedSummary ? selectedSummary.profile.full_name : "Cả lớp"} fill={selectedSummary ? chart.student : chart.cls} radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : chapterView === "radar" ? (
            <ResponsiveContainer width="100%" height={360}>
              <RadarChart data={chapterRows} outerRadius="70%">
                <PolarGrid stroke={chart.grid} />
                <PolarAngleAxis dataKey="topic_name" tick={tickStyle} tickFormatter={(name: string) => truncateChapterLabel(name, 16)} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ ...tickStyle, fontSize: 10 }} stroke={chart.grid} />
                <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                <Radar dataKey="classAccuracy" name="Cả lớp" stroke={chart.cls} fill={chart.cls} fillOpacity={selectedSummary ? 0.12 : 0.28} />
                {selectedSummary && (
                  <Radar dataKey="studentAccuracy" name={selectedSummary.profile.full_name} stroke={chart.student} fill={chart.student} fillOpacity={0.22} />
                )}
                {selectedSummary && <Legend />}
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight(chapterRows.length, selectedSummary ? 46 : 36)}>
              <BarChart data={chapterRows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barGap={2}>
                <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={tickStyle} stroke={chart.grid} />
                <YAxis type="category" dataKey="topic_name" width={axisWidth} tick={<AxisLabel fill={chart.tick} maxChars={axisChars} />} stroke={chart.grid} interval={0} />
                <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                {selectedSummary && (
                  <Bar dataKey="studentAccuracy" name={selectedSummary.profile.full_name} fill={chart.student} radius={[0, 4, 4, 0]} barSize={14} />
                )}
                <Bar dataKey="classAccuracy" name={selectedClass ? selectedClass.name : "Cả lớp"} fill={chart.cls} radius={[0, 4, 4, 0]} barSize={selectedSummary ? 14 : 18} />
                {selectedSummary && <Legend wrapperStyle={{ fontSize: 13 }} />}
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {/* Theo dõi xử lý câu sai (14/09/2026). Cột Lần 1/2/3 là số câu đang ở
          từng chặng Leitner (streak 0/1/2) — xem src/lib/journalProgress.ts. */}
      <section className="tdash-card" aria-labelledby="tdash-journal-title">
        <div className="tdash-card-head">
          <div>
            <h2 className="tdash-card-title" id="tdash-journal-title">
              Xử lý câu sai · {scope}
            </h2>
            <span className="tdash-card-meta">
              Mỗi câu phải làm đúng ở 3 buổi ôn riêng biệt liên tiếp mới được rút khỏi nhật ký.
            </span>
          </div>
          <div className="journal-legend">
            {([1, 2, 3] as JournalStage[]).map((st) => (
              <span key={st} className={`journal-legend-item journal-legend-item--${st}`} title={JOURNAL_STAGE_HINTS[st]}>
                {JOURNAL_STAGE_LABELS[st]}: {journalClassTotals.byStage[st - 1]}
              </span>
            ))}
          </div>
        </div>

        {journalRows.length === 0 ? (
          <p className="empty-hint">Chưa có học sinh nào trong lựa chọn hiện tại.</p>
        ) : (
          <div className="journal-table-wrap">
            <table className="history-table journal-table">
              <thead>
                <tr>
                  <th>Học sinh</th>
                  <th>Trạng thái</th>
                  <th className="journal-num">Còn lại</th>
                  <th className="journal-num" title={JOURNAL_STAGE_HINTS[1]}>Lần 1</th>
                  <th className="journal-num" title={JOURNAL_STAGE_HINTS[2]}>Lần 2</th>
                  <th className="journal-num" title={JOURNAL_STAGE_HINTS[3]}>Lần 3</th>
                  <th className="journal-num">Ôn gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {journalRows.map((row) => (
                  <tr key={row.profile.id} className={`journal-row journal-row--${row.nudge.level}`}>
                    <td>
                      <Link className="tdash-name-link" to={`/giao-vien/hoc-sinh/${row.profile.id}`}>
                        {row.profile.full_name}
                      </Link>
                    </td>
                    <td>
                      <span className={`journal-badge journal-badge--${row.nudge.level}`}>
                        {row.nudge.level === "gap"
                          ? "Cần nhắc gấp"
                          : row.nudge.level === "nhac"
                            ? "Nên nhắc"
                            : row.nudge.level === "ok"
                              ? "Đang ôn đều"
                              : "Sạch nhật ký"}
                      </span>
                    </td>
                    <td className="journal-num">
                      <strong>{row.summary.total}</strong>
                    </td>
                    {([1, 2, 3] as JournalStage[]).map((st) => (
                      <td key={st} className="journal-num">
                        <span className={`journal-cell journal-cell--${st}${row.summary.byStage[st - 1] === 0 ? " journal-cell--zero" : ""}`}>
                          {row.summary.byStage[st - 1]}
                        </span>
                      </td>
                    ))}
                    <td className="journal-num">
                      {row.nudge.daysSinceReview === null
                        ? "Chưa ôn"
                        : row.nudge.daysSinceReview === 0
                          ? "Hôm nay"
                          : `${row.nudge.daysSinceReview} ngày trước`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tdash-card" aria-labelledby="tdash-recurring-title">
        <div className="tdash-card-head">
          <div>
            <h2 className="tdash-card-title" id="tdash-recurring-title">
              Chương yếu lặp lại nhiều đề · {scope}
            </h2>
            <span className="tdash-card-meta">
              % học sinh có 2 lần làm gần nhất đều ở mức "Có lỗ hổng" hoặc "Mất gốc" ở chương đó. Chương nào cao nên ôn lại cho cả lớp.
            </span>
          </div>
        </div>
        {classRecurringTopics.length === 0 ? (
          <p className="empty-hint">Chưa có chương nào lặp lại lỗi ở nhiều học sinh.</p>
        ) : (
          <ul className="tdash-recurring">
            {classRecurringTopics.map((t) => (
              <li key={t.id}>
                <span className="tdash-recurring-name">{t.name}</span>
                <span className="tdash-recurring-bar" aria-hidden="true">
                  <i style={{ width: `${t.recurringPercent}%`, background: MASTERY_COLOR.mat_goc }} />
                </span>
                <span className="tdash-recurring-num">
                  <b>{t.recurringPercent}%</b> · {t.recurringCount}/{t.studentCount} HS
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
