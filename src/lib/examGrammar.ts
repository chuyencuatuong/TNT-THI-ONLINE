/**
 * PHASE 1 (thêm 01/09/2026) — tách cấu trúc đề (Phần/Câu/đáp án A-B-C-D hoặc
 * a-b-c-d) TRỰC TIẾP từ văn bản thật của PDF (pdf.js), KHÔNG dùng AI. Đây là
 * bước "parser-first" theo hướng đã chốt với Thầy Tường sau khi đối chiếu
 * nghiên cứu Azota (xem danh-gia-de-xuat-azota-chatgpt-v1.md mục G): thay vì
 * để Gemini tự dò tìm ranh giới từng câu, code tự làm việc này trước (rẻ,
 * nhanh, không tốn token) — Gemini chỉ còn phải điền công thức/đáp án cho
 * từng câu ĐÃ được xác định sẵn.
 *
 * Toàn bộ hàm ở đây là hàm THUẦN (chỉ nhận text, không đụng DOM/pdf.js/mạng)
 * để unit-test được, đúng quy ước đã có của dự án (xem chunk.ts,
 * concurrency.ts, importBenchmark.ts).
 *
 * GIỚI HẠN CẦN BIẾT (đã bàn với Thầy Tường, không phải phát hiện mới):
 * chữ A, B, C, D cũng rất hay được dùng để đặt tên điểm/đỉnh trong bài Hình
 * học ("cho tam giác ABC", "điểm A(1;2;3)"...), nên KHÔNG thể tin chắc 100%
 * chỉ vì thấy các chữ này xuất hiện. Cách giảm rủi ro: (1) chỉ nhận nhãn dạng
 * "A." hoặc "A)" ngay sau chữ cái — KHÔNG khớp "A(" (cách viết toạ độ điểm
 * phổ biến, xem findLastOrderedLabelRun), (2) bắt buộc tìm đủ CẢ 4 nhãn theo
 * ĐÚNG THỨ TỰ A→B→C→D (hoặc a→b→c→d), lấy lần xuất hiện SAU CÙNG của mỗi
 * nhãn — vì đáp án luôn nằm ở cuối câu, nên phần thân câu hỏi (có thể nhắc
 * điểm A, B... ở đầu) sẽ không "che" được nhãn đáp án thật ở cuối. Trường hợp
 * không tìm đủ/đúng thứ tự → structureConfident = false CHO CẢ ĐỀ (an toàn:
 * quay lại hành vi hiện tại, để Gemini tự đọc như trước, không có rủi ro mất
 * độ chính xác).
 */

export type ExamPartKey = "part1" | "part2" | "part3";

export interface StructurePage {
  pageNumber: number;
  pageText: string;
}

export interface DetectedQuestion {
  sourceQuestionNumber: number;
  part: ExamPartKey;
  /** Trang bắt đầu của câu này (nơi tìm thấy "Câu N") — dùng để biết câu này thuộc đợt/batch nào khi ghép prompt theo trang. */
  pageNumber: number;
  /** Đoạn văn bản thô của câu (từ "Câu N" tới ngay trước "Câu N+1" hoặc hết Phần) — CHƯA xử lý gì thêm, giữ nguyên để Gemini đối chiếu. */
  rawText: string;
  /** Nhãn đáp án tìm được, ĐÚNG THỨ TỰ (A,B,C,D hoặc a,b,c,d) — rỗng với Phần 3 (không có đáp án cho sẵn). */
  choiceLabelsFound: string[];
  /**
   * true nếu Phần 1/2 tìm đủ 4 nhãn theo đúng thứ tự; LUÔN true với Phần 3
   * (không có nhãn để tìm — câu trả lời ngắn).
   */
  choiceLabelsComplete: boolean;
}

export interface DetectedSection {
  part: ExamPartKey;
  /** Dòng tiêu đề "PHẦN ..." tìm được, giữ nguyên để hiển thị/so sánh nếu cần — không dùng để tính toán. */
  headerText: string;
  questions: DetectedQuestion[];
}

export interface ExamStructure {
  sections: DetectedSection[];
  /**
   * true CHỈ KHI: tìm được ít nhất 1 Phần, các Phần tìm được theo đúng thứ tự
   * I→II→III (không nhảy cóc/lặp), MỖI câu trong Phần 1/2 đều có
   * choiceLabelsComplete = true, và mọi câu đều có sourceQuestionNumber tăng
   * dần hợp lệ trong phạm vi Phần của nó (không trùng/nhảy số bất thường).
   * false ở bất kỳ nghi ngờ nào — nơi gọi PHẢI coi false là "không dùng được
   * khung này, quay lại luồng AI-tự-đọc như hiện tại", không được cố dùng 1
   * phần khung không chắc chắn.
   */
  structureConfident: boolean;
}

