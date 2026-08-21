import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base phải khớp với tên repo GitHub khi deploy lên GitHub Pages
// vd: repo tên "tnt-thi-online" -> base: "/tnt-thi-online/"
// Sẽ cập nhật lại giá trị này ở bước SETUP khi biết tên repo thật.
export default defineConfig({
  plugins: [react()],
  base: "/tnt-thi-online/",
  test: {
    globals: true,
    environment: "node",
  },
});
