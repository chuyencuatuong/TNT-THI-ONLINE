import { buildPublicExamLink, isValidPublicSlug, slugifyVi } from "./publicExamLink";

describe("slugifyVi", () => {
  it("bỏ dấu tiếng Việt, đ -> d, gom ký tự lạ thành gạch ngang", () => {
    expect(slugifyVi("Giữa kỳ 1 – Toán 12 (Đề 01)")).toBe("giua-ky-1-toan-12-de-01");
    expect(slugifyVi("  Đề KHẢO SÁT   chương 1!! ")).toBe("de-khao-sat-chuong-1");
    expect(slugifyVi("Ứng dụng đạo hàm")).toBe("ung-dung-dao-ham");
  });
  it("cắt ở ranh giới từ khi quá dài", () => {
    const s = slugifyVi("a".repeat(10) + " " + "b".repeat(10), 15);
    expect(s).toBe("aaaaaaaaaa");
  });
  it("kết quả luôn khớp ràng buộc CSDL khi đủ 3 ký tự", () => {
    for (const t of ["Đề 01", "Cuối kỳ I · 2026", "ĐỀ THI THỬ TỐT NGHIỆP THPT 2026 — SỞ GD&ĐT CẦN THƠ"]) {
      expect(isValidPublicSlug(slugifyVi(t))).toBe(true);
    }
  });
});

describe("isValidPublicSlug", () => {
  it("chặn chữ hoa, dấu, gạch đôi, gạch đầu/cuối, quá ngắn", () => {
    expect(isValidPublicSlug("giua-ky-1")).toBe(true);
    expect(isValidPublicSlug("Giua-ky")).toBe(false);
    expect(isValidPublicSlug("giữa-kỳ")).toBe(false);
    expect(isValidPublicSlug("giua--ky")).toBe(false);
    expect(isValidPublicSlug("-giua")).toBe(false);
    expect(isValidPublicSlug("ab")).toBe(false);
  });
});

describe("buildPublicExamLink", () => {
  it("trỏ vào entry thi/ dưới base của GitHub Pages", () => {
    expect(buildPublicExamLink("https://abc.github.io", "/TNT-THI-ONLINE/", "giua-ky-1", "fb")).toBe(
      "https://abc.github.io/TNT-THI-ONLINE/thi/?de=giua-ky-1&src=fb",
    );
    expect(buildPublicExamLink("https://toan.vn", "/", "de-01")).toBe("https://toan.vn/thi/?de=de-01");
  });
});
