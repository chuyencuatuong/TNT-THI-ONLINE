// ---------------------------------------------------------------------------
// Đọc đề thi từ file .tex theo khuôn mẫu cố định (xem docs/quy-uoc-nhap-de-tex.md)
// — THÊM 02/09/2026. Khác hẳn parseExamFromPdfPages/parseExamFromDocument ở
// src/lib/ai.ts: hàm ở đây KHÔNG gọi AI, thuần regex + quét ngoặc cân bằng,
// nên nhanh và không phụ thuộc hạn mức/quá tải của Gemini. AI chỉ tham gia ở
// bước NGOÀI web (giáo viên tự "tex hoá" đề bằng 1 Gem riêng trước khi tải
// lên) — xem tài liệu để biết Instructions + khuôn mẫu đầy đủ.
//
// Trả về ĐÚNG kiểu ParsedExam đã có sẵn (dùng chung cho cả PDF/Word) — nhờ
// vậy toàn bộ phần sau (withIds, màn xem lại, nút "Quét & gợi ý Chương/Bài")
// ở TeacherExamImport.tsx dùng lại nguyên, không cần sửa gì thêm.
// ---------------------------------------------------------------------------
import type { ParsedExam, ParsedPart1Question, ParsedPart2Question, ParsedPart3Question } from "./ai";

/** Bỏ các dòng chú thích bắt đầu bằng `%` (đúng quy ước LaTeX + mục 3 của tài
 * liệu — dùng để đánh dấu ranh giới giữa các đợt khi AI trả lời chia nhỏ).
 * CHỈ bỏ dòng bắt đầu bằng `%` (sau khoảng trắng đầu dòng), không đụng tới
 * dấu % nằm giữa nội dung (vd "50%") — dù khuôn mẫu hiện chưa dùng tới. */
function stripCommentLines(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*%/.test(line))
    .join("\n");
}

function skipWhitespace(s: string, i: number): number {
  let pos = i;
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  return pos;
}

/** Đọc 1 nhóm `{...}` cân bằng ngoặc, bắt đầu tại vị trí `i` (phải đúng là
 * dấu `{`). Bỏ qua cặp `\{ \}` (ngoặc nhọn LaTeX thật, vd trong công thức tập
 * hợp `$\{1,2,3\}$`) khi đếm độ sâu, KHÔNG coi là ngoặc gom nhóm tham số —
 * nếu không xử lý riêng, công thức kiểu này sẽ làm lệch việc đếm và cắt sai
 * tham số. Trả về null nếu thiếu dấu đóng (ngoặc không cân bằng). */
function readBracedGroup(s: string, i: number): { value: string; next: number } | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  const start = i;
  let pos = i;
  for (; pos < s.length; pos++) {
    if (s[pos] === "\\" && (s[pos + 1] === "{" || s[pos + 1] === "}")) {
      pos++; // bỏ qua ký tự escape kèm theo, không tính vào độ sâu
      continue;
    }
    if (s[pos] === "{") depth++;
    else if (s[pos] === "}") {
      depth--;
      if (depth === 0) return { value: s.slice(start + 1, pos), next: pos + 1 };
    }
  }
  return null;
}

/** Tìm vị trí lệnh `\name` gần nhất kể từ `fromIndex`, yêu cầu KHÔNG có chữ
 * cái ngay sau tên lệnh — để "\dapan" không bị khớp nhầm vào giữa
 * "\dapandung". Trả về {start, end} (end = ngay sau tên lệnh, trước dấu `{`
 * đầu tiên), hoặc null nếu không tìm thấy. */
function findMacroName(s: string, name: string, fromIndex: number): { start: number; end: number } | null {
  const re = new RegExp(`\\\\${name}(?![a-zA-ZÀ-ỹ])`, "g");
  re.lastIndex = fromIndex;
  const m = re.exec(s);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}

function readMacroArgs(s: string, afterName: number, argCount: number): { args: string[]; next: number } | null {
  let pos = afterName;
  const args: string[] = [];
  for (let a = 0; a < argCount; a++) {
    pos = skipWhitespace(s, pos);
    const group = readBracedGroup(s, pos);
    if (!group) return null;
    args.push(group.value);
    pos = group.next;
  }
  return { args, next: pos };
}

