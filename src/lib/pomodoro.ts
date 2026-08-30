/**
 * Logic thuần (không phụ thuộc DB/mạng) cho "Đồng hồ tập trung Pomodoro kiểu
 * vườn cây" — mỗi phiên tập trung hoàn thành (không bấm huỷ giữa chừng) tính
 * là 1 "cây". Cấp độ + số cây hôm nay/tháng này đều được TÍNH LẠI từ danh
 * sách phiên thô (pomodoro_sessions) ở đây, không lưu số đã tính sẵn ở DB, để
 * không bao giờ bị lệch dữ liệu (xem migration_009).
 *
 * Cấp độ dựa trên TỔNG số cây từ trước tới giờ (không phải theo tháng) — leo
 * cấp là thành tích tích luỹ lâu dài, không bị "reset" mỗi tháng.
 *
 * CỐ TÌNH không so sánh học sinh này với học sinh khác (đã chốt trong tài
 * liệu đề xuất, mục 19.4) — toàn bộ cấp độ/tiến độ ở đây chỉ dựa trên chính
 * lịch sử của người đó.
 */

export const FOCUS_MINUTES_DEFAULT = 25;

/** Số ô "chậu cây" hiển thị cho 1 ngày trên giao diện — không giới hạn số
 * phiên học sinh thực sự có thể hoàn thành trong ngày, chỉ giới hạn số ô vẽ
 * ra (phiên vượt quá số này vẫn được tính vào mọi thống kê khác). */
export const DAILY_GARDEN_GOAL = 6;

export interface PomodoroLevel {
  level: number;
  name: string;
  minTrees: number;
}

/** Mốc cấp độ theo tổng số cây tích luỹ. Có thể chỉnh lại mốc/thêm cấp sau
 * này mà không ảnh hưởng logic tính (getLevelProgress luôn suy ra từ mảng này). */
export const POMODORO_LEVELS: PomodoroLevel[] = [
  { level: 1, name: "Người mới bắt đầu", minTrees: 0 },
  { level: 2, name: "Người gieo hạt", minTrees: 8 },
  { level: 3, name: "Người ươm mầm", minTrees: 20 },
  { level: 4, name: "Người trồng rừng", minTrees: 40 },
  { level: 5, name: "Người giữ rừng", minTrees: 80 },
  { level: 6, name: "Bậc thầy tập trung", minTrees: 150 },
];

export interface LevelProgress {
  level: number;
  name: string;
  nextLevelName: string | null;
  /** Số cây còn thiếu để lên cấp tiếp theo — null nếu đã ở cấp cao nhất. */
  treesToNextLevel: number | null;
  /** Tỉ lệ tiến độ (0-1) trong khoảng cấp hiện tại -> cấp tiếp theo. */
  progressRatio: number;
}

export function getLevelProgress(totalTrees: number): LevelProgress {
  let currentIndex = 0;
  for (let i = 0; i < POMODORO_LEVELS.length; i++) {
    if (totalTrees >= POMODORO_LEVELS[i].minTrees) currentIndex = i;
  }
  const current = POMODORO_LEVELS[currentIndex];
  const next = POMODORO_LEVELS[currentIndex + 1] ?? null;
  const treesToNextLevel = next ? Math.max(0, next.minTrees - totalTrees) : null;
  const progressRatio = next
    ? Math.min(1, Math.max(0, (totalTrees - current.minTrees) / (next.minTrees - current.minTrees)))
    : 1;
  return {
    level: current.level,
    name: current.name,
    nextLevelName: next?.name ?? null,
    treesToNextLevel,
    progressRatio,
  };
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameLocalMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export interface PomodoroSessionLike {
  completed_at: string;
  focus_minutes: number;
}

/** Số phiên hoàn thành hôm nay (theo giờ máy học sinh đang dùng). */
export function countSessionsToday(
  sessions: PomodoroSessionLike[],
  now: Date = new Date(),
): number {
  return sessions.filter((s) => isSameLocalDay(new Date(s.completed_at), now)).length;
}

/** Số phiên hoàn thành trong tháng hiện tại. */
export function countSessionsThisMonth(
  sessions: PomodoroSessionLike[],
  now: Date = new Date(),
): number {
  return sessions.filter((s) => isSameLocalMonth(new Date(s.completed_at), now)).length;
}

export function sumFocusMinutes(sessions: PomodoroSessionLike[]): number {
  return sessions.reduce((sum, s) => sum + s.focus_minutes, 0);
}

export interface GardenSlots {
  /** Số chậu đã "nở cây" hiển thị (tối đa DAILY_GARDEN_GOAL). */
  grown: number;
  /** Số chậu còn trống (chưa tập trung buổi nào cho ô đó). */
  empty: number;
  /** Số phiên vượt quá số ô hiển thị trong ngày (vẫn được tính, chỉ không vẽ thêm ô). */
  extra: number;
}

export function gardenSlots(completedToday: number, goal: number = DAILY_GARDEN_GOAL): GardenSlots {
  const grown = Math.min(completedToday, goal);
  const extra = Math.max(0, completedToday - goal);
  const empty = Math.max(0, goal - completedToday);
  return { grown, empty, extra };
}

/** Định dạng "24:12" (mm:ss) từ số giây còn lại — dùng cho mặt đồng hồ. */
export function formatClock(remainingSeconds: number): string {
  const s = Math.max(0, Math.round(remainingSeconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