const PART_LABELS: Record<ExamPartKey, string[]> = {
  part1: ["A", "B", "C", "D"],
  part2: ["a", "b", "c", "d"],
  part3: [],
};

/** Chuẩn hoá "I"/"II"/"III"/"1"/"2"/"3" (không phân biệt hoa/thường) về đúng 1 trong 3 phần — null nếu không nhận ra. */
function normalizeSectionMarker(raw: string): ExamPartKey | null {
  const v = raw.trim().toUpperCase();
  if (v === "I" || v === "1") return "part1";
  if (v === "II" || v === "2") return "part2";
  if (v === "III" || v === "3") return "part3";
  return null;
}

interface RawMatch {
  index: number;
  pageNumber: number;
}

interface RawSectionMatch extends RawMatch {
  part: ExamPartKey;
  headerText: string;
}

interface RawQuestionMatch extends RawMatch {
  sourceQuestionNumber: number;
}

/** Ghép nhiều trang thành 1 chuỗi, kèm bảng tra "vị trí ký tự → số trang" để quy ngược mỗi kết quả regex về đúng trang gốc (câu/đáp án có thể vắt ngang 2 trang). */
function concatPagesWithOffsets(pages: StructurePage[]): { text: string; offsets: { start: number; pageNumber: number }[] } {
  let text = "";
  const offsets: { start: number; pageNumber: number }[] = [];
  for (const page of pages) {
    offsets.push({ start: text.length, pageNumber: page.pageNumber });
    text += page.pageText;
    if (!text.endsWith("\n")) text += "\n";
  }
  return { text, offsets };
}

function pageNumberAt(offsets: { start: number; pageNumber: number }[], index: number): number {
  let result = offsets[0]?.pageNumber ?? 1;
  for (const o of offsets) {
    if (o.start <= index) result = o.pageNumber;
    else break;
  }
  return result;
}

const SECTION_RE = /(^|\n)[ \t]*PH[ẦA]N\s*(I{1,3}|IV|[123])\b([^\n]*)/gi;
const QUESTION_RE = /(^|\n)[ \t]*C[âa]u\s*(\d+)\s*[.:)]/g;

function findSections(text: string, offsets: { start: number; pageNumber: number }[]): RawSectionMatch[] {
  const matches: RawSectionMatch[] = [];
  SECTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SECTION_RE.exec(text))) {
    const part = normalizeSectionMarker(m[2]);
    if (!part) continue;
    const markerIndex = m.index + m[1].length; // bỏ qua ký tự \n đầu group 1 khi tính vị trí thật
    matches.push({
      index: markerIndex,
      pageNumber: pageNumberAt(offsets, markerIndex),
      part,
      headerText: (m[0] ?? "").trim(),
    });
  }
  return matches;
}

function findQuestions(text: string, offsets: { start: number; pageNumber: number }[]): RawQuestionMatch[] {
  const matches: RawQuestionMatch[] = [];
  QUESTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUESTION_RE.exec(text))) {
    const markerIndex = m.index + m[1].length;
    const num = Number.parseInt(m[2], 10);
    if (!Number.isFinite(num)) continue;
    matches.push({ index: markerIndex, pageNumber: pageNumberAt(offsets, markerIndex), sourceQuestionNumber: num });
  }
  return matches;
}

/**
 * Tìm lần xuất hiện SAU CÙNG của từng nhãn (vd A, B, C, D), theo đúng thứ tự
 * tăng dần vị trí — xem giải thích rủi ro/cách giảm rủi ro ở đầu file. Nhãn
 * chỉ khớp dạng "X." hoặc "X)" đứng 1 mình (word boundary trước, để không
 * khớp giữa 1 từ khác) — KHÔNG khớp "X(" (toạ độ điểm).
 */
export function findLastOrderedLabelRun(text: string, labels: string[]): { found: string[]; complete: boolean } {
  if (labels.length === 0) return { found: [], complete: true };
  const positions: number[] = labels.map((label) => {
    const re = new RegExp(`\\b${label}[.)]`, "g");
    let last = -1;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text))) last = mm.index;
    return last;
  });
  let prev = -1;
  let complete = true;
  const found: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    const pos = positions[i];
    if (pos < 0 || pos < prev) {
      complete = false;
    } else {
      found.push(labels[i]);
      prev = pos;
    }
  }
  return { found, complete };
}

/**
 * Tách cấu trúc Phần/Câu/đáp án từ văn bản thật (đã trích bằng pdf.js) của
 * TOÀN BỘ đề — chạy 1 lần trên cả đề (không phải theo từng đợt/batch gửi AI),
 * để câu/Phần vắt ngang ranh giới trang vẫn được ghép đúng.
 */
