import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// base PHẢI khớp CHÍNH XÁC cả chữ hoa/thường với tên repo GitHub thật
// (GitHub Pages phân biệt hoa/thường trong đường dẫn). Repo thật của bạn là
// "TNT-THI-ONLINE" (viết hoa) — nếu sau này đổi tên repo, phải sửa lại đúng ở đây.
const BASE = "/TNT-THI-ONLINE/";

/**
 * Địa chỉ tuyệt đối của trang (cần cho ảnh xem trước khi dán link lên
 * Facebook — og:image phải là URL đầy đủ). Ưu tiên biến VITE_SITE_URL (khi
 * dùng tên miền riêng); không có thì tự suy ra từ GitHub Actions
 * (https://<chủ repo>.github.io/TNT-THI-ONLINE).
 */
function siteUrl(): string {
  const explicit = process.env.VITE_SITE_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  return owner ? `https://${owner.toLowerCase()}.github.io${BASE.replace(/\/$/, "")}` : `http://localhost:5173${BASE.replace(/\/$/, "")}`;
}

/** Thay __SITE_URL__ trong các file HTML (thẻ Open Graph của thi/index.html). */
function siteUrlPlugin(): Plugin {
  return {
    name: "tnt-site-url",
    transformIndexHtml(html) {
      return html.replace(/__SITE_URL__/g, siteUrl());
    },
  };
}

export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  base: BASE,
  build: {
    rollupOptions: {
      // 2 trang HTML dùng CHUNG 1 ứng dụng React: index.html (mọi trang) và
      // thi/index.html (link đề công khai đăng Facebook). Trang thứ hai có
      // file thật trên GitHub Pages nên trả mã 200 kèm ảnh/tiêu đề xem trước,
      // thay vì đi vòng qua 404.html như các đường dẫn khác.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        thi: fileURLToPath(new URL("./thi/index.html", import.meta.url)),
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
