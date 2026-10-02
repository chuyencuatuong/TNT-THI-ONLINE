import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { VIETNAM_PROVINCES } from "../lib/vietnamProvinces";

/**
 * Bước "nhập thông tin cơ bản" của KHÁCH sau khi nộp bài đề công khai
 * (02/10/2026, migration_023). Bắt buộc trước khi xem kết quả — đây là
 * chỗ TNT biết ai đã làm đề (họ tên, trường, tỉnh/thành, lớp; email tuỳ
 * chọn). Tài khoản có sẵn (không phải khách) thì đi thẳng tới kết quả.
 */
export function GuestInfoPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { profile, reloadProfile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name && profile.full_name !== "Khách" ? profile.full_name : "");
  const [schoolName, setSchoolName] = useState(profile?.school_name ?? "");
  const [province, setProvince] = useState(profile?.province ?? "");
  const [classLabel, setClassLabel] = useState(profile?.class_label ?? "");
  const [email, setEmail] = useState(profile?.contact_email ?? "");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!attemptId) return <Navigate to="/thi" replace />;
  if (profile && (!profile.is_guest || profile.info_completed_at)) {
    return <Navigate to={`/ket-qua/${attemptId}`} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    if (fullName.trim().length < 2) return setError("Em nhập họ và tên giúp thầy nhé.");
    if (!schoolName.trim()) return setError("Em nhập tên trường nhé.");
    if (!province) return setError("Em chọn tỉnh/thành nhé.");
    if (!classLabel.trim()) return setError("Em nhập lớp nhé, ví dụ 12A1.");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Email chưa đúng định dạng.");
    if (!consent) return setError("Em đánh dấu ô đồng ý ở cuối để xem kết quả nhé.");
    setSaving(true);
    try {
      await api.updateGuestInfo(profile.id, {
        fullName,
        schoolName,
        province,
        classLabel,
        contactEmail: email.trim() || null,
      });
      await reloadProfile();
      navigate(`/ket-qua/${attemptId}`, { replace: true });
    } catch (err) {
      console.error(err);
      setError("Chưa lưu được thông tin. Em kiểm tra mạng rồi thử lại nhé.");
      setSaving(false);
    }
  }

  return (
    <div className="auth-page guest-info-page">
      <div className="guest-info-badge">Đã nộp bài</div>
      <h2>Còn một bước nữa là xem báo cáo</h2>
      <p className="guest-info-lede">
        Báo cáo của em đã chấm xong. Em điền vài thông tin để thầy biết bài này của ai nhé.
      </p>
      <form onSubmit={handleSubmit} className="auth-form guest-info-form" noValidate>
        <label className="field-label">
          Họ và tên
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={120} required />
        </label>
        <label className="field-label">
          Trường
          <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="vd: THPT Châu Văn Liêm" maxLength={160} required />
        </label>
        <div className="guest-info-row">
          <label className="field-label">
            Tỉnh / Thành phố
            <select value={province} onChange={(e) => setProvince(e.target.value)} required>
              <option value="">— Chọn —</option>
              {VIETNAM_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Lớp
            <input type="text" value={classLabel} onChange={(e) => setClassLabel(e.target.value)} placeholder="vd: 12A1" maxLength={40} required />
          </label>
        </div>
        <label className="field-label">
          <span>
            Email <span className="guest-info-optional">không bắt buộc</span>
          </span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} />
        </label>
        <label className="guest-info-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Em đồng ý để Toán học TNT lưu các thông tin này cùng bài làm, dùng để gửi báo cáo và thống kê học tập. Thông
            tin không hiện công khai với ai.
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Đang lưu…" : "Xem kết quả"}
        </button>
      </form>
    </div>
  );
}
