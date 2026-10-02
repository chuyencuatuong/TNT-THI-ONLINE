import { useEffect, useRef, useState } from "react";
import { TURNSTILE_SITE_KEY, loadTurnstile } from "../lib/turnstile";

/**
 * Ô xác minh Turnstile. Không có VITE_TURNSTILE_SITE_KEY thì không hiện gì.
 * `resetSignal` đổi giá trị -> làm mới ô (token chỉ dùng được 1 lần, nên sau
 * mỗi lần gửi thất bại phải lấy token mới).
 */
export function TurnstileBox({
  onToken,
  resetSignal = 0,
  className,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const tokenCb = useRef(onToken);
  tokenCb.current = onToken;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !hostRef.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !hostRef.current) return;
        widgetRef.current = ts.render(hostRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
          size: "flexible",
          language: "vi",
          callback: (t: string) => tokenCb.current(t),
          "expired-callback": () => tokenCb.current(null),
          "error-callback": () => tokenCb.current(null),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetSignal && widgetRef.current && window.turnstile) {
      window.turnstile.reset(widgetRef.current);
      tokenCb.current(null);
    }
  }, [resetSignal]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className={className}>
      <div ref={hostRef} />
      {failed && <p className="form-error">Không tải được ô xác minh. Kiểm tra mạng rồi tải lại trang.</p>}
    </div>
  );
}
