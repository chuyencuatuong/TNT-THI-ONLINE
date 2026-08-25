import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import logoMark from "../assets/logo-mark.png";
import { MusicWidget } from "./MusicWidget";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "app-nav-link--active" : "";
}

export function Layout() {
  const { profile, signOut } = useAuth();
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
        <Link to="/" className="app-logo">
          <img src={logoMark} alt="TNT" />
          Toán học TNT
        </Link>
        {profile && (
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
                {profile.role === "teacher" ? (
                  <>
                    <NavLink to="/giao-vien" end className={navLinkClass}>
                      Tổng quan
                    </NavLink>
                    <NavLink to="/giao-vien/tao-de-tu-word" className={navLinkClass}>
                      + Tạo đề từ PDF/Word
                    </NavLink>
                    <NavLink to="/giao-vien/de-thi" className={navLinkClass}>
                      Đề thi
                    </NavLink>
                    <NavLink to="/giao-vien/ngan-hang-cau-hoi" className={navLinkClass}>
                      Ngân hàng câu hỏi
                    </NavLink>
                    <NavLink to="/giao-vien/nap-dang-bai" className={navLinkClass}>
                      Nạp dạng bài
                    </NavLink>
                  </>
                ) : (
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
                  </>
                )}
              </div>
              <div className="app-user-block">
                {profile.role === "student" && <MusicWidget studentId={profile.id} />}
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
