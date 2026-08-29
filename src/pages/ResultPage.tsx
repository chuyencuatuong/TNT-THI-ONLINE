import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as api from "../lib/api";
import type { AttemptDiagnostics, AttemptReviewItem } from "../lib/api";
import { truncateChapterLabel } from "../lib/chapterStats";
import {
  BLANK_REASON_LABELS,
  blankQuestionAdvice,
  MASTERY_LABELS,
  type MasteryLabel,
} from "../lib/diagnosis";
import { QuestionReview } from "../components/QuestionReview";
import { ResultSlip } from "../components/ResultSlip";
import { useAuth } from "../lib/auth";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow } from "../lib/types";

const PART_LABELS: Record<1 | 2 | 3, string> = {
  1: "Phần 1. Trắc nghiệm 4 phương án",
  2: "Phần 2. Đúng - Sai",
  3: "Phần 3. Trả lời ngắn",
};

// ĐỔI 24/08/2026 (đợt làm mới trang kết quả): trang này trước đây xếp
// TOÀN BỘ các mục (biểu đồ thời gian, biểu đồ theo chương, chẩn đoán, câu bỏ
// trống, xem lại từng câu) chồng liên tục — rất dài và rối, đặc biệt khi đề
// có nhiều câu. Chia thành 3 tab để HS xem theo nhu cầu; MỌI điều kiện hiện/
// ẩn (.length > 0 &&...) giữ NGUYÊN Y HỆT như trước, chỉ dời vào từng tab.
type ResultTab = "tong-quan" | "chan-doan" | "xem-lai";

const TAB_LABELS: Record<ResultTab, string> = {
  "tong-quan": "Tổng quan",
  "chan-doan": "Chẩn đoán",
  "xem-lai": "Xem lại bài làm",
};

const MASTERY_COLOR: Record<MasteryLabel, string> = {
  vung: "#2e7d32",
  chua_chac_chan: "#b8860b",
  co_lo_hong: "#e07b00",
  mat_goc: "#c0392b",
  chua_du_du_lieu: "#6b7280",
};

const MASTERY_NOTE: Record<MasteryLabel, string> = {
  vung: "Làm đúng phần lớn, thời gian và số lần đổi đáp án ở mức hợp lý.",
  chua_chac_chan:
    "Kết quả đúng nhưng mất khá nhiều thời gian hoặc đổi đáp án nhiều lần — có thể chưa thật tự tin, nên luyện thêm để phản xạ nhanh và chắc hơn.",
  co_lo_hong:
    "Đúng khoảng một nửa số câu — có khả năng nắm được ý chính nhưng còn thiếu sót ở một số bước, nên xem lại lý thuyết và làm thêm bài tương tự.",
  mat_goc:
    "Sai phần lớn các câu thuộc dạng này — nên ôn lại kiến thức nền của dạng bài này trước khi luyện tiếp.",
  chua_du_du_lieu:
    "Chưa đủ câu hỏi thuộc dạng này trong lần làm bài để đưa ra nhận định đáng tin cậy.",
};

