import { describe, expect, it } from "vitest";
import { parseYoutubeLink, youtubeEmbedUrl } from "./youtube";

describe("parseYoutubeLink", () => {
  it("nhận link video dạng watch?v=...", () => {
    expect(parseYoutubeLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("nhận link video rút gọn youtu.be", () => {
    expect(parseYoutubeLink("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("nhận link youtube shorts", () => {
    expect(parseYoutubeLink("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("ưu tiên video khi link vừa có v= vừa có list= (xem từ playlist)", () => {
    expect(
      parseYoutubeLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123_XYZ&index=2"),
    ).toEqual({ kind: "video", id: "dQw4w9WgXcQ" });
  });

  it("nhận link dạng playlist?list=... khi không có v=", () => {
    expect(parseYoutubeLink("https://www.youtube.com/playlist?list=PLabc123_XYZ")).toEqual({
      kind: "playlist",
      id: "PLabc123_XYZ",
    });
  });

  it("nhận link music.youtube.com playlist", () => {
    expect(parseYoutubeLink("https://music.youtube.com/playlist?list=PLabc123")).toEqual({
      kind: "playlist",
      id: "PLabc123",
    });
  });

  it("bỏ www./m. khi kiểm tra domain", () => {
    expect(parseYoutubeLink("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("từ chối domain không phải YouTube", () => {
    expect(parseYoutubeLink("https://vimeo.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("từ chối chuỗi không phải URL hợp lệ", () => {
    expect(parseYoutubeLink("không phải link")).toBeNull();
    expect(parseYoutubeLink("")).toBeNull();
  });

  it("từ chối link YouTube không nhận diện được video/playlist nào", () => {
    expect(parseYoutubeLink("https://www.youtube.com/")).toBeNull();
  });
});

describe("youtubeEmbedUrl", () => {
  it("dựng đúng URL nhúng cho video", () => {
    expect(youtubeEmbedUrl({ kind: "video", id: "dQw4w9WgXcQ" })).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0",
    );
  });

  it("dựng đúng URL nhúng cho playlist", () => {
    expect(youtubeEmbedUrl({ kind: "playlist", id: "PLabc123" })).toBe(
      "https://www.youtube.com/embed/videoseries?list=PLabc123&rel=0",
    );
  });
});
