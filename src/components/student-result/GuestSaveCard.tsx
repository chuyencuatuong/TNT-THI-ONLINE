import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";

/**
 * Thẻ "Lưu hồ sơ" ở trang kết quả — chỉ hiện cho KHÁCH (làm đề công khai,
 * đăng nhập ẩn danh, migration_023). Tạo tài khoản bằng email + mật khẩu NGAY
 * TRÊN user ẩn danh hiện tại (auth.upgradeGuest), nên bài vừa làm tự thuộc
 * tài khoản mới — không phải gộp dữ liệu.
 *
 * Nói rõ rủi ro: chưa lưu thì chỉ xem lại được trên đúng trình duyệt này.
 */
export function GuestSaveCard({ id }: { id: string }) {
  const { upgradeGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "pending">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Email chưa đúng định dạng.");
    if (password.length < 6) return setError("Mật khẩu cần ít nhất 6 ký tự.");
    setStatus("saving");
    const res = await upgradeGuest(email.trim(), password);
    if (res.error) {
      setStatus("idle");
      setError(
        /already|registered|exists/i.test(res.error)
          ? "Email này đã có tài khoản. Em dùng email khác để lưu bài vừa làm nhé (đăng nhập tài khoản cũ sẽ không gộp được bài này)."
          : /password/i.test(res.error)
            ? "Mật khẩu chưa đủ mạnh, em thử mật khẩu dài hơn nhé."
            : "Chưa lưu được. Em kiểm tra mạng rồi thử lại nhé.",
      );
      return;
    }
    setStatus(res.pendingEmail ? "pending" : "done");
  }

  if (status === "done") {
    return (
      <div className="student-intelligence-guest-save is-done" id={id}>
        <span className="student-intelligence-kicker">Đã lưu hồ sơ</span>
        <h3 className="student-intelligence-guest-save-title">Bài này đã nằm trong tài khoản của em.</h3>
        <p className="student-intelligence-guest-save-text">
          Lần sau em đăng nhập bằng {email.trim()} để xem lại, làm đề mới và dùng Ôn tập câu sai.
        </p>
        <Link className="student-intelligence-button student-intelligence-button--primary" to="/hoc-sinh">
          Vào trang học sinh
        </Link>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="student-intelligence-guest-save is-done" id={id}>
        <span className="student-intelligence-kicker">Sắp xong</span>
        <h3 className="student-intelligence-guest-save-title">Em mở email {email.trim()} và bấm link xác nhận nhé.</h3>
        <p className="student-intelligence-guest-save-text">Bấm xong là bài này được lưu vào tài khoản. Đừng xoá dữ liệu trình duyệt trước lúc đó.</p>
      </div>
    );
  }

  return (
    <div className="student-intelligence-guest-save" id={id}>
      <span className="student-intelligence-kicker">Lưu hồ sơ · miễn phí</span>
      <h3 className="student-intelligence-guest-save-title">Lưu lại để không mất báo cáo này</h3>
      <p className="student-intelligence-guest-save-text">
        Hiện em đang ở chế độ khách: báo cáo chỉ xem lại được trên đúng trình duyệt này. Tạo tài khoản để giữ bài vừa
        làm, mở Ôn tập câu sai, và để các đề sau gộp thành một hồ sơ năng lực.
      </p>
      <form className="student-intelligence-guest-save-form" onSubmit={handleSubmit} noValidate>
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          <span>Mật khẩu</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
        </label>
        <button type="submit" className="student-intelligence-button student-intelligence-button--primary" disabled={status === "saving"}>
          {status === "saving" ? "Đang lưu…" : "Lưu hồ sơ"}
        </button>
      </form>
      {error && (
        <p className="student-intelligence-guest-save-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
