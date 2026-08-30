import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { parseYoutubeLink, youtubeEmbedUrl } from "../lib/youtube";
import type { StudentPlaylistRow } from "../lib/types";

const MAX_PLAYLISTS = 3;

/**
 * "Góc âm nhạc" — nút gọn trên thanh trên cùng (góc phải), bấm mở bảng nhỏ để
 * chọn 1 trong tối đa 3 link nhạc YouTube yêu thích (video lẻ HOẶC playlist —
 * không bắt buộc phải là playlist) và phát ngay trong trang (nhúng iframe
 * embed, không cần API key YouTube — xem src/lib/youtube.ts).
 *
 * Đặt ở đây (không phải trong nội dung dashboard) vì học sinh thường bật nhạc
 * TRƯỚC khi bắt đầu học, nên cần thấy/bấm được ngay từ mọi trang, không chỉ ở
 * trang chủ (đề xuất thiết kế đợt 4).
 */
export function MusicWidget({ studentId }: { studentId: string }) {
  const [playlists, setPlaylists] = useState<StudentPlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listStudentPlaylists(studentId)
      .then((rows) => {
        setPlaylists(rows);
        if (rows.length > 0) setActiveId(rows[0].id);
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAddForm(false);
        setError(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const active = playlists.find((p) => p.id === activeId) ?? null;
  const activeEmbed = active ? parseYoutubeLink(active.url) : null;

  async function handleAddPlaylist(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const embed = parseYoutubeLink(url);
    if (!embed) {
      setError("Link này không phải link YouTube hợp lệ (dán link video hoặc playlist).");
      return;
    }
    if (!label.trim()) {
      setError("Đặt tên ngắn để dễ nhận ra nhé.");
      return;
    }
    const nextPosition = playlists.length as 0 | 1 | 2;
    if (nextPosition > 2) {
      setError(`Đã đủ tối đa ${MAX_PLAYLISTS} mục nhạc.`);
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveStudentPlaylist({
        student_id: studentId,
        position: nextPosition,
        label: label.trim(),
        url: url.trim(),
      });
      setPlaylists((prev) => [...prev, saved]);
      setActiveId(saved.id);
      setLabel("");
      setUrl("");
      setShowAddForm(false);
    } catch {
      setError("Không lưu được, thử lại nhé.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const remaining = playlists.filter((p) => p.id !== id);
    await api.deleteStudentPlaylist(id);
    setPlaylists(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? null);
  }

  if (loading) return null;

  return (
    <div className="music-widget" ref={containerRef}>
      <button
        type="button"
        className={`music-pill ${active ? "music-pill--playing" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`music-pill-icon ${active ? "music-pill-icon--playing" : ""}`}>
          {active ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
              <path d="m9.5 9.5 5 2.5-5 2.5z" fill="currentColor" stroke="none" />
            </svg>
          )}
        </span>
        <span className="music-pill-text">
          <span className="music-pill-title">{active ? active.label : "Góc âm nhạc"}</span>
          <span className={`music-pill-status ${active ? "music-pill-status--playing" : ""}`}>
            {active ? "Đang phát" : "Chưa có nhạc"}
          </span>
        </span>
        <svg
          className={`music-chevron ${open ? "music-chevron--open" : ""}`}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="music-dropdown">
          <div className="music-dropdown-header">
            <strong>Góc âm nhạc</strong>
            <span className="empty-hint">{playlists.length}/{MAX_PLAYLISTS} mục nhạc</span>
          </div>

          {playlists.map((p) => {
            const kind = parseYoutubeLink(p.url)?.kind;
            return (
              <button
                key={p.id}
                type="button"
                className={`music-row ${p.id === activeId ? "music-row--active" : ""}`}
                onClick={() => setActiveId(p.id)}
              >
                <span className={`music-row-icon ${p.id === activeId ? "music-row-icon--active" : ""}`}>
                  {p.id === activeId ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" />
                      <rect x="14" y="5" width="4" height="14" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </span>
                <span className="music-row-text">
                  <span className="music-row-title">{p.label}</span>
                  <span className={`music-row-sub ${p.id === activeId ? "music-row-sub--active" : ""}`}>
                    {p.id === activeId
                      ? "Đang phát"
                      : kind === "playlist"
                        ? "Playlist YouTube"
                        : "Video YouTube"}
                  </span>
                </span>
                <span
                  className="music-row-remove"
                  onClick={(e) => handleRemove(p.id, e)}
                  role="button"
                  aria-label="Bỏ mục nhạc này"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </span>
              </button>
            );
          })}

          {active && activeEmbed && (
            <iframe
              key={`${activeEmbed.kind}-${activeEmbed.id}`}
              className="music-player-frame"
              src={youtubeEmbedUrl(activeEmbed)}
              title={`Phát ${active.label}`}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          )}

          {playlists.length < MAX_PLAYLISTS &&
            (showAddForm ? (
              <form className="music-add-form" onSubmit={handleAddPlaylist}>
                <input
                  type="text"
                  placeholder="Đặt tên (vd: Lo-fi tập trung)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={60}
                />
                <input
                  type="text"
                  placeholder="Dán link YouTube (video hoặc playlist)..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                {error && <div className="music-error">{error}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}>
                    {saving ? "Đang lưu..." : "Lưu lại"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "8px 12px", fontSize: 13 }}
                    onClick={() => {
                      setShowAddForm(false);
                      setError(null);
                    }}
                  >
                    Huỷ
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="music-row music-row--empty"
                onClick={() => setShowAddForm(true)}
              >
                <span className="music-row-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className="music-row-text">
                  <span className="music-row-title">Dán thêm liên kết nhạc</span>
                </span>
              </button>
            ))}

          <div className="music-hint">Phát ngay trong trang, không cần mở tab mới.</div>
        </div>
      )}
    </div>
  );
}
