export type Role = "teacher" | "student";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  student_class: string | null;
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
  difficulty: Difficulty | null;
  content_latex: string;
  image_url: string | null;
  options: Part1Options | Part2Options | Record<string, never>;
  correct_answer: Part1Answer | Part2Answer | Part3Answer;
  default_points: number | null;
  ai_suggested_type_id: string | null;
  ai_suggestion_confirmed: boolean;
  created_by: string;
  created_at: string;
}

export interface ExamRow {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
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

/** Cấu trúc đề mặc định theo định dạng minh hoạ hiện hành (có thể chỉnh trong lúc tạo đề). */
export const DEFAULT_EXAM_STRUCTURE = {
  part1: { count: 12, pointsPerQuestion: 0.25 }, // 3.0 điểm
  part2: { count: 4 }, // chấm theo barem số ý đúng, tối đa 1.0đ/câu = 4.0 điểm
  part3: { count: 6, pointsPerQuestion: 0.5 }, // 3.0 điểm
};
