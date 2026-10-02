import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { ExamProgressRow, ExamQuestionWrongStat, PublicAttemptRow } from "../lib/api";
import { buildPublicExamLink } from "../lib/publicExamLink";
import type { ExamRow } from "../lib/types";

const PART_LABELS: Record<1 | 2 | 3, string> = {
  1: "Phần 1",
  2: "Phần 2",
  3: "Phần 3",
};

type StatsTab = "tien-do" | "cau-sai" | "cong-khai";

const TAB_LABELS: Record<StatsTab, string> = {
  "tien-do": "Theo dõi tiến độ",
  "cau-sai": "Thống kê câu sai",
  "cong-khai": "Link công khai",
};

/** Xuất danh sách lượt làm từ link công khai ra CSV (mở được bằng Excel). */
function downloadPublicAttemptsCsv(examTitle: string, rows: PublicAttemptRow[], sharerOf: (r: PublicAttemptRow) => string | null) {
  const header = ["Họ tên", "Trường", "Tỉnh/Thành", "Lớp", "Email", "Nguồn", "Từ link chia sẻ của", "Bắt đầu", "Nộp lúc", "Điểm", "Đã tạo tài khoản"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.student.full_name,
      r.student.school_name,
      r.student.province,
      r.student.class_label,
      r.student.contact_email,
      r.attempt.entry_source,
      sharerOf(r),
      new Date(r.attempt.started_at).toLocaleString("vi-VN"),
      r.attempt.submitted_at ? new Date(r.attempt.submitted_at).toLocaleString("vi-VN") : "",
      r.score ? r.score.total_score.toFixed(2) : "",
      r.student.is_guest ? "Chưa" : "Rồi",
    ]
      .map(esc)
      .join(","),
  );
  // BOM để Excel đọc đúng tiếng Việt.
  const blob = new Blob(["\ufeff" + [header.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `luot-lam-cong-khai-${examTitle.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
  const [publicRows, setPublicRows] = useState<PublicAttemptRow[]>([]);
  const [shares, setShares] = useState<api.AttemptShareRow[]>([]);
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

  // Tab "Link công khai" (migration_023) — lượt làm của khách/người vào từ link.
  useEffect(() => {
    if (!examId || tab !== "cong-khai") return;
    let cancelled = false;
    async function load() {
      try {
        const rows = await api.listPublicAttemptsForExam(examId!);
        if (cancelled) return;
        setPublicRows(rows);
        // Link chia sẻ (migration_024) — lỗi thì bỏ qua, bảng vẫn hiện.
        api
          .listAttemptSharesForAttempts(rows.map((r) => r.attempt.id))
          .then((sh) => !cancelled && setShares(sh))
          .catch((err) => console.error("Không tải được link chia sẻ:", err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    setLoading(true);
    load();
    const id = window.setInterval(load, PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [examId, tab]);

  // ----- Lan truyền: lượt làm đến từ link chia sẻ của ai -------------------------
  const rowByAttempt = new Map(publicRows.map((r) => [r.attempt.id, r]));
  const shareByToken = new Map(shares.map((sh) => [sh.token, sh]));
  const sharerOf = (r: PublicAttemptRow): string | null => {
    if (!r.attempt.ref_share) return null;
    const sh = shareByToken.get(r.attempt.ref_share);
    const src = sh ? rowByAttempt.get(sh.attempt_id) : null;
    return src ? src.student.full_name : "một bạn";
  };
  const viaShare = publicRows.filter((r) => r.attempt.ref_share);
  const topSharers = (() => {
    const counts = new Map<string, number>();
    for (const r of viaShare) counts.set(r.attempt.ref_share!, (counts.get(r.attempt.ref_share!) ?? 0) + 1);
    return [...counts.entries()]
      .map(([token, n]) => {
        const sh = shareByToken.get(token);
        const src = sh ? rowByAttempt.get(sh.attempt_id) : null;
        return { token, n, name: src?.student.full_name ?? "Một bạn", school: src?.student.school_name ?? null };
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  })();

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
                    <th>Báo cáo</th>
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
                        <td>
                          {row.attempt?.submitted_at ? (
                            <Link className="btn-link" to={`/giao-vien/bai-lam/${row.attempt.id}`}>
                              Mở báo cáo
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "cong-khai" && (
        <div className="result-tab-panel">
          {exam?.is_public && exam.public_slug ? (
            <p className="empty-hint">
              Đề đang công khai:{" "}
              <code>{buildPublicExamLink(window.location.origin, import.meta.env.BASE_URL, exam.public_slug, "fb")}</code>
            </p>
          ) : (
            <p className="empty-hint">
              Đề chưa bật công khai — bật ở trang sửa đề (mục "Link công khai") để đăng lên Facebook.
            </p>
          )}
          {loading ? (
            <div className="page-loading">Đang tải...</div>
          ) : publicRows.length === 0 ? (
            <p className="empty-hint">Chưa có lượt làm nào từ link công khai.</p>
          ) : (
            <>
              <div className="tdash-kpis" style={{ margin: "8px 0 16px" }}>
                <div className="tdash-kpi">
                  <span className="tdash-kpi-label">Lượt làm</span>
                  <b className="tdash-kpi-value">{publicRows.length}</b>
                  <span className="tdash-kpi-sub">đã nộp {publicRows.filter((r) => r.attempt.submitted_at).length}</span>
                </div>
                <div className="tdash-kpi">
                  <span className="tdash-kpi-label">Đã tạo tài khoản</span>
                  <b className="tdash-kpi-value">{new Set(publicRows.filter((r) => !r.student.is_guest).map((r) => r.student.id)).size}</b>
                  <span className="tdash-kpi-sub">khách chuyển thành học sinh</span>
                </div>
                <div className="tdash-kpi">
                  <span className="tdash-kpi-label">Link chia sẻ đã tạo</span>
                  <b className="tdash-kpi-value">{shares.length}</b>
                  <span className="tdash-kpi-sub">{shares.filter((sh) => sh.revoked_at).length} đã thu hồi</span>
                </div>
                <div className="tdash-kpi">
                  <span className="tdash-kpi-label">Lượt làm từ chia sẻ</span>
                  <b className="tdash-kpi-value">{viaShare.length}</b>
                  <span className="tdash-kpi-sub">
                    {publicRows.length > 0 ? `${Math.round((viaShare.length / publicRows.length) * 100)}% tổng lượt` : "—"}
                  </span>
                </div>
                <div className="tdash-kpi">
                  <span className="tdash-kpi-label">Kéo về nhiều nhất</span>
                  <b className="tdash-kpi-value" style={{ fontSize: 18 }}>{topSharers[0] ? topSharers[0].name : "—"}</b>
                  <span className="tdash-kpi-sub">{topSharers[0] ? `${topSharers[0].n} lượt làm` : "chưa có"}</span>
                </div>
              </div>
              <div className="page-header-row" style={{ marginBottom: 8 }}>
                <p className="empty-hint" style={{ padding: 0 }}>
                  {topSharers.length > 1
                    ? `Chia sẻ hiệu quả: ${topSharers.map((t) => `${t.name} (${t.n})`).join(", ")}`
                    : "Bảng tự làm mới mỗi 15 giây."}
                </p>
                <button type="button" className="btn-secondary btn-sm" onClick={() => downloadPublicAttemptsCsv(exam?.title ?? "de", publicRows, sharerOf)}>
                  Tải CSV
                </button>
              </div>
              <div className="table-scroll">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Họ tên</th>
                      <th>Trường</th>
                      <th>Tỉnh/Thành</th>
                      <th>Lớp</th>
                      <th>Email</th>
                      <th>Nguồn</th>
                      <th>Nộp lúc</th>
                      <th>Điểm</th>
                      <th>Báo cáo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicRows.map((r) => (
                      <tr key={r.attempt.id}>
                        <td>
                          {r.student.info_completed_at || !r.student.is_guest ? r.student.full_name : <span className="empty-hint">Chưa điền</span>}
                          {!r.student.is_guest && <span className="badge badge-ok" style={{ marginLeft: 6 }}>Có tài khoản</span>}
                        </td>
                        <td>{r.student.school_name ?? "—"}</td>
                        <td>{r.student.province ?? "—"}</td>
                        <td>{r.student.class_label ?? "—"}</td>
                        <td>{r.student.contact_email ?? "—"}</td>
                        <td>
                          {r.attempt.entry_source ?? "—"}
                          {r.attempt.ref_share && <span className="empty-hint" style={{ display: "block", padding: 0, fontSize: 12 }}>từ link của {sharerOf(r)}</span>}
                        </td>
                        <td>
                          {r.attempt.submitted_at ? (
                            new Date(r.attempt.submitted_at).toLocaleString("vi-VN")
                          ) : (
                            <span className="badge badge-warn">Đang làm</span>
                          )}
                        </td>
                        <td>{r.score ? r.score.total_score.toFixed(2) : "—"}</td>
                        <td>
                          {r.attempt.submitted_at ? (
                            <Link className="btn-link" to={`/giao-vien/bai-lam/${r.attempt.id}`}>
                              Mở báo cáo
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
