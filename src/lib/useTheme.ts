import { useCallback, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "theme";

function readInitialTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * Đọc/ghi chế độ sáng-tối (đợt cuối, 24/08/2026). Giá trị BAN ĐẦU lấy từ
 * thuộc tính data-theme mà 1 đoạn script nhỏ trong index.html đã gắn lên
 * <html> TRƯỚC KHI React mount — dựa trên localStorage nếu người dùng đã
 * từng chọn, hoặc prefers-color-scheme của hệ điều hành nếu chưa từng chọn.
 * Làm vậy để tránh "nháy" sai theme trong tích tắc lúc tải trang (nếu chờ
 * React mount xong mới đọc/set thì màn hình sẽ hiện sáng rồi đổi sang tối
 * ngay sau đó, gây giật hình). Hook này chỉ đồng bộ lại state React + xử lý
 * việc bấm nút đổi theme, không tự ý đọc prefers-color-scheme lại lần nữa.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage có thể bị chặn (chế độ riêng tư của trình duyệt...) —
      // bỏ qua, chỉ mất khả năng nhớ lựa chọn giữa các lần vào lại, không
      // ảnh hưởng gì tới việc đổi theme ngay trong phiên hiện tại.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, toggleTheme };
}
