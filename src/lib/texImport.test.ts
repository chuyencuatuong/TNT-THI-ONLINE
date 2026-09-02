import { describe, expect, it } from "vitest";
import { extractTexTitle, parseExamFromTex } from "./texImport";

describe("parseExamFromTex", () => {
  it("đọc đúng 1 câu Phần I đầy đủ (nội dung, 4 đáp án, đáp án đúng, lời giải, Chương/Bài)", () => {
    const tex = String.raw`
\begin{phan}{1}
\begin{cauhoi}
Trong không gian $Oxyz$, cho điểm $A(-2;-1;3)$. Toạ độ hình chiếu của $A$ trên $(Oyz)$ là
\dapan{A}{$(0;-1;0)$}
\dapan{B}{$(-2;0;0)$}
\dapan{C}{$(0;-1;3)$}
\dapan{D}{$(-2;-1;0)$}
\dapandung{C}
\loigiai{Hình chiếu lên $(Oyz)$ giữ nguyên $y, z$, cho $x=0$.}
\chuong{Phương pháp toạ độ trong không gian}
\bai{Hệ trục toạ độ trong không gian}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.warnings).toEqual([]);
    expect(result.part1).toHaveLength(1);
    const q = result.part1[0];
    expect(q.content_latex).toBe("Trong không gian $Oxyz$, cho điểm $A(-2;-1;3)$. Toạ độ hình chiếu của $A$ trên $(Oyz)$ là");
    expect(q.choices).toEqual({ A: "$(0;-1;0)$", B: "$(-2;0;0)$", C: "$(0;-1;3)$", D: "$(-2;-1;0)$" });
    expect(q.correct_choice).toBe("C");
    expect(q.solution_latex).toBe("Hình chiếu lên $(Oyz)$ giữ nguyên $y, z$, cho $x=0$.");
    expect(q.topic_name).toBe("Phương pháp toạ độ trong không gian");
    expect(q.lesson_name).toBe("Hệ trục toạ độ trong không gian");
  });

  it("giữ nguyên công thức có ngoặc lồng nhau (\\frac, \\lim, \\left(...\\right)) không bị cắt sai", () => {
    const tex = String.raw`
\begin{phan}{1}
\begin{cauhoi}
Tiệm cận ngang của đồ thị hàm số $y=\frac{x-2}{x+1}$ là
\dapan{A}{$y=-2$}
\dapan{B}{$y=1$}
\dapan{C}{$x=-1$}
\dapan{D}{$x=2$}
\dapandung{B}
\loigiai{Ta có $\lim_{x\rightarrow+\infty}y=\lim_{x\rightarrow+\infty}\frac{x-2}{x+1}=1$ và $\lim_{x\rightarrow-\infty}\left(-\frac{3}{x+1}\right)=0$.}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.warnings).toEqual([]);
    expect(result.part1[0].choices.A).toBe("$y=-2$");
    expect(result.part1[0].solution_latex).toContain("\\lim_{x\\rightarrow+\\infty}\\frac{x-2}{x+1}=1");
    expect(result.part1[0].solution_latex).toContain("\\left(-\\frac{3}{x+1}\\right)=0");
  });

  it("\\hinh{} nằm XEN GIỮA nội dung câu hỏi được cắt sạch khỏi content_latex, vẫn tạo cảnh báo", () => {
    const tex = String.raw`
\begin{phan}{1}
\begin{cauhoi}
Cho hàm số $y=f(x)$ có bảng biến thiên như sau:
\hinh{Bảng biến thiên hàm số $y=f(x)$}
Hàm số đồng biến trên khoảng nào sau đây?
\dapan{A}{$(-\infty;-2)$}
\dapan{B}{$(-1;1)$}
\dapan{C}{$(0;+\infty)$}
\dapan{D}{$(-1;+\infty)$}
\dapandung{A}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.part1[0].content_latex).not.toContain("\\hinh");
    expect(result.part1[0].content_latex).toContain("Hàm số đồng biến trên khoảng nào sau đây?");
    expect(result.warnings.some((w) => w.includes("có 1 hình cần dán tay"))).toBe(true);
  });

  it("\\dapandung để trống hoặc bỏ hẳn → correct_choice = null, KHÔNG cảnh báo (đề không có đáp án sẵn là bình thường)", () => {
    const tex = String.raw`
\begin{phan}{1}
\begin{cauhoi}
Câu không có đáp án đúng ghi sẵn.
\dapan{A}{a}
\dapan{B}{b}
\dapan{C}{c}
\dapan{D}{d}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.part1[0].correct_choice).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("thiếu 1 đáp án → cảnh báo rõ ràng, vẫn giữ câu (không mất câu vì lỗi cục bộ)", () => {
    const tex = String.raw`
\begin{phan}{1}
\begin{cauhoi}
Câu thiếu đáp án D.
\dapan{A}{a}
\dapan{B}{b}
\dapan{C}{c}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.part1).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("thiếu đáp án D"))).toBe(true);
  });

  it("Phần II: đủ 4 ý dung/sai hợp lệ → correct đầy đủ; có ý '?' → correct = null", () => {
    const tex = String.raw`
\begin{phan}{2}
\begin{cauhoi}
Cho hàm số $f(x) = x^3 - 3x + 1$.
\y{a}{Hàm số đồng biến trên $(-\infty;-1)$}{dung}
\y{b}{Hàm số đạt cực đại tại $x=1$}{sai}
\y{c}{$f(0) = 1$}{dung}
\y{d}{Hàm số nghịch biến trên $(-1;1)$}{dung}
\end{cauhoi}
\begin{cauhoi}
Câu 2, có 1 ý chưa chắc.
\y{a}{ý a}{dung}
\y{b}{ý b}{?}
\y{c}{ý c}{sai}
\y{d}{ý d}{dung}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.part2).toHaveLength(2);
    expect(result.part2[0].correct).toEqual({ a: true, b: false, c: true, d: true });
    expect(result.part2[1].correct).toBeNull();
  });

  it("Phần III: \\dapanngan và \\diem đọc đúng, \\diem mặc định 0.5 nếu không ghi", () => {
    const tex = String.raw`
\begin{phan}{3}
\begin{cauhoi}
Tính $\lim_{x \to 0} \frac{\sin x}{x}$.
\dapanngan{1}
\diem{0.5}
\end{cauhoi}
\begin{cauhoi}
Câu không ghi điểm.
\dapanngan{5}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.part3[0].correct_value).toBe("1");
    expect(result.part3[0].points).toBe(0.5);
    expect(result.part3[1].points).toBe(0.5);
  });

  it("nhiều khối \\begin{phan}{1} (chia đợt) được GỘP đúng thứ tự, đánh số câu liên tục", () => {
    const tex = String.raw`
% ---HẾT ĐỢT 1/2 — GÕ "TIẾP" ĐỂ NHẬN ĐỢT TIẾP THEO---
\begin{phan}{1}
\begin{cauhoi}
Câu 1.
\dapan{A}{a}\dapan{B}{b}\dapan{C}{c}\dapan{D}{d}
\dapandung{A}
\end{cauhoi}
\end{phan}

\begin{phan}{1}
\begin{cauhoi}
Câu 2.
\dapan{A}{a}\dapan{B}{b}\dapan{C}{c}\dapan{D}{d}
\dapandung{B}
\end{cauhoi}
\end{phan}
`;
    const result = parseExamFromTex(tex);
    expect(result.part1).toHaveLength(2);
    expect(result.part1[0].content_latex).toBe("Câu 1.");
    expect(result.part1[1].content_latex).toBe("Câu 2.");
  });

  it("dòng bắt đầu bằng % bị bỏ qua hoàn toàn, kể cả dòng mốc chia đợt", () => {
    const tex = String.raw`
% Kế hoạch: 2 câu — chia 2 đợt
\begin{phan}{1}
\begin{cauhoi}
Câu duy nhất.
\dapan{A}{a}\dapan{B}{b}\dapan{C}{c}\dapan{D}{d}
\dapandung{D}
\end{cauhoi}
\end{phan}
% ---HẾT ĐỢT 1/1---
`;
    const result = parseExamFromTex(tex);
    expect(result.warnings).toEqual([]);
    expect(result.part1).toHaveLength(1);
  });

  it("không có khối \\phan nào → cảnh báo rõ, không lỗi", () => {
    const result = parseExamFromTex("Đây chỉ là văn bản thường, không có cú pháp gì cả.");
    expect(result.part1).toEqual([]);
    expect(result.part2).toEqual([]);
    expect(result.part3).toEqual([]);
    expect(result.warnings.some((w) => w.includes("Không tìm thấy khối"))).toBe(true);
  });

  it("thiếu \\end{cauhoi} → bỏ qua khối lỗi, có cảnh báo, không throw", () => {
    const tex = String.raw`
\begin{phan}{1}
\begin{cauhoi}
Câu bị thiếu end.
\dapan{A}{a}\dapan{B}{b}\dapan{C}{c}\dapan{D}{d}
\end{phan}
`;
    expect(() => parseExamFromTex(tex)).not.toThrow();
    const result = parseExamFromTex(tex);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("extractTexTitle", () => {
  it("lấy đúng tên đề từ \\tieude{...}", () => {
    expect(extractTexTitle(String.raw`\tieude{Đề kiểm tra giữa kỳ 1 - Lớp 12}` + "\n\\begin{phan}{1}\\end{phan}")).toBe(
      "Đề kiểm tra giữa kỳ 1 - Lớp 12",
    );
  });

  it("trả về null nếu không có \\tieude", () => {
    expect(extractTexTitle("\\begin{phan}{1}\\end{phan}")).toBeNull();
  });
});
