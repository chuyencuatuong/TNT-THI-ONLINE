import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as api from "../lib/api";
import type { AttemptDiagnostics } from "../lib/api";
import { MASTERY_LABELS, type MasteryLabel } from "../lib/diagnosis";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow } from "../lib/types";

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
  const { attemptId } = useParams<{ attemptId: string }>();
  const [attempt, setAttempt] = useState<(ExamAttemptRow & { exam: ExamRow }) | null>(null);
  const [score, setScore] = useState<AttemptScoreRow | null>(null);
  const [diagnostics, setDiagnostics] = useState<AttemptDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) return;
    (async () => {
      const a = await api.getAttempt(attemptId);
      setAttempt(a);
      const [s, d] = await Promise.all([
        api.getAttemptScore(attemptId),
        a ? api.getAttemptDiagnostics(attemptId, a.exam_id) : Promise.resolve(null),
      ]);
      setScore(s);
      setDiagnostics(d);
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
    .map((t) => ({ name: t.type_name, accuracyPercent: t.avgScoreRatio * 100 }));

  return (
    <div className="result-page result-page--wide">
      <h2>Kết quả bài làm</h2>
      <div className="score-total">{score.total_score.toFixed(2)} / 10</div>
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
          <p className="empty-hint">Xanh: câu làm đúng · Đỏ: câu làm sai hoặc chưa đúng hoàn toàn.</p>
        </section>
      )}

      {topicChartData.length > 0 && (
        <section className="result-section">
          <h3>Độ chính xác theo dạng bài</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, topicChartData.length * 40)}>
            <BarChart data={topicChartData} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" width={160} fontSize={12} />
              <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
              <Bar dataKey="accuracyPercent" fill="#3b6fd6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {diagnostics && diagnostics.byTopic.length > 0 && (
        <section className="result-section">
          <h3>Chẩn đoán theo dạng bài</h3>
          <p className="empty-hint">
            Đây là gợi ý dựa trên quy tắc đơn giản (độ chính xác, thời gian, số lần đổi đáp án),
            không phải kết luận chắc chắn — dùng để gợi ý hướng ôn tập.
          </p>
          <div className="diagnosis-list">
            {diagnostics.byTopic.map((t) => (
              <div key={t.question_type_id} className="diagnosis-card">
                <div className="diagnosis-card-header">
                  <span>{t.type_name}</span>
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

      <Link className="btn-primary" to="/hoc-sinh">
        Về trang chủ
      </Link>
    </div>
  );
}
