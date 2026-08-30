import { useEffect, useState } from "react";
import * as api from "../lib/api";
import {
  countSessionsThisMonth,
  countSessionsToday,
  FOCUS_MINUTES_DEFAULT,
  formatClock,
  gardenSlots,
  getLevelProgress,
  sumFocusMinutes,
} from "../lib/pomodoro";
import type { PomodoroSessionRow } from "../lib/types";

const FOCUS_SECONDS_DEFAULT = FOCUS_MINUTES_DEFAULT * 60;

const PotIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3e6259" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 20h8l-1.1-6.5H9.1L8 20Z" />
    <path d="M12 13.5V7" />
    <path d="M12 8c0-3 2.8-4.2 5-4.2-.6 3-2.3 5-5 4.2Z" />
    <path d="M12 10.5c0-2.3-2.3-3.3-4.3-3.3.4 2.3 1.8 3.7 4.3 3.3Z" />
  </svg>
);

const EmptyPotIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8ddc9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 20h8l-1.1-6.5H9.1L8 20Z" />
  </svg>
);

/**
 * Đồng hồ tập trung Pomodoro kiểu "vườn cây" — mỗi phiên 25 phút hoàn thành
 * TRỌN VẸN (không bấm đặt lại giữa chừng) mới tính 1 "cây" và ghi vào DB
 * (pomodoro_sessions). Cấp độ + số cây hôm nay/tháng này đều tính lại từ danh
 * sách phiên mỗi lần render — xem src/lib/pomodoro.ts.
 *
 * Cố tình KHÔNG so sánh với học sinh khác (đã chốt ở mục 19.4 tài liệu đề
 * xuất) — cấp độ chỉ dựa trên lịch sử của chính học sinh đang đăng nhập.
 */
export function PomodoroGarden({ studentId }: { studentId: string }) {
  const [sessions, setSessions] = useState<PomodoroSessionRow[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(FOCUS_SECONDS_DEFAULT);
  const [running, setRunning] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    api.listPomodoroSessions(studentId).then(setSessions);
  }, [studentId]);

  useEffect(() => {
    if (!running) return;
    if (remainingSeconds <= 0) {
      setRunning(false);
      void completeSession();
      return;
    }
    const id = window.setTimeout(() => setRemainingSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remainingSeconds]);

  async function completeSession() {
    try {
      const row = await api.recordPomodoroSession(studentId, FOCUS_MINUTES_DEFAULT);
      setSessions((prev) => [row, ...prev]);
      setSaveError(false);
    } catch {
      setSaveError(true);
    } finally {
      setRemainingSeconds(FOCUS_SECONDS_DEFAULT);
    }
  }

  function handleReset() {
    setRunning(false);
    setRemainingSeconds(FOCUS_SECONDS_DEFAULT);
  }

  const todayCount = countSessionsToday(sessions);
  const monthCount = countSessionsThisMonth(sessions);
  const monthMinutes = sumFocusMinutes(
    sessions.filter((s) => {
      const d = new Date(s.completed_at);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }),
  );
  const todayMinutes = sumFocusMinutes(
    sessions.filter((s) => {
      const d = new Date(s.completed_at);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }),
  );
  const garden = gardenSlots(todayCount);
  const level = getLevelProgress(sessions.length);

  return (
    <div className="pomodoro-card hover-card">
      <div className="pomodoro-header">
        <div>
          <div className="pomodoro-eyebrow">Đồng hồ tập trung</div>
          <div className="pomodoro-title">Phương pháp Pomodoro</div>
        </div>
        <div className="pomodoro-level-badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v3M12 19v3M5 5l2 2M17 17l2 2M2 12h3M19 12h3M5 19l2-2M17 7l2-2" />
          </svg>
          Cấp {level.level} · {level.name}
        </div>
      </div>

      <div className="pomodoro-body">
        <div className="pomodoro-clock-block">
          <div className="pomodoro-clock">{formatClock(remainingSeconds)}</div>
          <div className="pomodoro-controls">
            <button
              type="button"
              className="pomodoro-btn-circle pomodoro-btn-circle--primary"
              onClick={() => setRunning((r) => !r)}
              aria-label={running ? "Tạm dừng" : "Bắt đầu"}
            >
              {running ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" />
                  <rect x="14" y="5" width="4" height="14" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="pomodoro-btn-circle pomodoro-btn-circle--ghost"
              onClick={handleReset}
              aria-label="Đặt lại"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 1 3 6.7" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="pomodoro-divider" />

        <div className="pomodoro-garden">
          <div className="pomodoro-garden-header">
            <span style={{ fontWeight: 600, color: "var(--color-text)" }}>Vườn hôm nay</span>
            <span className="empty-hint">
              {todayCount} cây · {todayMinutes} phút
            </span>
          </div>
          <div className="pomodoro-garden-row">
            {Array.from({ length: garden.grown }).map((_, i) => (
              <div key={`grown-${i}`} className="pomodoro-pot pomodoro-pot--grown">
                {PotIcon}
              </div>
            ))}
            {Array.from({ length: garden.empty }).map((_, i) => (
              <div key={`empty-${i}`} className="pomodoro-pot pomodoro-pot--empty">
                {EmptyPotIcon}
              </div>
            ))}
            {garden.extra > 0 && (
              <div className="pomodoro-pot pomodoro-pot--grown" style={{ fontSize: 11, fontWeight: 700, color: "var(--color-pine-text)" }}>
                +{garden.extra}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pomodoro-footer">
        <div className="pomodoro-footer-row">
          <div>
            {level.treesToNextLevel === null ? (
              <span>Đã đạt cấp cao nhất — tiếp tục giữ phong độ nhé!</span>
            ) : (
              <span>
                Còn {level.treesToNextLevel} cây nữa để lên <strong>Cấp {level.level + 1} · {level.nextLevelName}</strong>
              </span>
            )}
          </div>
          <div className="empty-hint">
            Tháng này: {monthCount} cây · {Math.round(monthMinutes / 60)} giờ tập trung
          </div>
        </div>
        <div className="pomodoro-progress-track">
          {/* transform: scaleX() thay vì width % (audit "impeccable" 27/08/2026)
              — xem ghi chú .pomodoro-progress-fill trong styles.css. */}
          <div className="pomodoro-progress-fill" style={{ transform: `scaleX(${level.progressRatio})` }} />
        </div>
        {saveError && (
          <div className="music-error">
            Không lưu được phiên vừa hoàn thành (mất kết nối?) — cây lần này chưa được tính.
          </div>
        )}
      </div>
    </div>
  );
}
