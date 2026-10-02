/**
 * Thông tin liên hệ của Toán học TNT — dùng ở chân trang landing và các chỗ
 * cần "liên hệ thầy". Sửa ở đây là đổi ở mọi nơi.
 */
export const CONTACT = {
  brand: "Toán học TNT",
  owner: "Trần Nhật Tường",
  tagline: "Chuyên lấy gốc Toán THPT",
  fanpageUrl: "https://www.facebook.com/nhattuong59",
  /** Facebook cá nhân của thầy — để trống thì chân trang không hiện nút này. */
  personalFacebookUrl: "",
  phone: "0387383852",
  phoneDisplay: "0387 383 852",
  email: "tuongtrankl@gmail.com",
} as const;

/** Link mở khung chat Zalo theo số điện thoại. */
export const ZALO_URL = `https://zalo.me/${CONTACT.phone}`;

/** Chép chữ vào bộ nhớ tạm; trình duyệt cũ / webview chặn clipboard thì dùng cách chọn chữ. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // rơi xuống cách dự phòng
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const done = document.execCommand("copy");
    document.body.removeChild(ta);
    return done;
  } catch {
    return false;
  }
}
