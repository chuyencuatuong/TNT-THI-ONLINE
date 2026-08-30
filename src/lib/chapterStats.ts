/**
 * Gộp thống kê độ chính xác theo CHƯƠNG (topics, không phải "dạng bài"
 * question_types) cho dashboard tổng quan giáo viên (mục 19.4 — Đợt 3).
 *
 * Cố tình dùng CHƯƠNG thay vì "dạng bài": theo mục 14 tài liệu đề xuất,
 * "dạng bài chi tiết" (question_types) chưa được giáo viên nhập/dùng thật
 * (chỉ mới gieo sẵn khung CHƯƠNG ở mục 14, còn dạng bài để làm sau) — nếu
 * gộp theo dạng bài như `getStudentTopicStats`/`diagnoseAllTopics` đã có
 * (dùng cho ResultPage sau khi nộp bài), biểu đồ dashboard này nhiều khả
 * năng sẽ trống trơn vì hầu hết câu hỏi chưa có question_type_id. CHƯƠNG
 * (topic_id) thì đã được gán khá đầy đủ từ Đợt 1 (mục 19 — AI tự gợi ý +
 * giáo viên xác nhận khi nhập đề), nên dùng chương làm trục thống kê chính
 * cho dashboard tổng quan này sẽ có dữ liệu thật để hiển thị ngay.
 *
 * Toàn bộ hàm ở đây là hàm thuần — không phụ thuộc DB/mạng — để test độc
 * lập; lớp gọi Supabase (api.ts) chỉ chịu trách nhiệm lấy dữ liệu thô rồi
 * gọi các hàm này để gộp/tính toán.
 */

export interface ChapterStat {
  topic_id: string;
  topic_name: string;
  total: number;
  correctScore: number;
  maxScore: number;
}

/** Gộp thống kê theo chương của NHIỀU học sinh thành 1 bộ thống kê "cả lớp". */
export function mergeChapterStats(perStudent: ChapterStat[][]): ChapterStat[] {
  const map = new Map<string, ChapterStat>();
  for (const stats of perStudent) {
    for (const s of stats) {
      const existing = map.get(s.topic_id) ?? {
        topic_id: s.topic_id,
        topic_name: s.topic_name,
        total: 0,
        correctScore: 0,
        maxScore: 0,
      };
      existing.total += s.total;
      existing.correctScore += s.correctScore;
      existing.maxScore += s.maxScore;
      map.set(s.topic_id, existing);
    }
  }
  return Array.from(map.values());
}

/** % độ chính xác (0-100, làm tròn 1 chữ số thập phân) — null nếu chưa có dữ liệu (maxScore = 0), tránh chia cho 0. */
export function accuracyPercent(stat: Pick<ChapterStat, "correctScore" | "maxScore">): number | null {
  if (stat.maxScore <= 0) return null;
  return Math.round((stat.correctScore / stat.maxScore) * 1000) / 10;
}

/**
 * Cắt ngắn tên chương dài (tiếng Việt thường khá dài) để làm nhãn trục Y cho
 * các biểu đồ ngang — sửa lỗi "chữ chồng chữ" khi tên tràn khỏi vùng
 * `YAxis` đã cấp (width cố định 150-160px) và đè lên cột biểu đồ. Tên đầy đủ
 * vẫn xem được qua Tooltip của biểu đồ (đã có sẵn ở mọi nơi dùng hàm này) —
 * hàm này CHỈ cắt nhãn hiển thị, không đổi dữ liệu gốc.
 */
export function truncateChapterLabel(name: string, maxChars = 18): string {
  const trimmed = name.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export interface ComparisonRow {
  topic_id: string;
  topic_name: string;
  /** null = học sinh này chưa làm câu nào thuộc chương đó (không phải 0%, tránh gây hiểu nhầm là làm sai hết). */
  studentAccuracy: number | null;
  classAccuracy: number | null;
}

/**
 * Ghép thống kê cả lớp + (không bắt buộc) 1 học sinh đang chọn thành các
 * dòng để vẽ biểu đồ so sánh — chỉ giữ chương mà CẢ LỚP đã có ít nhất 1 câu
 * (maxScore > 0), bỏ qua chương chưa ai làm để đỡ rối biểu đồ.
 */
export function buildComparisonRows(
  classStats: ChapterStat[],
  studentStats: ChapterStat[] | null,
): ComparisonRow[] {
  const studentByTopic = new Map((studentStats ?? []).map((s) => [s.topic_id, s]));
  return classStats
    .filter((c) => c.maxScore > 0)
    .map((c) => {
      const studentStat = studentStats ? studentByTopic.get(c.topic_id) ?? null : null;
      return {
        topic_id: c.topic_id,
        topic_name: c.topic_name,
        classAccuracy: accuracyPercent(c),
        studentAccuracy: studentStats
          ? accuracyPercent(studentStat ?? { correctScore: 0, maxScore: 0 })
          : null,
      };
    });
}
