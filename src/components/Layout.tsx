import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import logoIcon from "../assets/logo-icon.png";

export function Layout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-logo">
          <img src={logoIcon} alt="TNT" />
          Toán học TNT
        </Link>
        {profile && (
          <nav className="app-nav">
            {profile.role === "teacher" ? (
              <>
                <Link to="/giao-vien">Tổng quan</Link>
                <Link to="/giao-vien/tao-de-tu-word">+ Tạo đề từ PDF/Word</Link>
                <Link to="/giao-vien/de-thi">Đề thi</Link>
                <Link to="/giao-vien/ngan-hang-cau-hoi">Ngân hàng câu hỏi</Link>
              </>
            ) : (
              <Link to="/hoc-sinh">Trang chủ</Link>
            )}
            <span className="app-user">{profile.full_name}</span>
            <button className="btn-link" onClick={signOut}>
              Đăng xuất
            </button>
          </nav>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
