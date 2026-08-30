/**
 * Phân tích 1 link YouTube bất kỳ mà học sinh dán vào (Góc âm nhạc) — chấp
 * nhận CẢ link 1 video đơn lẻ LẪN link playlist, không bắt buộc phải là
 * playlist. Hoàn toàn xử lý ở tầng code, KHÔNG gọi API YouTube nào (không cần
 * API key). Nhận diện các dạng link phổ biến:
 *   - Video: https://www.youtube.com/watch?v=xxxx
 *            https://youtu.be/xxxx
 *            https://www.youtube.com/shorts/xxxx
 *            https://www.youtube.com/embed/xxxx
 *   - Playlist: https://www.youtube.com/playlist?list=PLxxxx
 *               https://music.youtube.com/playlist?list=PLxxxx
 * Khi link vừa có ID video vừa có tham số `list` (dạng "xem từ 1 playlist",
 * watch?v=..&list=..) thì ưu tiên phát ĐÚNG video đó thay vì tự nhảy sang
 * phát nguyên playlist — sát với thứ học sinh thực sự đang xem khi copy link.
 */
export type YoutubeEmbed = { kind: "video"; id: string } | { kind: "playlist"; id: string };

const ALLOWED_HOSTS = ["youtube.com", "youtu.be", "music.youtube.com"];

function normalizeHost(url: URL): string {
  return url.hostname.replace(/^www\.|^m\./, "");
}

/** ID video/playlist YouTube chỉ gồm chữ, số, `_`, `-`. */
function isValidId(id: string | null | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]+$/.test(id);
}

/** Trả về `null` nếu link không hợp lệ hoặc không nhận diện được video/playlist nào. */
export function parseYoutubeLink(rawUrl: string): YoutubeEmbed | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.includes(normalizeHost(url))) return null;

  const pathParts = url.pathname.split("/").filter(Boolean);
  const shortLinkId = url.hostname.replace(/^www\.|^m\./, "") === "youtu.be" ? pathParts[0] : null;
  const pathMatch = url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/);
  const videoId = url.searchParams.get("v") ?? shortLinkId ?? pathMatch?.[1] ?? null;
  if (isValidId(videoId)) return { kind: "video", id: videoId };

  const listId = url.searchParams.get("list");
  if (isValidId(listId)) return { kind: "playlist", id: listId };

  return null;
}

/** URL nhúng iframe phát ngay trong trang (không cần mở tab mới). */
export function youtubeEmbedUrl(embed: YoutubeEmbed): string {
  return embed.kind === "video"
    ? `https://www.youtube.com/embed/${encodeURIComponent(embed.id)}?rel=0`
    : `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(embed.id)}&rel=0`;
}
