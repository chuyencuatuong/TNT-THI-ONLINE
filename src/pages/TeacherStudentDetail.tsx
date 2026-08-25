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
} from "recharts";
import * as api from "../lib/api";
import { generateReportSummary } from "../lib/ai";
import { accuracyPercent } from "../lib/chapterStats";
import { BLANK_REASON_LABELS, type BlankQuestionSummary } from "../lib/diagnosis";
import { completionMinutes, formatMinutes, formatScoreDelta, formatTimeDelta } from "../lib/format";
import {
  GENDER_LABELS,
  type AttemptScoreRow,
  type ExamAttemptRow,
  type ExamRow,
  type Profile,
  type ProctoringEventRow,
} from "../lib/types";

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
  const [proctoringCounts, setProctoringCounts] = useState<Record<string, number>>({});
  const [blankCounts, setBlankCounts] = useState<Record<string, BlankQuestionSummary>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reportLink, setReportLink] = useState<string | null>(null);
  const [openViolationsFor, setOpenViolationsFor] = useState<string | null>(null);
  const [violationEvents, setViolationEvents] = useState<Record<string, ProctoringEventRow[]>>({});
  const [loadingViolations, setLoadingViolations] = useState(false);

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

  // Dải thông tin hồ sơ đọc-only (24/08/2026, migration_011) — gồm cả
  // student_class vốn đã tồn tại trong schema từ trước nhưng CHƯA TỪNG được
  // hiển thị ở đâu trong toàn bộ ứng dụng (đã grep xác nhận lúc audit "check
  // full"); tiện tay hiển thị luôn ở đây cùng các trường hồ sơ mới. Chỉ hiện
  // từng dòng khi có dữ liệu — hồ sơ tạo trước migration này sẽ thiếu phần lớn,
  // không có gì bắt buộc phải điền lại.
  const profileFields = profile
    ? [
        profile.student_class && { label: "Lớp", value: profile.student_class },
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

  return (
    <div className="teacher-page">
      <h2>{profile?.full_name}</h2>
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
                        return (
                          <Fragment key={a.id}>
                          <tr>
                            <td>Lần {a.attempt_number}</td>
                            <td>{new Date(a.started_at).toLocaleDateString("vi-VN")}</td>
                            <td>
                              <strong>{score.toFixed(2)}</strong>
                              {a.invalidated && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Đã huỷ</span>}
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
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={10} className="proctoring-detail-cell">
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
        <h3>Tỉ lệ đúng theo chương</h3>
        {chapterStats.length === 0 ? (
          <p className="empty-hint">Chưa có dữ liệu.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, chapterStats.length * 40)}>
            <BarChart data={chapterStats} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="chapter_name" width={160} />
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