/** Tìm TẤT CẢ lệnh `\name{arg1}{arg2}...` (đủ argCount tham số) trong `s`,
 * theo đúng thứ tự xuất hiện. 1 lệnh cụ thể bị lỗi ngoặc (thiếu `}`) thì bị bỏ
 * qua âm thầm ở đây — hàm gọi (parsePart1/2/3) tự quyết định có cần cảnh báo
 * gì thêm dựa trên kết quả thiếu, không throw để không mất cả câu vì 1 lỗi nhỏ. */
function findAllMacroCalls(s: string, name: string, argCount: number): Array<{ args: string[] }> {
  const results: Array<{ args: string[] }> = [];
  let cursor = 0;
  while (cursor <= s.length) {
    const pos = findMacroName(s, name, cursor);
    if (!pos) break;
    const parsed = readMacroArgs(s, pos.end, argCount);
    if (parsed) {
      results.push({ args: parsed.args });
      cursor = parsed.next;
    } else {
      cursor = pos.end; // ngoặc lỗi — bỏ qua, tìm tiếp lệnh sau
    }
  }
  return results;
}

function findOneMacroCall(s: string, name: string, argCount: number): { args: string[] } | null {
  const all = findAllMacroCalls(s, name, argCount);
  return all.length > 0 ? all[0] : null;
}

/** Xoá mọi lệnh `\name{...}` (đủ argCount tham số) khỏi `text`, dùng để làm
 * sạch phần content_latex khi `\hinh{...}` nằm XEN GIỮA nội dung câu hỏi
 * (thực tế thường gặp — ảnh minh hoạ được nhắc ngay sau câu dẫn, trước khi
 * nêu yêu cầu) — nếu không xoá, chữ "\hinh{...}" sẽ hiện nguyên văn cho học
 * sinh thấy khi làm bài. */
function removeMacroCalls(text: string, name: string, argCount: number): string {
  let result = "";
  let cursor = 0;
  while (cursor <= text.length) {
    const pos = findMacroName(text, name, cursor);
    if (!pos) {
      result += text.slice(cursor);
      break;
    }
    const parsed = readMacroArgs(text, pos.end, argCount);
    if (!parsed) {
      result += text.slice(cursor, pos.end);
      cursor = pos.end;
      continue;
    }
    result += text.slice(cursor, pos.start);
    cursor = parsed.next;
  }
  return result;
}

/** Ghép cặp `\begin{name}{arg}...\end{name}` (nếu `argPattern` khác null) hoặc
 * `\begin{name}...\end{name}` (nếu null) — KHÔNG hỗ trợ lồng nhau (đúng khuôn
 * mẫu: `\phan` không lồng `\phan`, `\cauhoi` không lồng `\cauhoi`). Nếu thiếu
 * `\end` tương ứng, bỏ qua khối đó và đẩy cảnh báo — không throw, luôn cố đọc
 * tối đa số câu đọc được thay vì mất trắng cả file vì 1 chỗ thiếu ngoặc. Nhờ
 * cách ghép này, việc "lặp lại nhiều khối `\phan{1}` ở các đợt khác nhau"
 * (mục 3, docs/quy-uoc-nhap-de-tex.md) tự động được gộp đúng thứ tự — không
 * cần xử lý gì thêm ở nơi gọi. */
function pairEnvironments(
  source: string,
  name: string,
  argPattern: string | null,
  warnings: string[],
): Array<{ arg: string | null; inner: string }> {
  const beginRe = argPattern
    ? new RegExp(`\\\\begin\\{${name}\\}\\{(${argPattern})\\}`, "g")
    : new RegExp(`\\\\begin\\{${name}\\}`, "g");
  const endRe = new RegExp(`\\\\end\\{${name}\\}`, "g");

  type Marker = { kind: "begin" | "end"; index: number; end: number; arg: string | null };
  const markers: Marker[] = [];
  for (const m of source.matchAll(beginRe)) {
    markers.push({ kind: "begin", index: m.index, end: m.index + m[0].length, arg: argPattern ? m[1] : null });
  }
  for (const m of source.matchAll(endRe)) {
    markers.push({ kind: "end", index: m.index, end: m.index + m[0].length, arg: null });
  }
  markers.sort((a, b) => a.index - b.index);

  const blocks: Array<{ arg: string | null; inner: string }> = [];
  let open: Marker | null = null;
  for (const marker of markers) {
    if (marker.kind === "begin") {
      if (open) {
        warnings.push(`Thiếu \\end{${name}} trước khi gặp \\begin{${name}} tiếp theo — bỏ qua đoạn không đóng đúng.`);
      }
      open = marker;
    } else {
      if (!open) {
        warnings.push(`Gặp \\end{${name}} nhưng không có \\begin{${name}} tương ứng — bỏ qua.`);
        continue;
      }
      blocks.push({ arg: open.arg, inner: source.slice(open.end, marker.index) });
      open = null;
    }
  }
  if (open) {
    warnings.push(`Thiếu \\end{${name}} cho 1 khối \\begin{${name}} — bỏ qua đoạn cuối không đóng.`);
  }
  return blocks;
}

