import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { ExamProgressRow, ExamQuestionWrongStat } from "../lib/api";
import type { ExamRow } from "../lib/types";

const PART_LABELS: Record<1 | 2 | 3, string> = {
  1: "Phần 1",
  2: "Phần 2",
  3: "Phần 3",
};

type StatsTab = "tien-do" | "cau-sai";

const TAB_LABELS: Record<StatsTab, string> = {
  "tien-do": "Theo dõi tiến độ",
  "cau-sai": "Thống kê câu sai",
};

// Chu kỳ làm mới "Theo dõi tiến độ" — quy mô lớp chỉ ~5 học sinh nên polling
// đơn giản mỗi 15s là đủ "gần thời gian thực", không cần Supabase Realtime
// (đúng tiền lệ setInterval thuần đã có ở StudentDashboard.tsx/ExamTakingPage.tsx).
const PROGRESS_POLL_MS = 15_000;

function progressStatus(row: ExamProgressRow): { text: string; className: string } {
  if (!row.attempt) return { text: "Chưa làm", className: "badge" };
  if (!row.attempt.submitted_at) return { text: "Đang làm", className: "badge badge-warn" };
  return { text: "Đã nộp", className: "badge badge-ok" };
}

/**
 * Trang thống kê riêng cho 1 đề thi (Đợt 2, mục 3 + 4) — 2 tab:
 * "Theo dõi tiến độ" (ai đã làm/đang làm/chưa làm, cập nhật gần thời gian
 * thực bằng polling) và "Thống kê câu sai" (câu nào cả lớp hay sai nhất, để
 * lộ lỗ hổng kiến thức chung). Dùng lại pattern tab của ResultPage.tsx.
 */
export function TeacherExamStats() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<ExamRow | null>(null);
  const [tab, setTab] = useState<StatsTab>("tien-do");
  const [progress, setProgress] = useState<ExamProgressRow[]>([]);
  const [wrongStats, setWrongStats] = useState<ExamQuestionWrongStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!examId) return;
    api.getExam(examId).then(setExam);
  }, [examId]);

  // Tab "Theo dõi tiến độ" — tải ngay khi mở, rồi polling định kỳ trong lúc
  // tab này đang mở; dừng hẳn (clearInterval) khi rời trang hoặc đổi tab.
  useEffect(() => {
    if (!examId || tab !== "tien-do") return;
    let cancelled = false;
    async function load() {
      const rows = await api.listAttemptsForExam(examId!);
      if (!cancelled) {
        setProgress(rows);
        setLoading(false);
      }
    }
    load();
    const id = window.setInterval(load, PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [examId, tab]);

  // Tab "Thống kê câu sai" — tải 1 lần khi mở tab (không cần polling, không
  // đổi liên tục như tiến độ).
  useEffect(() => {
    if (!examId || tab !== "cau-sai") return;
    let cancelled = false;
    setLoading(true);
    api.getExamWrongStats(examId).then((rows) => {
      if (cancelled) return;
      setWrongStats(rows.slice().sort((a, b) => b.wrongPercent - a.wrongPercent));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [examId, tab]);

  const doneCount = progress.filter((r) => r.attempt?.submitted_at).length;
  const inProgressCount = progress.filter((r) => r.attempt && !r.attempt.submitted_at).length;

  return (
    <div className="teacher-page">
      <div className="page-header-row">
        <h2>Thống kê đề: {exam?.title ?? "..."}</h2>
        <Link className="btn-secondary" to="/giao-vien/de-thi">
          ← Về danh sách đề
        </Link>
      </div>

      <div className="result-tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as StatsTab[]).map((t) => (
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

      {tab === "tien-do" && (
        <div className="result-tab-panel">
          <p className="empty-hint">
            Tự động cập nhật mỗi {PROGRESS_POLL_MS / 1000}s. Đã nộp {doneCount}/{progress.length}
            {inProgressCount > 0 ? ` · đang làm ${inProgressCount}` : ""}.
          </p>
          {loading ? (
            <div className="page-loading">Đang tải...</div>
          ) : progress.length === 0 ? (
            <p className="empty-hint">Chưa có học sinh nào đăng ký.</p>
          ) : (
            <div className="table-scroll">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Trạng thái</th>
                    <th>Bắt đầu lúc</th>
                    <th>Điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.map((row) => {
                    const status = progressStatus(row);
                    return (
                      <tr key={row.student.id}>
                        <td>{row.student.full_name}</td>
                        <td>
                          <span className={status.className}>{status.text}</span>
                        </td>
                        <td>
                          {row.attempt ? new Date(row.attempt.started_at).toLocaleString("vi-VN") : "—"}
                        </td>
                        <td>{row.score ? row.score.total_score.toFixed(2) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "cau-sai" && (
        <div className="result-tab-panel">
          <p className="empty-hint">
            Câu sai nhiều nhất (tính trên số lượt đã nộp bài) lên đầu — gợi ý lỗ hổng kiến thức
            chung của cả lớp cho đề này.
          </p>
          {loading ? (
            <div className="page-loading">Đang tải...</div>
          ) : wrongStats.length === 0 ? (
            <p className="empty-hint">Đề này chưa có câu hỏi nào.</p>
          ) : (
            <div className="table-scroll">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Câu</th>
                    <th>Phần</th>
                    <th>Nội dung</th>
                    <th>Tỉ lệ sai</th>
                  </tr>
                </thead>
                <tbody>
                  {wrongStats.map((s, i) => (
                    <tr key={s.question_id}>
                      <td>Câu {i + 1}</td>
                      <td>{PART_LABELS[s.part]}</td>
                      <td style={{ maxWidth: 420 }}>
                        {s.question.content_latex.slice(0, 120)}
                        {s.question.content_latex.length > 120 ? "…" : ""}
                      </td>
                      <td>
                        {s.totalCount === 0 ? (
                          <span className="empty-hint">Chưa có lượt nộp</span>
                        ) : (
                          <span
                            className={`badge ${s.wrongPercent >= 50 ? "badge-danger" : s.wrongPercent > 0 ? "badge-warn" : "badge-ok"}`}
                          >
                            {s.wrongCount}/{s.totalCount} ({s.wrongPercent}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
