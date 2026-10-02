import { useEffect, useMemo, useState } from "react";
import * as api from "../../lib/api";
import { buildPublicExamLink } from "../../lib/publicExamLink";
import { copyText } from "../../lib/contact";
import { ShareCardModal } from "../ShareCard";
import type { ShareCardData } from "../../lib/renderShareCard";

/**
 * "Rủ bạn làm thử" — link chia sẻ kết quả đề công khai (migration_024).
 *
 * Người nhận mở link thấy trang landing của đúng đề này, kèm lời mời
 * "<tên gọi> vừa làm đề này: x điểm" (điểm chỉ hiện khi em cho phép). Không
 * hiện họ đầy đủ, trường, lớp hay bài làm. Lượt làm từ link được ghi nguồn
 * (?ref=) để thầy biết đề lan được bao xa. Có thể thu hồi link bất cứ lúc nào.
 */
export function ShareResultCard({
  attemptId,
  examTitle,
  slug,
  totalScore,
}: {
  attemptId: string;
  examTitle: string;
  slug: string;
  totalScore: number;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [showScore, setShowScore] = useState(true);
  const [status, setStatus] = useState<"loading" | "idle" | "working">("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getActiveAttemptShare(attemptId)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          setToken(row.token);
          setShowScore(row.show_score);
        }
        setStatus("idle");
      })
      .catch(() => !cancelled && setStatus("idle"));
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const link = useMemo(() => {
    if (!token) return null;
    const base = buildPublicExamLink(window.location.origin, import.meta.env.BASE_URL, slug, "chia-se");
    return `${base}&ref=${token}`;
  }, [token, slug]);

  const scoreText = totalScore.toFixed(2).replace(".", ",");
  const cardData: ShareCardData = { kind: "result", scoreText: showScore ? scoreText : null, examTitle };

  function explain(err: unknown): string {
    const msg = (err as { message?: string } | null)?.message ?? "";
    if (api.isMissingRpcError(err)) return "Hệ thống chưa bật chia sẻ (cần chạy migration_024). Em báo thầy giúp nhé.";
    if (msg.includes("share_not_allowed")) return "Đề này hiện không công khai nên chưa tạo được link chia sẻ.";
    return "Chưa tạo được link. Em kiểm tra mạng rồi thử lại nhé.";
  }

  async function create(nextShowScore = showScore) {
    setStatus("working");
    setError(null);
    try {
      const t = await api.createAttemptShare(attemptId, nextShowScore);
      setToken(t);
      setShowScore(nextShowScore);
    } catch (err) {
      console.error(err);
      setError(explain(err));
    } finally {
      setStatus("idle");
    }
  }

  async function revoke() {
    setStatus("working");
    setError(null);
    try {
      await api.revokeAttemptShare(attemptId);
      setToken(null);
      setCopied(false);
    } catch (err) {
      console.error(err);
      setError("Chưa thu hồi được link. Em thử lại nhé.");
    } finally {
      setStatus("idle");
    }
  }

  async function copy() {
    if (!link) return;
    setCopied(await copyText(link));
  }

  async function nativeShare() {
    if (!link) return;
    try {
      await navigator.share({
        title: examTitle,
        text: showScore ? `Mình được ${scoreText} điểm đề "${examTitle}". Cậu thử xem được bao nhiêu?` : `Làm thử đề "${examTitle}" nhé, nộp xong có báo cáo.`,
        url: link,
      });
    } catch {
      // người dùng tự huỷ — không cần báo
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const busy = status !== "idle";

  return (
    <div className="student-intelligence-share" id="chia-se">
      <span className="student-intelligence-kicker">Rủ bạn làm thử</span>
      <h3 className="student-intelligence-guest-save-title">Gửi đề này cho bạn, so báo cáo với nhau</h3>
      <p className="student-intelligence-guest-save-text">
        Bạn mở link sẽ thấy lời mời có tên gọi của em{showScore ? " và điểm" : ""}. Không hiện họ đầy đủ, trường, lớp hay
        bài làm. Em thu hồi link lúc nào cũng được.
      </p>

      <label className="student-intelligence-share-toggle">
        <input
          type="checkbox"
          checked={showScore}
          disabled={busy}
          onChange={(e) => (token ? create(e.target.checked) : setShowScore(e.target.checked))}
        />
        <span>Cho bạn thấy điểm của em ({scoreText}/10)</span>
      </label>

      {!token ? (
        <div className="student-intelligence-share-actions">
          <button type="button" className="student-intelligence-button student-intelligence-button--primary" onClick={() => create()} disabled={busy}>
            {status === "working" ? "Đang tạo link…" : "Tạo link chia sẻ"}
          </button>
          <button type="button" className="student-intelligence-button" onClick={() => setImageOpen(true)}>
            Tải ảnh kết quả
          </button>
        </div>
      ) : (
        <>
          <div className="student-intelligence-share-link">
            <input readOnly value={link ?? ""} aria-label="Link chia sẻ" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="student-intelligence-button student-intelligence-button--primary" onClick={copy}>
              {copied ? "Đã chép" : "Sao chép link"}
            </button>
          </div>
          <div className="student-intelligence-share-actions">
            {canNativeShare && (
              <button type="button" className="student-intelligence-button" onClick={nativeShare}>
                Gửi qua Zalo, Messenger…
              </button>
            )}
            <button type="button" className="student-intelligence-button" onClick={() => setImageOpen(true)}>
              Tải ảnh kết quả
            </button>
            <button type="button" className="student-intelligence-button student-intelligence-button--quiet-link" onClick={revoke} disabled={busy}>
              Thu hồi link
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="student-intelligence-guest-save-error" role="alert">
          {error}
        </p>
      )}
      {imageOpen && (
        <ShareCardModal
          data={cardData}
          onClose={() => setImageOpen(false)}
          hint={token ? "Tải ảnh về, đăng story kèm link ở trên để bạn bè làm thử." : "Tải ảnh về rồi đăng story. Tạo link ở trên để bạn bè bấm vào làm thử."}
        />
      )}
    </div>
  );
}
