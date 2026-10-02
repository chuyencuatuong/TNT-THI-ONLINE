import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/useTheme";
import logoMark from "../assets/logo-mark.png";
import { MusicWidget } from "./MusicWidget";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "app-nav-link--active" : "";
}

// ---------------------------------------------------------------------------
// Khung giao diện GIÁO VIÊN (02/10/2026): thanh bên trái chia 4 nhóm thay cho
// 10 mục nằm ngang. Màn hẹp (< 960px) thanh bên thành ngăn kéo mở bằng nút menu.
// ---------------------------------------------------------------------------
type IconName = "home" | "users" | "calendar" | "progress" | "file" | "plus" | "layers" | "bank" | "tag" | "graph" | "globe";

const ICON_PATHS: Record<IconName, JSX.Element> = {
  home: <path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z" />,
  users: (
    <>
      <circle cx="7.5" cy="7" r="2.8" />
      <path d="M2.5 16.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" />
      <path d="M13 4.6a2.6 2.6 0 0 1 0 4.9M14.5 12.7c1.5.5 2.6 1.8 3 3.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </>
  ),
  progress: <path d="M4 5.5h7M4 10h12M4 14.5h9M14 4l1.5 1.5L18 3" />,
  file: (
    <>
      <path d="M5 2.5h6.5L16 7v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
      <path d="M11 2.5V7h5M7 11h6M7 14h4" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  layers: <path d="M10 3 2.5 7 10 11l7.5-4zM2.5 10.5 10 14.5l7.5-4M2.5 14 10 18l7.5-4" />,
  bank: (
    <>
      <ellipse cx="10" cy="5" rx="6.5" ry="2.5" />
      <path d="M3.5 5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V5M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
    </>
  ),
  tag: (
    <>
      <path d="M3 3h6.5l8 8-6.5 6.5-8-8z" />
      <circle cx="7" cy="7" r="1.3" />
    </>
  ),
  graph: (
    <>
      <circle cx="5" cy="5" r="2" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="8" cy="15" r="2" />
      <path d="M6.8 5.4 13 6.6M14 8.8l-4.8 4.6M5.6 6.9l1.8 6.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2 2 2.8 4.3 2.8 7S12 15 10 17c-2-2-2.8-4.3-2.8-7S8 5 10 3z" />
    </>
  ),
};

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg className="tsb-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

interface TeacherNavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const TEACHER_NAV: { title: string | null; items: TeacherNavItem[] }[] = [
  { title: null, items: [{ to: "/giao-vien", label: "Tổng quan", icon: "home", end: true }] },
  {
    title: "Lớp học",
    items: [
      { to: "/giao-vien/lop-hoc", label: "Lớp & học sinh", icon: "users" },
      { to: "/giao-vien/lich-hoc", label: "Lịch học", icon: "calendar" },
      { to: "/giao-vien/tien-do-bai-day", label: "Tiến độ bài dạy", icon: "progress" },
    ],
  },
  {
    title: "Đề thi",
    items: [
      { to: "/giao-vien/de-thi", label: "Danh sách đề", icon: "file" },
      { to: "/giao-vien/nap-dang-bai", label: "Nạp dạng bài", icon: "layers" },
    ],
  },
  {
    title: "Dữ liệu học tập",
    items: [
      { to: "/giao-vien/ngan-hang-cau-hoi", label: "Ngân hàng câu hỏi", icon: "bank" },
      { to: "/giao-vien/gan-nhan-loi", label: "Gắn nhãn lỗi", icon: "tag" },
      { to: "/giao-vien/ban-do-kien-thuc", label: "Bản đồ kiến thức", icon: "graph" },
    ],
  },
];

function tsbLinkClass({ isActive }: { isActive: boolean }) {
  return `tsb-link${isActive ? " tsb-link--active" : ""}`;
}

function ThemeIcon({ theme }: { theme: string }) {
  return theme === "dark" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function currentTeacherTitle(pathname: string): string {
  if (pathname.startsWith("/giao-vien/tao-de-tu-word")) return "Tạo đề mới";
  if (pathname.startsWith("/giao-vien/bai-lam/")) return "Báo cáo năng lực";
  if (pathname.startsWith("/giao-vien/hoc-sinh/")) return "Hồ sơ học sinh";
  for (const group of TEACHER_NAV) {
    for (const item of group.items) {
      if (item.end ? pathname === item.to : pathname.startsWith(item.to)) return item.label;
    }
  }
  return "Giáo viên";
}

function TeacherShell() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const name = profile?.full_name ?? "";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

  return (
    <div className={`app-shell app-shell--teacher${open ? " is-nav-open" : ""}`}>
      <header className="tsb-topbar">
        <button
          type="button"
          className="tsb-menu-btn"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          aria-expanded={open}
          aria-controls="teacher-sidebar"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Link to="/giao-vien" className="tsb-topbar-brand">
          <img src={logoMark} alt="" />
          <span>{currentTeacherTitle(location.pathname)}</span>
        </Link>
      </header>

      <aside className="tsb" id="teacher-sidebar" aria-label="Menu giáo viên">
        <Link to="/giao-vien" className="tsb-brand">
          <img src={logoMark} alt="" />
          <span>
            <b>Toán học TNT</b>
            <small>Giáo viên</small>
          </span>
        </Link>

        <NavLink to="/giao-vien/tao-de-tu-word" className={({ isActive }) => `tsb-create${isActive ? " tsb-create--active" : ""}`}>
          <NavIcon name="plus" />
          Tạo đề mới
        </NavLink>

        <nav className="tsb-nav">
          {TEACHER_NAV.map((group) => (
            <div className="tsb-group" key={group.title ?? "main"}>
              {group.title && <span className="tsb-group-title">{group.title}</span>}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={tsbLinkClass}>
                  <NavIcon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="tsb-group">
            <span className="tsb-group-title">Học sinh ngoài lớp</span>
            <Link to="/thi" className="tsb-link" target="_blank" rel="noopener">
              <NavIcon name="globe" />
              Trang đề miễn phí
            </Link>
          </div>
        </nav>

        <div className="tsb-foot">
          <span className="tsb-avatar" aria-hidden="true">
            {initials || "GV"}
          </span>
          <span className="tsb-user">
            <b>{name}</b>
            <button type="button" className="tsb-signout" onClick={signOut}>
              Đăng xuất
            </button>
          </span>
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
            title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
            onClick={toggleTheme}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </aside>
      <div className="tsb-scrim" aria-hidden="true" onClick={() => setOpen(false)} />

      <div className="tsb-main">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function Layout() {
  const { profile } = useAuth();
  if (profile && profile.role === "teacher" && !profile.is_guest) return <TeacherShell />;
  return <StandardShell />;
}

function StandardShell() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [tinted, setTinted] = useState(false);
  // Menu di động (hamburger) — đóng mặc định, chỉ có hiệu lực hiển thị dưới
  // 860px (xem styles.css, khối @media quanh .app-header-hamburger/.app-nav).
  // Trên desktop CSS luôn ẩn nút hamburger và luôn hiện .app-nav nên state
  // này không ảnh hưởng gì tới màn hình rộng.
  const [navOpen, setNavOpen] = useState(false);

  // Lớp phủ rất mỏng hiện lên phía sau mỗi khi chuyển trang rồi tự mờ dần —
  // tạo cảm giác chiều sâu/chuyển động nhẹ nhàng thay vì đổi hẳn màu nền (đề
  // xuất thiết kế đợt 4, mục "lớp nền & chuyển động").
  useEffect(() => {
    setTinted(true);
    const id = window.setTimeout(() => setTinted(false), 500);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  // Tự đóng menu di động mỗi khi chuyển trang — không có bước này thì bấm 1
  // link trong menu xong menu vẫn đứng mở, che tiếp nội dung trang mới.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <div className={`page-tint ${tinted ? "page-tint--active" : ""}`} />
      <header className="app-header">
        <Link to={profile?.is_guest ? "/thi" : "/"} className="app-logo">
          <img src={logoMark} alt="TNT" />
          Toán học TNT
        </Link>
        {profile?.is_guest && (
          // Khách làm đề công khai (đăng nhập ẩn danh): không có menu học sinh,
          // không có nút đăng xuất (đăng xuất là mất luôn bài vừa làm).
          <div className="app-guest-block">
            <span className="app-guest-badge">Chế độ khách</span>
            <button
              type="button"
              className="theme-toggle"
              aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        )}
        {profile && !profile.is_guest && (
          <>
            {/* Nút hamburger là phần tử ĐỘC LẬP với .app-nav (không nằm bên
                trong) — để luôn bấm được kể cả khi menu đang đóng/ẩn. Xem
                styles.css để biết cách 2 phần tử phối hợp theo breakpoint. */}
            <button
              type="button"
              className="app-header-hamburger"
              aria-label={navOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((open) => !open)}
            >
              {navOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
            <nav className={`app-nav ${navOpen ? "app-nav--open" : ""}`}>
              <div className="app-nav-links">
                  <>
                    <NavLink to="/hoc-sinh" end className={navLinkClass}>
                      Trang chủ
                    </NavLink>
                    <NavLink to="/hoc-sinh/kho-de" className={navLinkClass}>
                      Kho đề
                    </NavLink>
                    <NavLink to="/hoc-sinh/on-tap-cau-sai" className={navLinkClass}>
                      Ôn tập câu sai
                    </NavLink>
                    <NavLink to="/hoc-sinh/ho-so-nang-luc" className={navLinkClass}>
                      Hồ sơ năng lực
                    </NavLink>
                    <NavLink to="/hoc-sinh/lich-hoc" className={navLinkClass}>
                      Lịch học
                    </NavLink>
                  </>
              </div>
              <div className="app-user-block">
                {profile.role === "student" && <MusicWidget studentId={profile.id} />}
                <button
                  type="button"
                  className="theme-toggle"
                  aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
                  title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
                  onClick={toggleTheme}
                >
                  {theme === "dark" ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  )}
                </button>
                <span className="app-user">{profile.full_name}</span>
                <button className="btn-link" onClick={signOut}>
                  Đăng xuất
                </button>
              </div>
            </nav>
          </>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
