import { describe, expect, it } from "vitest";
import { extractYoutubePlaylistId, youtubePlaylistEmbedUrl } from "./youtube";

describe("extractYoutubePlaylistId", () => {
  it("nhận link dạng playlist?list=...", () => {
    expect(
      extractYoutubePlaylistId("https://www.youtube.com/playlist?list=PLabc123_XYZ"),
    ).toBe("PLabc123_XYZ");
  });

  it("nhận link dạng watch?v=...&list=...", () => {
    expect(
      extractYoutubePlaylistId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123_XYZ&index=2",
      ),
    ).toBe("PLabc123_XYZ");
  });

  it("nhận link rút gọn youtu.be kèm list", () => {
    expect(extractYoutubePlaylistId("https://youtu.be/dQw4w9WgXcQ?list=PLabc123")).toBe(
      "PLabc123",
    );
  });

  it("nhận link music.youtube.com", () => {
    expect(
      extractYoutubePlaylistId("https://music.youtube.com/playlist?list=PLabc123"),
    ).toBe("PLabc123");
  });

  it("bỏ www./m. khi kiểm tra domain", () => {
    expect(extractYoutubePlaylistId("https://m.youtube.com/playlist?list=PLabc123")).toBe(
      "PLabc123",
    );
  });

  it("từ chối domain không phải YouTube", () => {
    expect(extractYoutubePlaylistId("https://vimeo.com/playlist?list=PLabc123")).toBeNull();
  });

  it("từ chối link YouTube không có tham số list", () => {
    expect(extractYoutubePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("từ chối chuỗi không phải URL hợp lệ", () => {
    expect(extractYoutubePlaylistId("không phải link")).toBeNull();
    expect(extractYoutubePlaylistId("")).toBeNull();
  });
});

describe("youtubePlaylistEmbedUrl", () => {
  it("dựng đúng URL nhúng iframe", () => {
    expect(youtubePlaylistEmbedUrl("PLabc123")).toBe(
      "https://www.youtube.com/embed/videoseries?list=PLabc123&rel=0",
    );
  });
});
