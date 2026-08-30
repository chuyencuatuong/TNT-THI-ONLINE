/**
 * Vẽ "thẻ chia sẻ" (share card) 1080x1080 lên canvas — dùng Canvas 2D API
 * thuần, KHÔNG dùng html2canvas/dom-to-image (giữ đúng chủ trương không thêm
 * dependency mới, như cách làm "phiếu kết quả" ở đợt trước dùng @media
 * print). Lý do chọn canvas-vẽ-tay thay vì serialize DOM/SVG rồi rasterize:
 * cách đó dễ bị vỡ font khi ảnh SVG không "thấy" được @font-face của trang,
 * còn vẽ trực tiếp lên canvas thì luôn dùng đúng font đã tải trên trang
 * (miễn đợi `document.fonts.ready` trước khi vẽ chữ).
 *
 * 2 loại thẻ, đúng 2 mẫu đã duyệt (xem trao đổi 25/08/2026):
 * - "progress": cải thiện điểm so với lần làm gần nhất của MỘT đề cụ thể.
 * - "streak": số ngày ôn tập liên tiếp.
 * Cả 2 đều CHỈ so sánh học sinh với chính họ ở quá khứ — không xếp hạng,
 * không so với học sinh khác, đúng nguyên tắc chung của toàn bộ app.
 */

export type ShareCardData =
  | {
      kind: "progress";
      /** Chuỗi điểm chênh lệch đã có dấu, ví dụ "+1.5" (không âm — chỉ nên
       * gọi hàm này khi có cải thiện thật sự, việc lọc điều kiện này thuộc
       * về nơi gọi, không phải module vẽ). */
      deltaText: string;
      examTitle: string;
      /** Tối thiểu 2 điểm số gần nhất theo thứ tự thời gian tăng dần, dùng
       * vẽ đường xu hướng nhỏ phía dưới. */
      sparkline: number[];
    }
  | {
      kind: "streak";
      days: number;
      levelLabel: string;
    };

const CARD_SIZE = 1080;
const FONT_FAMILY = '"Be Vietnam Pro", "Segoe UI", sans-serif';

const COLOR = {
  cream: "#f6ecd8",
  gold: "#c9973f",
  goldLight: "#e8c078",
  pillText: "#f0d9a8",
};

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function measureSpacedText(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, CARD_SIZE * 0.35, CARD_SIZE);
  grad.addColorStop(0, "#33090d");
  grad.addColorStop(0.55, "#1c0507");
  grad.addColorStop(1, "#0a0302");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  const r1 = ctx.createRadialGradient(
    CARD_SIZE * 0.12,
    CARD_SIZE * 0.06,
    0,
    CARD_SIZE * 0.12,
    CARD_SIZE * 0.06,
    CARD_SIZE * 0.5,
  );
  r1.addColorStop(0, "rgba(201,151,63,0.34)");
  r1.addColorStop(1, "rgba(201,151,63,0)");
  ctx.fillStyle = r1;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  const r2 = ctx.createRadialGradient(
    CARD_SIZE * 0.9,
    CARD_SIZE * 0.94,
    0,
    CARD_SIZE * 0.9,
    CARD_SIZE * 0.94,
    CARD_SIZE * 0.55,
  );
  r2.addColorStop(0, "rgba(201,151,63,0.20)");
  r2.addColorStop(1, "rgba(201,151,63,0)");
  ctx.fillStyle = r2;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
}

// Chữ toán học mờ phía sau làm nền — gợi thương hiệu "Toán học TNT" mà
// không rối, vị trí đã canh tay qua bản xem thử canvas_preview.html.
function drawGlyphWatermarks(ctx: CanvasRenderingContext2D, kind: ShareCardData["kind"]) {
  ctx.save();
  ctx.fillStyle = "rgba(201,151,63,0.16)";
  const [g1, g2] = kind === "progress" ? ["∑", "√x"] : ["π", "ƒ(x)"];

  ctx.save();
  ctx.font = `800 480px ${FONT_FAMILY}`;
  ctx.translate(20, 430);
  ctx.rotate((-14 * Math.PI) / 180);
  ctx.fillText(g1, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.font = `800 380px ${FONT_FAMILY}`;
  ctx.translate(620, 1010);
  ctx.rotate((9 * Math.PI) / 180);
  ctx.fillText(g2, 0, 0);
  ctx.restore();

  ctx.restore();
}

function drawGlow(ctx: CanvasRenderingContext2D) {
  const cx = CARD_SIZE / 2;
  const cy = CARD_SIZE * 0.46;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 280);
  g.addColorStop(0, "rgba(201,151,63,0.45)");
  g.addColorStop(0.45, "rgba(201,151,63,0.12)");
  g.addColorStop(1, "rgba(201,151,63,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
}

function drawFrame(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = "rgba(201,151,63,0.4)";
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, 24, 24, CARD_SIZE - 48, CARD_SIZE - 48, 40);
  ctx.stroke();

  ctx.strokeStyle = "rgba(201,151,63,0.16)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, 34, 34, CARD_SIZE - 68, CARD_SIZE - 68, 32);
  ctx.stroke();
  ctx.restore();
}

