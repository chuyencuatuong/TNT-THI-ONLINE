/**
 * Cloudflare Turnstile (CAPTCHA không cần bấm hình) — TUỲ CHỌN (02/10/2026).
 *
 * Chỉ bật khi có biến môi trường VITE_TURNSTILE_SITE_KEY. Khi bật phải bật
 * cùng lúc ở Supabase: Authentication > Attack Protection > Enable CAPTCHA
 * protection (chọn Turnstile, dán Secret key). Supabase sẽ đòi captchaToken
 * cho đăng nhập, đăng ký và đăng nhập ẩn danh — nên trang đăng nhập và nút
 * "Làm bài miễn phí" đều đã truyền token.
 */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || null;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile_load_failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
