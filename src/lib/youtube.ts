/**
 * Trích ID playlist từ link YouTube học sinh dán vào (Góc âm nhạc) — hoàn
 * toàn xử lý ở tầng code, KHÔNG gọi API YouTube nào (không cần API key).
 * Chấp nhận các dạng link phổ biến:
 *   - https://www.youtube.com/playlist?list=PLxxxx
 *   - https://www.youtube.com/watch?v=xxxx&list=PLxxxx
 *   - https://youtu.be/xxxx?list=PLxxxx
 *   - https://music.youtube.com/playlist?list=PLxxxx
 * Trả về null nếu link không hợp lệ hoặc không có tham số `list`.
 */
export function extractYoutubePlaylistId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const allowedHosts = ["youtube.com", "youtu.be", "music.youtube.com"];
  if (!allowedHosts.includes(host)) return null;

  const list = url.searchParams.get("list");
  if (!list || !/^[A-Za-z0-9_-]+$/.test(list)) return null;
  return list;
}

/** URL nhúng iframe phát playlist ngay trong trang (không cần mở tab mới). */
export function youtubePlaylistEmbedUrl(playlistId: string): string {
  return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}&rel=0`;
}
