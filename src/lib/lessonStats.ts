/**
 * Gộp thống kê độ chính xác theo BÀI (lessons, theo PPCT — migration_016) cho
 * drilldown Chương -> Bài ở dashboard tổng quan giáo viên. Cùng nguyên tắc
 * với chapterStats.ts (hàm thuần, không phụ thuộc DB/mạng, test độc lập —
 * lớp gọi Supabase là api.ts, chỉ lấy dữ liệu thô rồi gọi các hàm ở đây để
 * gộp/tính toán).
 *
 * KHÁC với lúc chapterStats.ts được viết (24/08/2026, khi đó "dạng bài" chưa
 * có dữ liệu thật): Bài giờ được gán qua AI gợi ý khi nhập đề (ai.ts
 * matchLessonByName, xem TeacherExamImport.tsx) nên có dữ liệu thật để vẽ —
 * dùng làm lớp chi tiết hơn CHƯƠNG, giáo viên bấm vào 1 chương ở biểu đồ
 * chính để xem tiếp breakdown theo từng Bài trong chương đó.
 */

export interface LessonStat {
  lesson_id: string;
  lesson_name: string;
  /** Chương chứa Bài này — dùng để lọc breakdown theo đúng 1 chương đang xem. */
  topic_id: string;
  total: number;
  correctScore: number;
  maxScore: number;
}

/** Gộp thống kê theo Bài của NHIỀU học sinh thành 1 bộ thống kê "cả lớp". */
export function mergeLessonStats(perStudent: LessonStat[][]): LessonStat[] {
  const map = new Map<string, LessonStat>();
  for (const stats of perStudent) {
    for (const s of stats) {
      const existing = map.get(s.lesson_id) ?? {
        lesson_id: s.lesson_id,
        lesson_name: s.lesson_name,
        topic_id: s.topic_id,
        total: 0,
        correctScore: 0,
        maxScore: 0,
      };
      existing.total += s.total;
      existing.correctScore += s.correctScore;
      existing.maxScore += s.maxScore;
      map.set(s.lesson_id, existing);
    }
  }
  return Array.from(map.values());
}

/** % độ chính xác (0-100, làm tròn 1 chữ số thập phân) — null nếu chưa có dữ liệu (maxScore = 0), tránh chia cho 0. Dùng chung công thức với chapterStats.ts accuracyPercent. */
export function lessonAccuracyPercent(stat: Pick<LessonStat, "correctScore" | "maxScore">): number | null {
  if (stat.maxScore <= 0) return null;
  return Math.round((stat.correctScore / stat.maxScore) * 1000) / 10;
}

/** Cắt ngắn tên Bài dài để làm nhãn trục Y cho biểu đồ ngang — cùng lý do/cách làm với truncateChapterLabel (chapterStats.ts). Tên đầy đủ vẫn xem qua Tooltip. */
export function truncateLessonLabel(name: string, maxChars = 22): string {
  const trimmed = name.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export interface LessonComparisonRow {
  lesson_id: string;
  lesson_name: string;
  topic_id: string;
  /** null = học sinh này chưa làm câu nào thuộc Bài đó (không phải 0%, tránh gây hiểu nhầm là làm sai hết). */
  studentAccuracy: number | null;
  classAccuracy: number | null;
}

/**
 * Ghép thống kê cả lớp + (không bắt buộc) 1 học sinh đang chọn thành các
 * dòng để vẽ biểu đồ so sánh theo Bài — chỉ giữ Bài mà CẢ LỚP đã có ít nhất 1
 * câu (maxScore > 0), và CHỈ trong phạm vi 1 chương đang xem (topicId) — đây
 * là bước "bấm vào 1 cột Chương để xem breakdown theo Bài", không hiện hết
 * mọi Bài của mọi chương cùng lúc.
 */
export function buildLessonComparisonRows(
  classStats: LessonStat[],
  studentStats: LessonStat[] | null,
  topicId: string,
): LessonComparisonRow[] {
  const studentByLesson = new Map((studentStats ?? []).map((s) => [s.lesson_id, s]));
  return classStats
    .filter((c) => c.topic_id === topicId && c.maxScore > 0)
    .map((c) => {
      const studentStat = studentStats ? studentByLesson.get(c.lesson_id) ?? null : null;
      return {
        lesson_id: c.lesson_id,
        lesson_name: c.lesson_name,
        topic_id: c.topic_id,
        classAccuracy: lessonAccuracyPercent(c),
        studentAccuracy: studentStats
          ? lessonAccuracyPercent(studentStat ?? { correctScore: 0, maxScore: 0 })
          : null,
      };
    });
}