export function ResultPage() {
  const { profile } = useAuth();
  const { attemptId } = useParams<{ attemptId: string }>();
  const [attempt, setAttempt] = useState<(ExamAttemptRow & { exam: ExamRow }) | null>(null);
  const [score, setScore] = useState<AttemptScoreRow | null>(null);
  const [diagnostics, setDiagnostics] = useState<AttemptDiagnostics | null>(null);
  const [review, setReview] = useState<AttemptReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ResultTab>("tong-quan");
  // Tên lớp cho phiếu kết quả (ResultSlip) — tra qua bảng classes
  // (migration_013, 28/08/2026), thay cột student_class cũ đã xoá.
  const [className, setClassName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.class_id) {
      setClassName(null);
      return;
    }
    api
      .listClasses()
      .then((classes) => setClassName(classes.find((c) => c.id === profile.class_id)?.name ?? null))
      .catch((err) => console.error("Không lấy được tên lớp:", err));
  }, [profile?.class_id]);

  useEffect(() => {
    if (!attemptId) return;
    (async () => {
      const a = await api.getAttempt(attemptId);
      setAttempt(a);
      const [s, d, r] = await Promise.all([
        api.getAttemptScore(attemptId),
        a ? api.getAttemptDiagnostics(attemptId, a.exam_id) : Promise.resolve(null),
        a ? api.getAttemptReview(attemptId, a.exam_id) : Promise.resolve([]),
      ]);
      setScore(s);
      setDiagnostics(d);
      setReview(r);
      setLoading(false);
    })();
  }, [attemptId]);

  if (loading) return <div className="page-loading">Đang tải kết quả...</div>;
  if (!score) return <div className="page-loading">Không tìm thấy kết quả.</div>;

  // perQuestion đã được sắp theo đúng thứ tự Phần 1 -> 2 -> 3 (xem api.getExamQuestions),
  // nên số thứ tự ở đây khớp với số thứ tự học sinh nhìn thấy lúc làm bài.
  const timeChartData = (diagnostics?.perQuestion ?? []).map((q, i) => ({
    name: `Câu ${i + 1}`,
    seconds: q.timeSpentSeconds,
    correct: q.scoreRatio >= 0.999,
  }));

  const topicChartData = (diagnostics?.byTopic ?? [])
    .filter((t) => t.label !== "chua_du_du_lieu")
    .map((t) => ({ name: t.topic_name, accuracyPercent: t.avgScoreRatio * 100 }));

  // Donut "Đúng/Sai/Bỏ trống" (nâng cấp giao diện dashboard, demo đã duyệt) —
  // dùng lại đúng `review` đã tải sẵn cho tab "Xem lại bài làm", không gọi
  // thêm API nào. "Sai" ở đây gộp cả câu đúng 1 phần (Phần 2) vì donut 3 phần
  // không đủ chỗ tách riêng — xem chi tiết đúng/thiếu từng câu ở tab "Xem lại
  // bài làm" (QuestionReview đã phân biệt rõ isPartial). finalAnswer === null
  // là quy ước "bỏ trống" dùng chung toàn app (xem diagnosis.ts).
  const answerBreakdown = review.reduce(
    (acc, item) => {
      const isCorrect = item.maxScore > 0 && item.score >= item.maxScore - 0.005;
      const isBlank = item.finalAnswer === null || item.finalAnswer === undefined;
      if (isCorrect) acc.correct++;
      else if (isBlank) acc.blank++;
      else acc.wrong++;
      return acc;
    },
    { correct: 0, wrong: 0, blank: 0 },
  );
  const answerBreakdownTotal = review.length;
  const donutChartData = [
    { key: "correct", name: "Đúng", value: answerBreakdown.correct, color: "#2e7d32" },
    { key: "wrong", name: "Sai / chưa trọn điểm", value: answerBreakdown.wrong, color: "#c0392b" },
    { key: "blank", name: "Bỏ trống", value: answerBreakdown.blank, color: "#6b7280" },
  ].filter((d) => d.value > 0);

  return (
    <div className="result-page result-page--wide">
      <h2>Kết quả bài làm</h2>
      {attempt?.invalidated && (
        <div className="result-invalidated-banner">
          Bài làm này đã bị tự động huỷ do rời trang quá số lần cho phép ở chế độ thi nghiêm túc.
          Điểm bên dưới chỉ để tham khảo, không được công nhận là kết quả hợp lệ.
        </div>
      )}
      <div className="score-total">{score.total_score.toFixed(2)} / 10</div>

      <div className="result-actions">
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          Tải phiếu kết quả
        </button>
      </div>

      <div className="result-tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as ResultTab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`result-tab ${tab === t ? "result-tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "tong-quan" && (
        <div className="result-tab-panel">
          <div className="score-breakdown">
            <div className="score-row">
              <span>Phần 1 (trắc nghiệm)</span>
              <strong>{score.part1_score.toFixed(2)} điểm</strong>
            </div>
            <div className="score-row">
              <span>Phần 2 (đúng - sai)</span>
              <strong>{score.part2_score.toFixed(2)} điểm</strong>
            </div>
            <div className="score-row">
              <span>Phần 3 (trả lời ngắn)</span>
              <strong>{score.part3_score.toFixed(2)} điểm</strong>
            </div>
          </div>

          {donutChartData.length > 0 && (
            <section className="result-section">
              <h3>Tỉ lệ đúng / sai / bỏ trống</h3>
              <div className="answer-donut-row">
                <div className="answer-donut-wrap">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={donutChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={54}
                        outerRadius={78}
                        paddingAngle={donutChartData.length > 1 ? 2 : 0}
                        strokeWidth={0}
                      >
                        {donutChartData.map((d) => (
                          <Cell key={d.key} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, n: string) => [`${v} câu`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="answer-donut-center">
                    <div className="answer-donut-center-value">{score.total_score.toFixed(2)}</div>
                    <div className="answer-donut-center-label">/ 10 điểm</div>
                  </div>
                </div>
                <div className="answer-donut-legend">
                  {donutChartData.map((d) => (
                    <div className="answer-donut-legend-item" key={d.key}>
                      <span className="answer-donut-legend-dot" style={{ background: d.color }} />
                      {d.name}
                      <strong>
                        {d.value}/{answerBreakdownTotal} câu
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {timeChartData.length > 0 && (
            <section className="result-section">
              <h3>Thời gian làm từng câu</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={timeChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis unit="s" fontSize={11} />
                  <Tooltip formatter={(v: number) => `${v}s`} />
                  <Bar dataKey="seconds" radius={[4, 4, 0, 0]}>
                    {timeChartData.map((d, i) => (
                      <Cell key={i} fill={d.correct ? "#2e7d32" : "#c0392b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="empty-hint">
                Xanh: câu làm đúng · Đỏ: câu làm sai hoặc chưa đúng hoàn toàn.
              </p>
            </section>
          )}

          {topicChartData.length > 0 && (
            <section className="result-section">
              <h3>Độ chính xác theo chương</h3>
              <ResponsiveContainer width="100%" height={Math.max(180, topicChartData.length * 40)}>
                <BarChart data={topicChartData} layout="vertical" margin={{ left: 40, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    fontSize={12}
                    tickFormatter={truncateChapterLabel}
                  />
                  <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                  <Bar dataKey="accuracyPercent" fill="#9c1420" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}
        </div>
      )}

      {tab === "chan-doan" && (
        <div className="result-tab-panel">
          {diagnostics && diagnostics.byTopic.length > 0 && (
            <section className="result-section">
              <h3>Chẩn đoán theo chương</h3>
              <p className="empty-hint">
                Đây là gợi ý dựa trên quy tắc đơn giản (độ chính xác, thời gian, số lần đổi đáp
                án), không phải kết luận chắc chắn — dùng để gợi ý hướng ôn tập.
              </p>
              <div className="diagnosis-list">
                {diagnostics.byTopic.map((t) => (
                  <div key={t.topic_id} className="diagnosis-card">
                    <div className="diagnosis-card-header">
                      <span>{t.topic_name}</span>
                      <span
                        className="diagnosis-badge"
                        style={{ background: MASTERY_COLOR[t.label] }}
                      >
                        {MASTERY_LABELS[t.label]}
                      </span>
                    </div>
                    <p className="diagnosis-note">{MASTERY_NOTE[t.label]}</p>
                    {t.label !== "chua_du_du_lieu" && (
                      <p className="diagnosis-meta">
                        {t.sampleCount} câu · đúng {(t.avgScoreRatio * 100).toFixed(0)}%
                        {t.possiblyRushed && " · làm khá nhanh so với mức thông thường"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {diagnostics && diagnostics.blankQuestions.totalBlank > 0 && (
            <section className="result-section">
              <h3>Câu bỏ trống</h3>
              <p className="empty-hint">{blankQuestionAdvice(diagnostics.blankQuestions)}</p>
              <ul className="blank-question-list">
                {diagnostics.blankQuestions.items.map((item) => {
                  const order =
                    diagnostics.perQuestion.findIndex(
                      (pq) => pq.question_id === item.question_id,
                    ) + 1;
                  return (
                    <li key={item.question_id}>
                      <span className={`blank-question-tag blank-question-tag--${item.reason}`}>
                        {BLANK_REASON_LABELS[item.reason]}
                      </span>
                      {order > 0 ? `Câu ${order}` : ""}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "xem-lai" && review.length > 0 && (
        <div className="result-tab-panel">
          <section className="result-section result-section--review">
            <h3>Xem lại bài làm</h3>
            <p className="empty-hint">
              Đối chiếu đáp án đã chọn với đáp án đúng, và xem lời giải chi tiết (nếu có) cho từng
              câu.
            </p>
            {([1, 2, 3] as const).map((part) => {
              const itemsInPart = review.filter((r) => r.part === part);
              if (itemsInPart.length === 0) return null;
              return (
                <div key={part}>
                  <h4 className="part-title">{PART_LABELS[part]}</h4>
                  {itemsInPart.map((r, i) => (
                    <QuestionReview
                      key={r.question_id}
                      number={i + 1}
                      question={r.question}
                      finalAnswer={r.finalAnswer}
                      score={r.score}
                      maxScore={r.maxScore}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        </div>
      )}

      <Link className="btn-primary" to="/hoc-sinh">
        Về trang chủ
      </Link>

      {/* Bản in riêng — ẩn khỏi màn hình bình thường, chỉ hiện khi in/lưu PDF
          (xem @media print trong styles.css và ghi chú ở đầu ResultSlip.tsx). */}
      {attempt && (
        <ResultSlip
          studentName={profile?.full_name ?? "—"}
          studentClass={className}
          examTitle={attempt.exam.title}
          attemptDateLabel={new Date(attempt.started_at).toLocaleDateString("vi-VN")}
          score={score}
          diagnostics={diagnostics}
          generatedAtLabel={new Date().toLocaleDateString("vi-VN")}
        />
      )}
    </div>
  );
}