export function detectExamStructure(pages: StructurePage[]): ExamStructure {
  if (pages.length === 0) return { sections: [], structureConfident: false };
  const { text, offsets } = concatPagesWithOffsets(pages);
  const sectionMatches = findSections(text, offsets);
  const questionMatches = findQuestions(text, offsets);

  if (sectionMatches.length === 0 || questionMatches.length === 0) {
    return { sections: [], structureConfident: false };
  }

  // Thứ tự Phần phải đúng I → II → III, không lặp/nhảy cóc — nới lỏng: cho
  // phép thiếu Phần (đề có thể chỉ có Phần 1, hoặc chỉ Phần 1+2), nhưng thứ
  // tự đã xuất hiện phải tăng dần đúng chuẩn part1 < part2 < part3.
  const partOrder: Record<ExamPartKey, number> = { part1: 1, part2: 2, part3: 3 };
  let lastPartOrder = 0;
  for (const s of sectionMatches) {
    if (partOrder[s.part] <= lastPartOrder) {
      return { sections: [], structureConfident: false };
    }
    lastPartOrder = partOrder[s.part];
  }

  const sections: DetectedSection[] = [];
  let overallConfident = true;

  for (let si = 0; si < sectionMatches.length; si++) {
    const section = sectionMatches[si];
    const sectionEnd = sectionMatches[si + 1]?.index ?? text.length;
    const questionsInSection = questionMatches.filter((q) => q.index >= section.index && q.index < sectionEnd);

    const detected: DetectedQuestion[] = [];
    let lastQNum = 0;
    for (let qi = 0; qi < questionsInSection.length; qi++) {
      const q = questionsInSection[qi];
      const qEnd = questionsInSection[qi + 1]?.index ?? sectionEnd;
      const rawText = text.slice(q.index, qEnd).trim();

      // Số câu phải tăng dần trong phạm vi 1 Phần (đề THPT luôn đánh số lại
      // từ 1 ở mỗi Phần) — trùng/giảm số là dấu hiệu parser bắt nhầm chữ
      // "Câu" xuất hiện trong lời giải/ghi chú, không phải câu hỏi thật.
      if (q.sourceQuestionNumber <= lastQNum) {
        overallConfident = false;
      }
      lastQNum = q.sourceQuestionNumber;

      const labels = PART_LABELS[section.part];
      const { found, complete } = labels.length > 0 ? findLastOrderedLabelRun(rawText, labels) : { found: [], complete: true };
      if (!complete) overallConfident = false;

      detected.push({
        sourceQuestionNumber: q.sourceQuestionNumber,
        part: section.part,
        pageNumber: q.pageNumber,
        rawText,
        choiceLabelsFound: found,
        choiceLabelsComplete: complete,
      });
    }

    if (detected.length === 0) overallConfident = false;

    sections.push({ part: section.part, headerText: section.headerText, questions: detected });
  }

  return { sections, structureConfident: overallConfident };
}

const PART_LABEL_VN: Record<ExamPartKey, string> = {
  part1: "Phần 1",
  part2: "Phần 2",
  part3: "Phần 3",
};

/**
 * Dựng đoạn text "khung câu đã xác định sẵn" để chèn thêm vào prompt gửi
 * Gemini — CHỈ liệt kê Phần/số câu (không lặp lại rawText, vốn đã có sẵn
 * trong văn bản từng trang gửi kèm), để Gemini không cần tự tìm ranh giới
 * câu nữa mà vẫn nhận đủ ảnh/text như cũ để điền công thức/đáp án. Chỉ nên
 * gọi hàm này khi `ExamStructure.structureConfident === true` — nơi gọi chịu
 * trách nhiệm kiểm tra điều kiện đó trước (xem parseExamFromPdfPages).
 */
export function buildStructureScaffold(questions: DetectedQuestion[]): string {
  if (questions.length === 0) return "";
  const lines = questions
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((q) => `- ${PART_LABEL_VN[q.part]}, Câu ${q.sourceQuestionNumber}`);
  return `KHUNG CẤU TRÚC ĐỀ ĐÃ XÁC ĐỊNH SẴN (đọc thẳng từ văn bản gốc, ĐỘ TIN CẬY CAO — không phải AI đoán): đợt này gồm ĐÚNG các câu sau, theo ĐÚNG Phần và số thứ tự liệt kê — KHÔNG tự gộp/tách thêm câu nào khác ngoài danh sách này, không tự đổi số câu:
${lines.join("\n")}
Với mỗi câu trên, bạn CHỈ cần: điền công thức Toán (đọc từ ảnh ở chỗ văn bản bị thiếu), xác định đáp án đúng (đọc tín hiệu thị giác từ ảnh), và lời giải nếu có — KHÔNG cần tự tìm ranh giới câu hay đếm lại số câu, việc đó đã làm sẵn.`;
}
