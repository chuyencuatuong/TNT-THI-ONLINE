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

  // Lớp phủ rất mỏng hiện lên phía sau mỗi khi chuyển trang rồi tự mờ dần —
  // tạo cảm giác chiều sâu/chuyển động nhẹ nhàng thay vì đổi hẳn màu nền (đề
  // xuất thiết kế đợt 4, mục "lớp nền & chuyển động").
  useEffect(() => {
    setTinted(true);
    const id = window.setTimeout(() => setTinted(false), 500);
    return () => window.clearTimeout(id);
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
          <nav className="app-nav">
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
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
