import { useEffect, useState } from "react";

/**
 * Mốc thi Tốt nghiệp THPT 2027 — buổi thi đầu tiên 07:30 sáng 11/06/2027
 * (theo giờ Việt Nam, UTC+7). Đây là NGÀY DO NGƯỜI DÙNG CUNG CẤP, không phải
 * lịch chính thức từ Bộ GD&ĐT — chỉnh lại constant này khi có lịch thi chính
 * thức của năm học liên quan.
 */
const EXAM_TARGET = new Date("2027-06-11T07:30:00+07:00");
const EXAM_LABEL = "Kỳ thi Tốt nghiệp THPT 2027";

function daysRemaining(target: Date, now: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function ExamCountdown() {
  const [days, setDays] = useState(() => daysRemaining(EXAM_TARGET, new Date()));

  useEffect(() => {
    // Chỉ hiển thị theo ngày nên không cần cập nhật liên tục — kiểm tra lại
    // mỗi phút là đủ để số ngày tự giảm đúng lúc qua nửa đêm mà không cần load
    // lại trang, không cần thiết phải cập nhật theo giây.
    const id = window.setInterval(() => {
      setDays(daysRemaining(EXAM_TARGET, new Date()));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="countdown-card hover-card">
      <div className="countdown-eyebrow">Đếm ngược kỳ thi</div>
      {days > 0 ? (
        <>
          <div className="countdown-number-row">
            <div className="countdown-number">{days}</div>
            <div className="countdown-unit">ngày nữa</div>
          </div>
          <div className="countdown-title">{EXAM_LABEL}</div>
          <div className="countdown-note">Buổi thi đầu tiên 07:30, 11/06/2027.</div>
        </>
      ) : days === 0 ? (
        <>
          <div className="countdown-number-row">
            <div className="countdown-number">Hôm nay!</div>
          </div>
          <div className="countdown-title">{EXAM_LABEL}</div>
          <div className="countdown-note">Chúc em thi thật tốt.</div>
        </>
      ) : (
        <>
          <div className="countdown-title">{EXAM_LABEL} đã diễn ra</div>
          <div className="countdown-note">Cập nhật lại mốc thi mới khi có lịch năm sau.</div>
        </>
      )}
    </div>
  );
}
