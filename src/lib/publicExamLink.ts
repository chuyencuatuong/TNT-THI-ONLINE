/**
 * Link công khai của đề (migration_023): /thi/?de=<slug>&src=<nguồn>.
 * Hàm thuần — có unit test (publicExamLink.test.ts).
 */

/** Ràng buộc giống CHECK constraint exams_public_slug_format trong CSDL. */
export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Giữa kỳ 1 – Toán 12 (Đề 01)" -> "giua-ky-1-toan-12-de-01". */
export function slugifyVi(input: string, maxLength = 80): string {
  const s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength).replace(/-+[^-]*$/, "") || s.slice(0, maxLength);
}

export function isValidPublicSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 80 && PUBLIC_SLUG_PATTERN.test(slug);
}

/**
 * Link chia sẻ. `origin` + `baseUrl` (import.meta.env.BASE_URL, vd
 * "/TNT-THI-ONLINE/") — trỏ vào entry thi/index.html để Facebook đọc được
 * ảnh/tiêu đề xem trước (mã 200, không đi qua 404.html).
 */
export function buildPublicExamLink(origin: string, baseUrl: string, slug: string, source?: string | null): string {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const q = new URLSearchParams({ de: slug });
  if (source) q.set("src", source);
  return `${origin}${base}thi/?${q.toString()}`;
}
