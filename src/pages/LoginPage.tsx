import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { GENDER_LABELS, type Gender } from "../lib/types";
import { VIETNAM_PROVINCES } from "../lib/vietnamProvinces";
import logoFull from "../assets/logo-full.png";

function translateError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return "Sai email hoặc mật khẩu. Nếu đây là lần đầu vào web, hãy bấm \"Chưa có tài khoản? Đăng ký\" bên dưới.";
  }
  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "Email này đã có tài khoản rồi — hãy chuyển sang \"Đăng nhập\" thay vì đăng ký.";
  }
  if (msg.includes("password") && msg.includes("least")) {
    return "Mật khẩu quá ngắn — cần ít nhất 6 ký tự.";
  }
  if (msg.includes("unable to validate email") || msg.includes("invalid email")) {
    return "Email không hợp lệ, vui lòng kiểm tra lại.";
  }
  return raw;
}

export function LoginPage() {
  const { session, profile, profileLoading, signIn, signUp, createProfile } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [saving, setSaving] = useState(false);
  // Hồ sơ mở rộng (24/08/2026, migration_011) — CHỈ áp dụng cho học sinh, hiện
  // dần ngay sau khi chọn vai trò "Học sinh" trong form "Hoàn tất hồ sơ" bên
  // dưới. GV giữ nguyên form ngắn (chỉ họ tên + vai trò) như trước.
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [province, setProvince] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }

    setBusy(true);
    const { error } =
      mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) setError(translateError(error));
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createProfile(
      fullName,
      role,
      role === "student"
        ? {
            dateOfBirth: dateOfBirth || undefined,
            phone: phone || undefined,
            schoolName: schoolName || undefined,
            gender: gender || undefined,
            province: province || undefined,
          }
        : undefined,
    );
    if (error) setError(error);
    setSaving(false);
  }

  // Vừa đăng nhập/đăng ký xong, đang chờ tải hồ sơ -> hiện "Đang tải..." thay vì
  // đứng im ở form cũ (khiến người dùng tưởng bị lag) hoặc nhầm hiện màn hình
  // "chưa có hồ sơ" cho người đã có hồ sơ.
  if (session && profileLoading) {
    return <div className="page-loading">Đang tải...</div>;
  }

  // Đã đăng nhập VÀ đã xác định có hồ sơ -> chuyển thẳng vào giao diện chính
  // tương ứng vai trò (route "/" tự điều hướng tiếp, xem App.tsx). Không có
  // bước này thì sau khi đăng ký/hoàn tất hồ sơ, người dùng bị kẹt lại đúng
  // trang đăng nhập/đăng ký mà không biết đã xong.
  if (session && profile) {
    return <Navigate to="/" replace />;
  }

  // Đã đăng nhập nhưng chưa có hồ sơ -> yêu cầu nhập tên & vai trò lần đầu
  if (session && !profile) {
    return (
      <div className="auth-page">
        <img src={logoFull} alt="Toán học TNT" className="auth-logo" />
        <h2>Hoàn tất hồ sơ</h2>
        <p>Đây là lần đăng nhập đầu tiên, vui lòng cho biết bạn là ai.</p>
        <form onSubmit={handleCreateProfile} className="auth-form">
          <input
            type="text"
            placeholder="Họ và tên"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <div className="role-choice">
            <label>
              <input
                type="radio"
                checked={role === "student"}
                onChange={() => setRole("student")}
              />
              Học sinh
            </label>
            <label>
              <input
                type="radio"
                checked={role === "teacher"}
                onChange={() => setRole("teacher")}
              />
              Giáo viên
            </label>
          </div>

          {/* Chỉ hiện khi chọn "Học sinh" — GV không cần điền các trường này
              (24/08/2026, migration_011). Không có trường nào bắt buộc, để
              không chặn HS hoàn tất đăng ký nếu chưa muốn điền hết ngay. */}
          {role === "student" && (
            <div className="student-profile-fields">
              <label className="field-label">
                Ngày sinh
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </label>
              <label className="field-label">
                Số điện thoại
                <input
                  type="tel"
                  placeholder="VD: 0912345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="field-label">
                Trường đang học
                <input
                  type="text"
                  placeholder="VD: THPT Chuyên Lê Quý Đôn"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                />
              </label>
              <label className="field-label">
                Giới tính
                <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
                  <option value="">— Chọn —</option>
                  {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                    <option key={g} value={g}>
                      {GENDER_LABELS[g]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Tỉnh/Thành phố
                <select value={province} onChange={(e) => setProvince(e.target.value)}>
                  <option value="">— Chọn —</option>
                  {VIETNAM_PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Đang lưu..." : "Bắt đầu"}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="auth-page">
      <img src={logoFull} alt="Toán học TNT" className="auth-logo" />
      <p className="auth-tagline">Luyện tập &amp; kiểm tra Toán trực tuyến</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {mode === "signup" && (
          <input
            type="password"
            placeholder="Nhập lại mật khẩu"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />
        )}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy
            ? "Đang xử lý..."
            : mode === "signin"
              ? "Đăng nhập"
              : "Đăng ký tài khoản mới"}
        </button>
      </form>
      <button
        type="button"
        className="btn-link"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
      >
        {mode === "signin" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
