export type Role = "teacher" | "student";

export type Gender = "nam" | "nu" | "khac";

export const GENDER_LABELS: Record<Gender, string> = {
  nam: "Nam",
  nu: "Nữ",
  khac: "Khác",
};

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  student_class: string | null;
  /** Thêm 24/08/2026 (migration_011) — thu thập lần đầu đăng nhập, chỉ áp
   * dụng cho học sinh (xem LoginPage.tsx "Hoàn tất hồ sơ"). Đều nullable vì
   * hồ sơ tạo trước migration này không có các trường này. */
  date_of_birth: string | null;
  phone: string | null;
  school_name: string | null;
  gender: Gender | null;
  province: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  name: string;
  chapter: string | null;
  grade: 10 | 11 | 12;
  created_at: string;
}

export interface QuestionType {
  id: string;
  topic_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export type Difficulty =
  | "nhan_biet"
  | "thong_hieu"
  | "van_dung"
  | "van_dung_cao";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  nhan_biet: "Nhận biết",
  thong_hieu: "Thông hiểu",
  van_dung: "Vận dụng",
  van_dung_cao: "Vận dụng cao",
};

export interface Part1Options {
  choices: { A: string; B: string; C: string; D: string };
}
export interface Part2Options {
  items: { a: string; b: string; c: string; d: string };
}
export interface Part1Answer {
  choice: "A" | "B" | "C" | "D";
}
export interface Part2Answer {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
}
export interface Part3Answer {
  value: string;
}

export interface QuestionRow {
  id: string;
  part: 1 | 2 | 3;
  question_type_id: string | null;
  /** Chương (topics.id) — tách riêng khỏi question_type_id vì khung "dạng bài" chưa phủ hết mọi chương. */
  topic_id: string | null;
  /** Gợi ý chương của AI khi nhập đề/bấm "Gợi ý bằng AI" — chờ giáo viên xác nhận vào topic_id. */
  ai_suggested_topic_id: string | null;
  difficulty: Difficulty | null;
  content_latex: string;
  image_url: string | null;
  options: Part1Options | Part2Options | Record<string, never>;
  correct_answer: Part1Answer | Part2Answer | Part3Answer;
  /** Lời giải chi tiết (LaTeX) — chỉ hiển thị cho học sinh SAU khi nộp bài, xem QuestionReview.tsx. */
  solution_latex: string | null;
  default_points: number | null;
  ai_suggested_type_id: string | null;
  ai_suggestion_confirmed: boolean;
  source: "manual" | "word_import";
  created_by: string;
  created_at: string;
}

/** Thư mục/tuyển tập ('folder') và chương trình/kỳ thi ('term') — 2 danh sách
 * do giáo viên tự quản lý (thêm/sửa tên), dùng chung 1 bảng vì cùng cấu trúc.
 */
export type ExamTagKind = "folder" | "term";