/** Các trường dùng chung cho mọi câu (cả 3 phần): lời giải, gợi ý Chương/Bài,
 * và cảnh báo hình cần dán tay — tách riêng để không lặp code 3 lần. */
function extractCommonFields(
  block: string,
  warnings: string[],
  label: string,
): { solution_latex: string | null; topic_name: string | null; lesson_name: string | null } {
  const loigiai = findOneMacroCall(block, "loigiai", 1);
  const chuong = findOneMacroCall(block, "chuong", 1);
  const bai = findOneMacroCall(block, "bai", 1);
  const hinh = findAllMacroCalls(block, "hinh", 1);
  if (hinh.length > 0) {
    warnings.push(
      `${label}: có ${hinh.length} hình cần dán tay ở bước xem trước (${hinh
        .map((h) => h.args[0].trim())
        .join("; ")}).`,
    );
  }
  return {
    solution_latex: loigiai && loigiai.args[0].trim() ? loigiai.args[0].trim() : null,
    topic_name: chuong && chuong.args[0].trim() ? chuong.args[0].trim() : null,
    lesson_name: bai && bai.args[0].trim() ? bai.args[0].trim() : null,
  };
}

/** Nội dung câu hỏi = văn bản TRƯỚC lệnh đáp án đầu tiên (`boundaryMacro`),
 * đã bỏ hết `\hinh{...}` xen giữa (xem removeMacroCalls). */
function extractQuestionContent(block: string, boundaryMacro: string): string {
  const pos = findMacroName(block, boundaryMacro, 0);
  const raw = pos ? block.slice(0, pos.start) : block;
  return removeMacroCalls(raw, "hinh", 1).trim();
}

const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;
const ITEM_LETTERS = ["a", "b", "c", "d"] as const;

function parsePart1(block: string, warnings: string[], label: string): ParsedPart1Question {
  const content_latex = extractQuestionContent(block, "dapan");

  const choices = { A: "", B: "", C: "", D: "" };
  for (const { args } of findAllMacroCalls(block, "dapan", 2)) {
    const letter = args[0].trim().toUpperCase();
    if ((CHOICE_LETTERS as readonly string[]).includes(letter)) {
      choices[letter as "A" | "B" | "C" | "D"] = args[1].trim();
    } else {
      warnings.push(`${label}: nhãn đáp án không hợp lệ "${args[0]}" (chỉ nhận A/B/C/D).`);
    }
  }
  const missing = CHOICE_LETTERS.filter((l) => !choices[l]);
  if (missing.length > 0) warnings.push(`${label}: thiếu đáp án ${missing.join(", ")}.`);

  let correct_choice: "A" | "B" | "C" | "D" | null = null;
  const dung = findOneMacroCall(block, "dapandung", 1);
  if (dung) {
    const v = dung.args[0].trim().toUpperCase();
    if ((CHOICE_LETTERS as readonly string[]).includes(v)) correct_choice = v as "A" | "B" | "C" | "D";
    else if (v !== "") warnings.push(`${label}: giá trị \\dapandung không hợp lệ "${dung.args[0]}".`);
  }

  const common = extractCommonFields(block, warnings, label);
  return { content_latex, choices, correct_choice, ...common };
}

