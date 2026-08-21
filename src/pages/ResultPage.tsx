import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { AttemptScoreRow } from "../lib/types";

export function ResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [score, setScore] = useState<AttemptScoreRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) return;
    api.getAttemptScore(attemptId).then((s) => {
      setScore(s);
      setLoading(false);
    });
  }, [attemptId]);

  if (loading) return <div className="page-loading">Đang tải kết quả...</div>;
  if (!score) return <div className="page-loading">Không tìm thấy kết quả.</div>;

  return (
    <div className="result-page">
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
      <Link className="btn-primary" to="/hoc-sinh">
        Về trang chủ
      </Link>
    </div>
  );
}
