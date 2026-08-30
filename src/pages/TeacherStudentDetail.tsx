import { Fragment, useEffect, useMemo, useState } from "react";
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
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";
import * as api from "../lib/api";
import type { AttemptReviewItem } from "../lib/api";
import { generateReportSummary } from "../lib/ai";
import { accuracyPercent, truncateChapterLabel } from "../lib/chapterStats";
import { QuestionReview } from "../components/QuestionReview";
import { BLANK_REASON_LABELS, type BlankQuestionSummary } from "../lib/diagnosis";
import { completionMinutes, formatMinutes, formatScoreDelta, formatTimeDelta } from "../lib/format";
import { resolveTier, TIER_LABELS } from "../lib/studentTier";
import {
  GENDER_LABELS,
  type AttemptScoreRow,
  type ClassRow,
  type ExamAttemptRow,
  type ExamRow,
  type Profile,
  type ProctoringEventRow,
} from "../lib/types";

const TIER_BADGE_CLASS: Record<string, string> = {
  gioi: "tier-badge--gioi",
  kha: "tier-badge--kha",
  tb: "tier-badge--tb",
  yeu: "tier-badge--yeu",
};

const PROCTORING_EVENT_LABELS: Record<ProctoringEventRow["event_type"], string> = {
  tab_hidden: "Rời tab/cửa sổ làm bài",
  tab_visible: "Quay lại tab làm bài",
  window_blur: "Cửa sổ mất tiêu điểm",
  window_focus: "Cửa sổ lấy lại tiêu điểm",
  fullscreen_exit: "Thoát toàn màn hình",
  copy_attempt: "Cố sao chép đề (đã chặn)",
  paste_attempt: "Cố dán nội dung (đã chặn)",
};

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
  const [classesById, setClassesById] = useState<Map<string, ClassRow>>(new Map());
  const [attempts, setAttempts] = useState<
    (ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]
  >([]);
  // ĐỔI 24/08/2026 (audit "check full"): trước đây gọi api.getStudentTopicStats
  // (gộp theo "dạng bài" question_type_id) — nhưng field đó chưa được giáo
  // viên gán cho câu hỏi nào nên biểu đồ này luôn hiện "Chưa có dữ liệu" một
  // cách âm thầm, không ai để ý vì không có lỗi nào hiện ra. Đổi sang
  // getStudentChapterStats (gộp theo CHƯƠNG/topic_id, đã có dữ liệu thật) —
  // đúng hướng TeacherDashboard.tsx đã áp dụng trước đó cho lý do y hệt.
  const [chapterStats, setChapterStats] = useState<
    { chapter_name: string; accuracyPercent: number }[]
  >([]);
  // Cột/Radar toggle cho biểu đồ năng lực theo chương — cùng cơ chế với
  // TeacherDashboard.tsx (nâng cấp giao diện dashboard, đợt demo đã duyệt).
  const [chapterView, setChapterView] = useState<"cot" | "radar">("cot");
  const [proctoringCounts, setProctoringCounts] = useState<Record<string, number>>({});
  const [blankCounts, setBlankCounts] = useState<Record<string, BlankQuestionSummary>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reportLink, setReportLink] = useState<string | null>(null);
  const [openViolationsFor, setOpenViolationsFor] = useState<string | null>(null);
  const [violationEvents, setViolationEvents] = useState<Record<string, ProctoringEventRow[]>>({});
  const [loadingViolations, setLoadingViolations] = useState(false);
  // "Xem câu sai" / "Xem cả bài" từng lượt làm (mục 3, Đợt 2; mở rộng thêm
  // "Xem cả bài" theo yêu cầu Thầy Tường sau khi thử Đợt 5 — tái dùng
  // getAttemptReview đã có sẵn cho ResultPage.tsx: gọi 1 lần, lọc lại còn câu
  // chưa đạt trọn điểm cho chế độ "câu sai", giữ nguyên toàn bộ cho chế độ
  // "cả bài". Cache theo `${attemptId}:${mode}` để đổi qua lại giữa 2 chế độ
  // không phải gọi lại API nếu đã xem qua rồi. Chỉ mở 1 khung xem lại tại 1
  // thời điểm cho mỗi lượt làm — tránh 2 khối dài chồng nhau gây rối mắt.
  type ReviewMode = "wrong" | "full";
  const [openReviewFor, setOpenReviewFor] = useState<{ attemptId: string; mode: ReviewMode } | null>(
    null,
  );
  const [reviewItems, setReviewItems] = useState<Record<string, AttemptReviewItem[]>>({});
  const [loadingReview, setLoadingReview] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const [attemptsData, stats] = await Promise.all([
        api.listStudentAttempts(studentId),
        api.getStudentChapterStats(studentId),
      ]);
      const scoredAttempts = attemptsData.filter((a) => a.score);
      setAttempts(scoredAttempts);
      setChapterStats(
        stats.map((s) => ({
          chapter_name: s.topic_name,
          accuracyPercent: accuracyPercent(s) ?? 0,
        })),
      );
      const studentProfile = await api.getProfile(studentId);
      setProfile(studentProfile);
      api
        .listClasses()
        .then((classes) => setClassesById(new Map(classes.map((c) => [c.id, c]))))
        .catch((err) => console.error("Không lấy được danh sách lớp:", err));
      api
        .getProctoringCounts(scoredAttempts.map((a) => a.id))
        .then(setProctoringCounts)
        .catch((err) => console.error("Không lấy được dữ liệu giám sát:", err));
      api
        .getBlankQuestionCounts(scoredAttempts.map((a) => a.id))
        .then(setBlankCounts)
        .catch((err) => console.error("Không lấy được dữ liệu câu bỏ trống:", err));
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
        chapterStats,
      });

      const report = await api.createReport({
        student_id: studentId,
        period_start: attempts.length
          ? attempts[attempts.length - 1].started_at.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        period_end: new Date().toISOString().slice(0, 10),
        summary_text: summary,
        chart_data: { chapterStats },
      });

      setReportLink(`${window.location.origin}${import.meta.env.BASE_URL}bao-cao/${report.share_token}`);
    } finally {
      setGenerating(false);
    }
  }

  async function toggleViolations(attemptId: string) {
    if (openViolationsFor === attemptId) {
      setOpenViolationsFor(null);
      return;
    }
    setOpenViolationsFor(attemptId);
    if (!violationEvents[attemptId]) {
      setLoadingViolations(true);
      try {
        const events = await api.getProctoringEvents(attemptId);
        setViolationEvents((prev) => ({ ...prev, [attemptId]: events }));
      } finally {
        setLoadingViolations(false);
      }
    }
  }

  async function toggleReview(attemptId: string, examId: string, mode: ReviewMode) {
    if (openReviewFor?.attemptId === attemptId && openReviewFor.mode === mode) {
      setOpenReviewFor(null);
      return;
    }
    setOpenReviewFor({ attemptId, mode });
    const cacheKey = `${attemptId}:${mode}`;
    if (!reviewItems[cacheKey]) {
      setLoadingReview(true);
      try {
        const review = await api.getAttemptReview(attemptId, examId);
        const items = mode === "wrong" ? review.filter((r) => r.score < r.maxScore - 0.005) : review;
        setReviewItems((prev) => ({ ...prev, [cacheKey]: items }));
      } finally {
        setLoadingReview(false);
      }
    }
  }

  // Hủy/bỏ hủy 1 lượt làm THỦ CÔNG — dùng chung cột `invalidated` với cơ chế
  // tự động huỷ khi HS rời màn hình quá nhiều lần ở chế độ nghiêm túc, nên
  // badge "Đã huỷ" hiển thị đúng ngay mà không cần đổi gì thêm ở đây. KHÔNG
  // xoá dữ liệu — lượt làm vẫn xem lại được, chỉ đánh dấu không hợp lệ.
  async function toggleInvalidated(attemptId: string, currentlyInvalidated: boolean) {
    const next = !currentlyInvalidated;
    const confirmMsg = next
      ? "Đánh dấu lượt làm bài này là KHÔNG HỢP LỆ (đã huỷ)? Dữ liệu vẫn được giữ để xem lại, chỉ không còn tính là kết quả hợp lệ."
      : "Bỏ đánh dấu huỷ cho lượt làm bài này, tính lại là kết quả hợp lệ?";
    if (!confirm(confirmMsg)) return;
    await api.setAttemptInvalidated(attemptId, next);
    setAttempts((prev) =>
      prev.map((a) => (a.id === attemptId ? { ...a, invalidated: next } : a)),
    );
  }

  // Xoá HẲN 1 kết quả thi (khác "Hủy lượt này" ở trên — cái đó chỉ đánh dấu
  // không hợp lệ, vẫn giữ dữ liệu). Xoá là VĨNH VIỄN: kéo theo toàn bộ lịch
  // sử của lượt làm đó (đáp án từng câu, thời gian xem câu, giám sát nghiêm
  // túc, điểm số) — không thể khôi phục, nên xác nhận 2 bước (gõ đúng "XOA").
  async function handleDeleteAttempt(attemptId: string, examTitle: string, attemptNumber: number) {
    const confirmed = confirm(
      `Xoá VĨNH VIỄN kết quả "${examTitle}" — lần ${attemptNumber}?\n\n` +
        `Toàn bộ lịch sử của lượt làm này (đáp án từng câu, thời gian làm bài, dữ liệu giám sát) ` +
        `sẽ bị xoá theo, không thể khôi phục. Nếu chỉ muốn tạm ẩn kết quả này (vẫn xem lại được), ` +
        `dùng "Hủy lượt này" thay vì xoá.`,
    );
    if (!confirmed) return;
    await api.deleteAttempt(attemptId);
    setAttempts((prev) => prev.filter((a) => a.id !== attemptId));
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

  // Dải thông tin hồ sơ đọc-only (24/08/2026, migration_011) — "Lớp" giờ tra
  // qua bảng classes (migration_013, 28/08/2026) thay vì cột student_class cũ
  // (đã xoá, chưa từng có giao diện nhập nên không mất dữ liệu thật gì). Chỉ
  // hiện từng dòng khi có dữ liệu.
  const className = profile?.class_id ? classesById.get(profile.class_id)?.name : null;
  const profileFields = profile
    ? [
        className && { label: "Lớp", value: className },
        profile.date_of_birth && {
          label: "Ngày sinh",
          value: new Date(profile.date_of_birth).toLocaleDateString("vi-VN"),
        },
        profile.gender && { label: "Giới tính", value: GENDER_LABELS[profile.gender] },
        profile.phone && { label: "SĐT", value: profile.phone },
        profile.school_name && { label: "Trường", value: profile.school_name },
        profile.province && { label: "Tỉnh/Thành", value: profile.province },
      ].filter((f): f is { label: string; value: string } => Boolean(f))
    : [];

  // Tầng học sinh (Đợt 2, phân tầng) — tự tính theo điểm TB, GV ghi đè tay
  // được qua profile.manual_tier. Chỉ hiện phía GV (đúng trang này).
  const averageScoreForTier =
    attempts.length > 0
      ? attempts.reduce((sum, a) => sum + a.score!.total_score, 0) / attempts.length
      : null;
  const { tier, isOverride } = resolveTier(profile?.manual_tier ?? null, averageScoreForTier);

  return (
    <div className="teacher-page">
      <h2>
        {profile?.full_name}
        {tier && (
          <span className={`tier-badge ${TIER_BADGE_CLASS[tier]}`} style={{ marginLeft: 10, verticalAlign: "middle" }}>
            {TIER_LABELS[tier]}
            {isOverride && <span title="Giáo viên đã ghi đè tay"> ✎</span>}
          </span>
        )}
      </h2>
      {profileFields.length > 0 && (
        <div className="student-profile-strip">
          {profileFields.map((f) => (
            <div key={f.label} className="student-profile-strip-item">
              <span className="student-profile-strip-label">{f.label}</span>
              <span>{f.value}</span>
            </div>
          ))}
        </div>
      )}

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
          lận chắc chắn. Cột "Câu bỏ trống" tách riêng 2 nguyên nhân: "hết giờ" (chưa từng mở câu
          đó ra xem — có thể do phân bổ thời gian) và "bỏ qua" (đã mở ra xem nhưng không làm — có
          thể do chưa nắm kiến thức phần đó).
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
                        <th>Câu bỏ trống</th>
                        <th>Xem lại</th>
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
                        const isOpen = openViolationsFor === a.id;
                        const isWrongOpen = openReviewFor?.attemptId === a.id && openReviewFor.mode === "wrong";
                        const isFullOpen = openReviewFor?.attemptId === a.id && openReviewFor.mode === "full";
                        return (
                          <Fragment key={a.id}>
                          <tr>
                            <td>Lần {a.attempt_number}</td>
                            <td>{new Date(a.started_at).toLocaleDateString("vi-VN")}</td>
                            <td>
                              <strong>{score.toFixed(2)}</strong>
                              {a.invalidated && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Đã huỷ</span>}
                              <button
                                type="button"
                                className="btn-link btn-danger"
                                style={{ display: "block", fontSize: 11, padding: "2px 0" }}
                                onClick={() => toggleInvalidated(a.id, a.invalidated)}
                              >
                                {a.invalidated ? "Bỏ huỷ" : "Hủy lượt này"}
                              </button>
                              <button
                                type="button"
                                className="btn-link btn-danger"
                                style={{ display: "block", fontSize: 11, padding: "2px 0" }}
                                onClick={() => handleDeleteAttempt(a.id, g.examTitle, a.attempt_number)}
                              >
                                Xoá kết quả này
                              </button>
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
                              {(proctoringCounts[a.id] ?? 0) > 0 && (
                                <button
                                  type="button"
                                  className="btn-link"
                                  style={{ display: "block", fontSize: 11, padding: "2px 0" }}
                                  onClick={() => toggleViolations(a.id)}
                                >
                                  {isOpen ? "Ẩn chi tiết" : "Xem chi tiết"}
                                </button>
                              )}
                            </td>
                            <td>
                              {(() => {
                                const b = blankCounts[a.id];
                                if (!b || b.totalBlank === 0) {
                                  return <span className="badge badge-ok">Không có</span>;
                                }
                                return (
                                  <span className="badge badge-warn" title={`${b.timeoutCount} ${BLANK_REASON_LABELS.chua_kip_doc.toLowerCase()}, ${b.skippedCount} ${BLANK_REASON_LABELS.doc_roi_bo_qua.toLowerCase()}`}>
                                    {b.totalBlank} câu ({b.timeoutCount} hết giờ, {b.skippedCount} bỏ qua)
                                  </span>
                                );
                              })()}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-link"
                                style={{ display: "block", fontSize: 11, padding: "2px 0" }}
                                onClick={() => toggleReview(a.id, a.exam_id, "wrong")}
                              >
                                {isWrongOpen ? "Ẩn câu sai" : "Xem câu sai"}
                              </button>
                              <button
                                type="button"
                                className="btn-link"
                                style={{ display: "block", fontSize: 11, padding: "2px 0" }}
                                onClick={() => toggleReview(a.id, a.exam_id, "full")}
                              >
                                {isFullOpen ? "Ẩn cả bài" : "Xem cả bài"}
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={11} className="proctoring-detail-cell">
                                {loadingViolations && !violationEvents[a.id] ? (
                                  <span className="empty-hint">Đang tải...</span>
                                ) : (violationEvents[a.id] ?? []).length === 0 ? (
                                  <span className="empty-hint">Chưa có dấu hiệu nào được ghi nhận.</span>
                                ) : (
                                  <ul className="proctoring-detail-list">
                                    {(violationEvents[a.id] ?? []).map((ev) => (
                                      <li key={ev.id}>
                                        <span className="proctoring-detail-time">
                                          {new Date(ev.created_at).toLocaleString("vi-VN")}
                                        </span>
                                        {PROCTORING_EVENT_LABELS[ev.event_type]}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                          {(isWrongOpen || isFullOpen) && (
                            <tr>
                              <td colSpan={11} className="proctoring-detail-cell">
                                {(() => {
                                  const cacheKey = `${a.id}:${isFullOpen ? "full" : "wrong"}`;
                                  const items = reviewItems[cacheKey];
                                  if (loadingReview && !items) {
                                    return <span className="empty-hint">Đang tải...</span>;
                                  }
                                  if (!items || items.length === 0) {
                                    return (
                                      <span className="empty-hint">
                                        Không có câu nào làm sai — làm đúng trọn điểm cả đề.
                                      </span>
                                    );
                                  }
                                  return (
                                    <div className="wrong-review-list">
                                      {items.map((item, i) => (
                                        <QuestionReview
                                          key={item.question_id}
                                          number={i + 1}
                                          question={item.question}
                                          finalAnswer={item.finalAnswer}
                                          score={item.score}
                                          maxScore={item.maxScore}
                                        />
                                      ))}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          )}
                          </Fragment>
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
        <div className="teacher-chart-header">
          <h3 style={{ marginBottom: 0 }}>Tỉ lệ đúng theo chương</h3>
          {chapterStats.length > 0 && (
            <div className="chart-view-toggle">
              <button
                type="button"
                className={chapterView === "cot" ? "chart-view-toggle--active" : ""}
                onClick={() => setChapterView("cot")}
              >
                Cột
              </button>
              <button
                type="button"
                className={chapterView === "radar" ? "chart-view-toggle--active" : ""}
                onClick={() => setChapterView("radar")}
              >
                Radar
              </button>
            </div>
          )}
        </div>
        {chapterStats.length === 0 ? (
          <p className="empty-hint">Chưa có dữ liệu.</p>
        ) : chapterView === "radar" ? (
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={chapterStats} outerRadius="72%">
              <PolarGrid />
              <PolarAngleAxis
                dataKey="chapter_name"
                tick={{ fontSize: 11 }}
                tickFormatter={(name: string) => truncateChapterLabel(name, 12)}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
              <Radar dataKey="accuracyPercent" stroke="#9c1420" fill="#9c1420" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, chapterStats.length * 40)}>
            <BarChart data={chapterStats} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis
                type="category"
                dataKey="chapter_name"
                width={160}
                tickFormatter={truncateChapterLabel}
              />
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