function parsePart2(block: string, warnings: string[], label: string): ParsedPart2Question {
  const content_latex = extractQuestionContent(block, "y");

  const items = { a: "", b: "", c: "", d: "" };
  const flags: Record<"a" | "b" | "c" | "d", boolean | null> = { a: null, b: null, c: null, d: null };
  for (const { args } of findAllMacroCalls(block, "y", 3)) {
    const letter = args[0].trim().toLowerCase();
    if (!(ITEM_LETTERS as readonly string[]).includes(letter)) {
      warnings.push(`${label}: nhãn ý không hợp lệ "${args[0]}" (chỉ nhận a/b/c/d).`);
      continue;
    }
    const l = letter as "a" | "b" | "c" | "d";
    items[l] = args[1].trim();
    const v = args[2].trim().toLowerCase();
    if (v === "dung") flags[l] = true;
    else if (v === "sai") flags[l] = false;
    else if (v === "?") flags[l] = null;
    else warnings.push(`${label}: giá trị đúng/sai không hợp lệ ở ý "${l}" ("${args[2]}") — chỉ nhận dung/sai/?.`);
  }
  const missing = ITEM_LETTERS.filter((l) => !items[l]);
  if (missing.length > 0) warnings.push(`${label}: thiếu ý ${missing.join(", ")}.`);

  const allKnown = ITEM_LETTERS.every((l) => flags[l] === true || flags[l] === false);
  const correct = allKnown
    ? { a: flags.a as boolean, b: flags.b as boolean, c: flags.c as boolean, d: flags.d as boolean }
    : null;

  const common = extractCommonFields(block, warnings, label);
  return { content_latex, items, correct, ...common };
}

function parsePart3(block: string, warnings: string[], label: string): ParsedPart3Question {
  const content_latex = extractQuestionContent(block, "dapanngan");

  const dn = findOneMacroCall(block, "dapanngan", 1);
  const correct_value = dn && dn.args[0].trim() ? dn.args[0].trim() : null;

  let points = 0.5;
  const diem = findOneMacroCall(block, "diem", 1);
  if (diem) {
    const n = Number(diem.args[0].trim().replace(",", "."));
    if (!Number.isNaN(n) && n > 0) points = n;
    else warnings.push(`${label}: giá trị \\diem không hợp lệ "${diem.args[0]}" — dùng mặc định 0.5.`);
  }

  const common = extractCommonFields(block, warnings, label);
  return { content_latex, correct_value, points, ...common };
}

/**
 * Đọc đề thi từ nội dung file `.tex` theo khuôn mẫu cố định (xem
 * docs/quy-uoc-nhap-de-tex.md). Hàm THUẦN (không I/O, không AI) — luôn cố
 * đọc tối đa số câu đọc được, KHÔNG throw khi gặp lỗi cú pháp cục bộ (thiếu
 * đáp án, ngoặc không khớp...), chỉ đẩy mô tả lỗi vào `warnings` để giáo viên
 * tự sửa ở bước xem lại — cùng triết lý với cảnh báo ảnh EMF/WMF của đường
 * nhập .docx.
 */
export function parseExamFromTex(rawSource: string): ParsedExam {
  const warnings: string[] = [];
  const source = stripCommentLines(rawSource);

  const part1: ParsedPart1Question[] = [];
  const part2: ParsedPart2Question[] = [];
  const part3: ParsedPart3Question[] = [];

  const phanBlocks = pairEnvironments(source, "phan", "\\d", warnings);
  if (phanBlocks.length === 0) {
    warnings.push("Không tìm thấy khối \\begin{phan}{...} nào — kiểm tra lại cú pháp file .tex.");
  }

  const questionCounter: Record<"1" | "2" | "3", number> = { "1": 0, "2": 0, "3": 0 };
  for (const { arg, inner } of phanBlocks) {
    if (arg !== "1" && arg !== "2" && arg !== "3") {
      warnings.push(`Bỏ qua 1 khối \\phan{${arg}} — chỉ chấp nhận 1, 2, hoặc 3.`);
      continue;
    }
    const cauhoiBlocks = pairEnvironments(inner, "cauhoi", null, warnings);
    for (const { inner: cauhoiInner } of cauhoiBlocks) {
      questionCounter[arg] += 1;
      const label = `Phần ${arg}, câu ${questionCounter[arg]}`;
      if (arg === "1") part1.push(parsePart1(cauhoiInner, warnings, label));
      else if (arg === "2") part2.push(parsePart2(cauhoiInner, warnings, label));
      else part3.push(parsePart3(cauhoiInner, warnings, label));
    }
  }

  return { part1, part2, part3, warnings };
}

/** Lấy tên đề đề xuất từ `\tieude{...}` (nếu có) — dùng làm suggestedTitle
 * giống hệt cách PDF/Word đang lấy tên đề theo tên file (xem loadParsed ở
 * TeacherExamImport.tsx: chỉ điền nếu ô tên đề đang trống). */
export function extractTexTitle(rawSource: string): string | null {
  const source = stripCommentLines(rawSource);
  const call = findOneMacroCall(source, "tieude", 1);
  return call && call.args[0].trim() ? call.args[0].trim() : null;
}