export interface ExamTag {
  id: string;
  kind: ExamTagKind;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ExamRow {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  /** Khối lớp của đề (10/11/12) — không bắt buộc, dùng để lọc ở Kho đề. */
  grade: 10 | 11 | 12 | null;
  /** Thư mục/tuyển tập chứa đề (exam_tags kind='folder') — null = "Chưa phân loại". */
  folder_id: string | null;
  /** Chương trình/kỳ thi (exam_tags kind='term', vd GK1/CK1...) — không bắt buộc. */
  term_id: string | null;
  /** Link Google Drive chứa file đề gốc để học sinh tải về — không bắt buộc. */
  drive_link: string | null;
  /** "thoai_mai" (mặc định, luyện tập bình thường) hoặc "nghiem_tuc" (bắt buộc
   * toàn màn hình, cảnh báo trước, tự huỷ bài nếu rời trang quá số lần cho
   * phép — xem src/lib/proctoring.ts). */
  mode: "thoai_mai" | "nghiem_tuc";
  /** Đề "được chỉ định" (giao đúng giờ) — null = đề mở tự do như bình thường.
   * Trước giờ này, học sinh không bấm vào làm bài được (chặn cả ở client lẫn
   * server — xem trigger check_exam_assignment_window trong migration_010). */
  assigned_unlock_at: string | null;
  /** Sau giờ này (nếu có) học sinh không thể bắt đầu lượt làm mới nữa. */
  assigned_lock_at: string | null;
  created_by: string;
  created_at: string;
}

/** Đề có thể thuộc nhiều chương (topics) — giáo viên tự chọn lúc nhập đề, dùng
 * để lọc ở Kho đề. Tách biệt với questions.topic_id (chương của từng câu). */
export interface ExamTopicRow {
  exam_id: string;
  topic_id: string;
}

/** Nhật ký câu sai kiểu Leitner — xem src/lib/leitner.ts cho logic đếm streak. */
export interface WrongAnswerJournalRow {
  id: string;
  student_id: string;
  question_id: string;
  first_wrong_at: string;
  last_wrong_at: string;
  correct_streak: number;
  last_reviewed_session_id: string | null;
  retired_at: string | null;
  created_at: string;
}

/** 1 buổi ôn tập câu sai — mỗi lần học sinh mở màn hình ôn tập là 1 buổi mới,
 * dùng để đếm "3 buổi RIÊNG BIỆT liên tiếp" (không phải 3 lần trong 1 buổi). */
export interface ReviewSessionRow {
  id: string;
  student_id: string;
  started_at: string;
  finished_at: string | null;
}

export interface QuestionViewEventRow {
  id: number;
  attempt_id: string;
  question_id: string;
  event_type: "enter" | "leave";
  created_at: string;
}

export interface ExamQuestionRow {
  exam_id: string;
  question_id: string;
  order_index: number;
  part: 1 | 2 | 3;
}

export interface ExamAttemptRow {
  id: string;
  exam_id: string;
  student_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  /** true = bài đã bị tự động huỷ do vi phạm giám sát (rời trang/thoát toàn
   * màn hình quá số lần cho phép ở đề chế độ "nghiêm túc") — điểm vẫn được
   * chấm và lưu lại để giáo viên xem, chỉ đánh dấu để không coi là hợp lệ. */
  invalidated: boolean;
  invalidated_reason: string | null;
}

/** 1 dấu hiệu giám sát được ghi lại trong lúc học sinh làm bài — xem
 * proctoring_events trong migration_004/010 và src/lib/proctoring.ts. */
export interface ProctoringEventRow {
  id: number;
  attempt_id: string;
  event_type:
    | "tab_hidden"
    | "tab_visible"
    | "window_blur"
    | "window_focus"
    | "fullscreen_exit"
    | "copy_attempt"
    | "paste_attempt";
  created_at: string;
}

export interface QuestionResponseRow {
  id: string;
  attempt_id: string;
  question_id: string;
  final_answer: unknown;
  score: number;
  sub_correct_count: number | null;
  time_spent_seconds: number;
  change_count: number;
  first_response_at: string | null;
  last_response_at: string | null;
}

export interface AttemptScoreRow {
  attempt_id: string;
  part1_score: number;
  part2_score: number;
  part3_score: number;
  total_score: number;
  computed_at: string;
}

export interface ReportRow {
  id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  summary_text: string | null;
  chart_data: unknown;
  share_token: string;
  generated_at: string;
}

/** 1 phiên Pomodoro đã hoàn thành (không tính phiên bị huỷ giữa chừng) — xem
 * src/lib/pomodoro.ts để biết cách tính cấp độ/số cây hôm nay/tháng này từ
 * danh sách các dòng này. */
export interface PomodoroSessionRow {
  id: string;
  student_id: string;
  focus_minutes: number;
  completed_at: string;
}

/** 1 trong tối đa 3 playlist YouTube yêu thích của học sinh (Góc âm nhạc) —
 * `position` cố định 0/1/2 để hiển thị đúng thứ tự đã sắp. */
export interface StudentPlaylistRow {
  id: string;
  student_id: string;
  position: 0 | 1 | 2;
  label: string;
  url: string;
  created_at: string;
}

/** Cấu trúc đề mặc định theo định dạng minh hoạ hiện hành (có thể chỉnh trong lúc tạo đề). */
export const DEFAULT_EXAM_STRUCTURE = {
  part1: { count: 12, pointsPerQuestion: 0.25 }, // 3.0 điểm
  part2: { count: 4 }, // chấm theo barem số ý đúng, tối đa 1.0đ/câu = 4.0 điểm
  part3: { count: 6, pointsPerQuestion: 0.5 }, // 3.0 điểm
};