function drawBrandRow(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  ctx.save();
  const logoH = 86;
  let x = 64;
  const y = 60;
  if (logo) {
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, x, y, logoW, logoH);
    x += logoW + 20;
  }
  ctx.font = `700 30px ${FONT_FAMILY}`;
  ctx.textBaseline = "middle";
  const ty = y + logoH / 2;
  ctx.fillStyle = COLOR.cream;
  drawSpacedText(ctx, "TOÁN HỌC ", x, ty, 2.2);
  const w1 = measureSpacedText(ctx, "TOÁN HỌC ", 2.2);
  ctx.fillStyle = COLOR.gold;
  drawSpacedText(ctx, "TNT", x + w1, ty, 2.2);
  ctx.restore();
}

function drawEyebrow(ctx: CanvasRenderingContext2D, text: string, centerY: number) {
  ctx.save();
  ctx.font = `800 34px ${FONT_FAMILY}`;
  ctx.fillStyle = COLOR.goldLight;
  ctx.textBaseline = "middle";
  const spacing = 4;
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let cx = CARD_SIZE / 2 - total / 2;
  for (const ch of text) {
    ctx.fillText(ch, cx, centerY);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.restore();

  ctx.save();
  const barY = centerY + 28;
  const barGrad = ctx.createLinearGradient(CARD_SIZE / 2 - 32, 0, CARD_SIZE / 2 + 32, 0);
  barGrad.addColorStop(0, "rgba(201,151,63,0)");
  barGrad.addColorStop(0.5, COLOR.gold);
  barGrad.addColorStop(1, "rgba(201,151,63,0)");
  ctx.fillStyle = barGrad;
  roundedRectPath(ctx, CARD_SIZE / 2 - 32, barY, 64, 4, 2);
  ctx.fill();
  ctx.restore();
}

/** Vẽ số lớn kiểu gradient vàng (điểm cải thiện / số ngày) — trả về bề rộng
 * chữ đã vẽ để nơi gọi có thể đặt thêm đơn vị (vd "điểm") ngay sau. */
function drawGradientNumber(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  fontSize: number,
): number {
  ctx.save();
  ctx.font = `800 ${fontSize}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const w = ctx.measureText(text).width;
  const grad = ctx.createLinearGradient(
    0,
    baselineY - fontSize * 0.78,
    0,
    baselineY + fontSize * 0.06,
  );
  grad.addColorStop(0, "#fbf2df");
  grad.addColorStop(0.55, "#d9a955");
  grad.addColorStop(1, "#a87428");
  ctx.shadowColor = "rgba(201,151,63,0.45)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = grad;
  ctx.fillText(text, centerX, baselineY);
  ctx.restore();
  return w;
}

function drawExamPill(ctx: CanvasRenderingContext2D, text: string, centerX: number, centerY: number) {
  ctx.save();
  ctx.font = `600 28px ${FONT_FAMILY}`;
  const paddingX = 40;
  const maxTextW = 760;
  let displayText = text;
  while (ctx.measureText(displayText).width > maxTextW && displayText.length > 1) {
    displayText = displayText.slice(0, -2) + "…";
  }
  const w = ctx.measureText(displayText).width + paddingX * 2;
  const h = 68;
  const x = centerX - w / 2;
  const y = centerY - h / 2;
  ctx.fillStyle = "rgba(246,236,216,0.09)";
  ctx.strokeStyle = "rgba(246,236,216,0.22)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR.cream;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayText, centerX, centerY + 1);
  ctx.restore();
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.font = `600 24px ${FONT_FAMILY}`;
  ctx.textBaseline = "middle";
  const y = CARD_SIZE - 68;
  const t1 = "TOANHOCTNT.VN";
  const t2 = "Luyện thi cùng Thầy Tường";
  const spacing = 1;
  const w1 = measureSpacedText(ctx, t1, spacing);
  const w2 = measureSpacedText(ctx, t2, spacing);
  const dotGap = 12;
  const dotR = 3;
  const total = w1 + dotGap * 2 + dotR * 2 + w2;
  let x = CARD_SIZE / 2 - total / 2;
  ctx.fillStyle = "rgba(246,236,216,0.6)";
  drawSpacedText(ctx, t1, x, y, spacing);
  x += w1 + dotGap;
  ctx.beginPath();
  ctx.arc(x + dotR, y, dotR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(246,236,216,0.45)";
  ctx.fill();
  x += dotR * 2 + dotGap;
  ctx.fillStyle = "rgba(246,236,216,0.6)";
  drawSpacedText(ctx, t2, x, y, spacing);
  ctx.restore();
}

function drawSparkline(
  ctx: CanvasRenderingContext2D,
  scores: number[],
  centerX: number,
  topY: number,
) {
  const w = 460;
  const h = 160;
  const x0 = centerX - w / 2;
  const y0 = topY;
  const pad = 14;
  const min = Math.min(...scores) - 0.4;
  const max = Math.max(...scores) + 0.4;
  const range = Math.max(0.5, max - min);
  const denom = Math.max(1, scores.length - 1);
  const pts = scores.map((s, i) => {
    const px = x0 + pad + (i / denom) * (w - pad * 2);
    const py = y0 + h - pad - ((s - min) / range) * (h - pad * 2);
    return [px, py] as const;
  });

  ctx.save();
  const areaGrad = ctx.createLinearGradient(0, y0, 0, y0 + h);
  areaGrad.addColorStop(0, "rgba(201,151,63,0.4)");
  areaGrad.addColorStop(1, "rgba(201,151,63,0)");
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.lineTo(pts[pts.length - 1][0], y0 + h);
  ctx.lineTo(pts[0][0], y0 + h);
  ctx.closePath();
  ctx.fillStyle = areaGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = COLOR.goldLight;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  pts.forEach(([px, py], i) => {
    const isLast = i === pts.length - 1;
    ctx.beginPath();
    ctx.arc(px, py, isLast ? 12 : 8, 0, Math.PI * 2);
    ctx.fillStyle = isLast
      ? COLOR.goldLight
      : `rgba(246,236,216,${0.45 + 0.45 * (i / Math.max(1, pts.length - 1))})`;
    ctx.fill();
  });
  ctx.restore();
}

function drawRing(ctx: CanvasRenderingContext2D, centerX: number, centerY: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 204, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(246,236,216,0.16)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, 186, 0, Math.PI * 2);
  ctx.strokeStyle = COLOR.gold;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
}

function drawStreakDots(ctx: CanvasRenderingContext2D, count: number, centerX: number, centerY: number) {
  // Giới hạn tối đa 14 chấm trên 1 hàng — chuỗi dài hơn vẫn hiển thị đúng số
  // ngày ở số lớn phía trên, hàng chấm chỉ mang tính minh hoạ nên không cần
  // vẽ tràn hết chiều rộng thẻ.
  const shown = Math.min(count, 14);
  const dotSize = shown > 10 ? 20 : 30;
  const gap = shown > 10 ? 12 : 20;
  const total = shown * dotSize + (shown - 1) * gap;
  let x = centerX - total / 2 + dotSize / 2;
  for (let i = 0; i < shown; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, centerY, dotSize / 2, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(x, centerY - dotSize / 2, x, centerY + dotSize / 2);
    g.addColorStop(0, "#fbf2df");
    g.addColorStop(1, COLOR.gold);
    ctx.fillStyle = g;
    ctx.shadowColor = "rgba(201,151,63,0.55)";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
    x += dotSize + gap;
  }
}

function drawLevelPill(ctx: CanvasRenderingContext2D, text: string, centerX: number, centerY: number) {
  ctx.save();
  ctx.font = `700 28px ${FONT_FAMILY}`;
  const paddingX = 38;
  const dotR = 6;
  const gap = 14;
  const textW = ctx.measureText(text).width;
  const w = paddingX * 2 + dotR * 2 + gap + textW;
  const h = 76;
  const x = centerX - w / 2;
  const y = centerY - h / 2;
  ctx.fillStyle = "rgba(201,151,63,0.16)";
  ctx.strokeStyle = "rgba(201,151,63,0.45)";
  roundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();

  const dotX = x + paddingX + dotR;
  ctx.beginPath();
  ctx.arc(dotX, centerY, dotR, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.gold;
  ctx.shadowColor = "rgba(201,151,63,0.8)";
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = COLOR.pillText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, dotX + dotR + gap, centerY + 1);
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Vẽ toàn bộ thẻ chia sẻ lên 1 canvas 1080x1080 có sẵn. `logoUrl` là URL đã
 * qua bundler (import logoMark from "../assets/logo-mark.png") — cùng gốc
 * (same-origin) nên vẽ lên canvas KHÔNG làm canvas bị "tainted", vẫn gọi
 * toBlob()/toDataURL() bình thường để tải ảnh về. */
export async function drawShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  logoUrl: string,
): Promise<void> {
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Đợi web font sẵn sàng — vẽ chữ lên canvas TRƯỚC KHI font tải xong sẽ bị
  // "đóng băng" vĩnh viễn ở font hệ thống mặc định (khác CSS, canvas không tự
  // vẽ lại khi font tải xong sau đó).
  await Promise.all([
    document.fonts.load(`800 300px ${FONT_FAMILY}`),
    document.fonts.load(`700 56px ${FONT_FAMILY}`),
    document.fonts.load(`600 28px ${FONT_FAMILY}`),
    document.fonts.load(`500 36px ${FONT_FAMILY}`),
    document.fonts.ready,
  ]).catch(() => {
    // Không chặn vẽ nếu tra cứu font lỗi — chấp nhận fallback font hệ thống.
  });

  const logo = await loadImage(logoUrl).catch(() => null);

  drawBackground(ctx);
  drawGlyphWatermarks(ctx, data.kind);
  drawGlow(ctx);
  drawFrame(ctx);
  drawBrandRow(ctx, logo);

  if (data.kind === "progress") {
    drawEyebrow(ctx, "TIẾN BỘ RÕ RỆT", 274);

    const numY = 480;
    const numCenterX = CARD_SIZE / 2 - 60;
    const numW = drawGradientNumber(ctx, data.deltaText, numCenterX, numY, 280);
    ctx.save();
    ctx.font = `700 56px ${FONT_FAMILY}`;
    ctx.fillStyle = COLOR.cream;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("điểm", numCenterX + numW / 2 + 16, numY - 6);
    ctx.restore();

    ctx.save();
    ctx.font = `500 36px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(246,236,216,0.8)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("so với lần làm gần nhất", CARD_SIZE / 2, numY + 60);
    ctx.restore();

    const sparkline = data.sparkline.length >= 2 ? data.sparkline : [data.sparkline[0] ?? 0, data.sparkline[0] ?? 0];
    drawSparkline(ctx, sparkline, CARD_SIZE / 2, numY + 110);
    drawExamPill(ctx, data.examTitle, CARD_SIZE / 2, numY + 340);
  } else {
    drawEyebrow(ctx, "CHUỖI ÔN TẬP", 274);

    const ringCenterY = 500;
    drawRing(ctx, CARD_SIZE / 2, ringCenterY);
    drawGradientNumber(ctx, String(data.days), CARD_SIZE / 2, ringCenterY + 110, 320);

    ctx.save();
    ctx.font = `500 36px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(246,236,216,0.8)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("ngày ôn tập liên tiếp", CARD_SIZE / 2, ringCenterY + 250);
    ctx.restore();

    drawStreakDots(ctx, data.days, CARD_SIZE / 2, ringCenterY + 310);
    drawLevelPill(ctx, `Cấp độ: ${data.levelLabel}`, CARD_SIZE / 2, ringCenterY + 400);
  }

  drawFooter(ctx);
}

/** Xuất canvas hiện tại thành PNG rồi kích hoạt tải về máy — dùng chung cho
 * cả 2 loại thẻ. Không dùng canvas.toDataURL() (base64 nặng hơn) mà dùng
 * toBlob() + URL.createObjectURL() cho nhẹ. */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Không tạo được ảnh."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}
