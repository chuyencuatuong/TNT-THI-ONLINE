import { useState } from "react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { session, profile, signInWithEmail, createProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [saving, setSaving] = useState(false);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await signInWithEmail(email);
    if (error) setError(error);
    else setSent(true);
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createProfile(fullName, role);
    if (error) setError(error);
    setSaving(false);
  }

  // Đã đăng nhập nhưng chưa có hồ sơ -> yêu cầu nhập tên & vai trò lần đầu
  if (session && !profile) {
    return (
      <div className="auth-page">
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
      <h1>TNT - Luyện tập & Kiểm tra Toán</h1>
      {sent ? (
        <p>
          Đã gửi link đăng nhập tới <strong>{email}</strong>. Mở email và bấm
          vào link để vào hệ thống (kiểm tra cả mục Spam nếu chưa thấy).
        </p>
      ) : (
        <form onSubmit={handleSendLink} className="auth-form">
          <input
            type="email"
            placeholder="Nhập email của bạn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn-primary" type="submit">
            Gửi link đăng nhập
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
