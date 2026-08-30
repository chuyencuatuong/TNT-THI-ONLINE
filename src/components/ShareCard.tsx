import { useEffect, useRef, useState } from "react";
import logoMark from "../assets/logo-mark.png";
import { downloadCanvasAsPng, drawShareCard, type ShareCardData } from "../lib/renderShareCard";

/**
 * Modal xem trước + tải về "thẻ chia sẻ" (đợt bổ sung 25/08/2026, sau khi
 * mẫu thiết kế đã được duyệt). Vẽ lên canvas ẩn/hiện ngay trong modal —
 * KHÔNG tự động đăng lên đâu cả, học sinh chủ động bấm "Tải ảnh về" rồi tự
 * chia sẻ (Locket, story...) theo ý mình. Xem src/lib/renderShareCard.ts để
 * biết vì sao chọn vẽ tay bằng Canvas 2D thay vì html2canvas/dom-to-image.
 */
export function ShareCardModal({
  data,
  onClose,
}: {
  data: ShareCardData;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawShareCard(canvas, data, logoMark).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    setDownloading(true);
    try {
      const filename = data.kind === "progress" ? "tnt-tien-bo.png" : "tnt-chuoi-on-tap.png";
      await downloadCanvasAsPng(canvas, filename);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="share-card-backdrop" onClick={onClose}>
      <div className="share-card-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="share-card-close" aria-label="Đóng" onClick={onClose}>
          ×
        </button>
        <div className="share-card-canvas-wrap">
          <canvas ref={canvasRef} className="share-card-canvas" />
          {!ready && <div className="share-card-loading">Đang tạo thẻ...</div>}
        </div>
        <p className="share-card-hint">
          Tải ảnh về rồi tự đăng lên Locket, story hoặc bất kỳ đâu em muốn khoe nhé!
        </p>
        <button
          type="button"
          className="btn-primary share-card-download-btn"
          onClick={handleDownload}
          disabled={!ready || downloading}
        >
          {downloading ? "Đang tải..." : "Tải ảnh về"}
        </button>
      </div>
    </div>
  );
}
