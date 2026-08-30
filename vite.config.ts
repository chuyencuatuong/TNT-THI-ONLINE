import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base PHẢI khớp CHÍNH XÁC cả chữ hoa/thường với tên repo GitHub thật
// (GitHub Pages phân biệt hoa/thường trong đường dẫn). Repo thật của bạn là
// "TNT-THI-ONLINE" (viết hoa) — nếu sau này đổi tên repo, phải sửa lại đúng ở đây.
export default defineConfig({
  plugins: [react()],
  base: "/TNT-THI-ONLINE/",
  test: {
    globals: true,
    environment: "node",
  },
});
