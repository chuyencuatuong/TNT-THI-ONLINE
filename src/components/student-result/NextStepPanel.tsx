import { Link } from "react-router-dom";
import type { ErrorInstanceType } from "../../lib/types";
import { ArrowRightIcon } from "./ResultNav";
import { ERROR_TYPE_META } from "./errorTypeMeta";

/**
 * Phân mục 07 — Kế hoạch khắc phục 3 bước, sinh theo quy tắc cố định từ số
 * liệu đã có ở các phân mục trước (không gọi AI, không đoán thêm):
 *  1. Soát lại câu sai (bắt đầu từ Bài rơi nhiều điểm nhất) — nút mở phân mục
 *     08 với bộ lọc "Câu sai" (hoặc "Bỏ trống").
 *  2. Xử lý gốc: bài nền tảng ứng viên (06) nếu có; nếu không thì nhóm lỗi
 *     trội (03); nếu không thì củng cố Bài rơi nhiều điểm nhất (02).
 *  3. Luyện lại ở Ôn tập câu sai, kèm lưu ý mẫu lỗi lặp lại / nhịp độ (05).
 */

export interface NextStepInput {
  wrongCount: number;
  blankCount: number;
  topLossName: string | null;
  /** Nhóm lỗi trội đã định vị (dominantClassifiedError), nếu có. */
  dominantType: Exclude<ErrorInstanceType, "unclassified"> | null;
  rootCause: { foundationName: string; targetName: string } | null;
  recurringLabel: string | null;
  pacingIssue: boolean;
}

interface Step {
  title: string;
  body: string;
  action?: { kind: "button"; label: string; onClick: () => void } | { kind: "link"; label: string; to: string };
}

function buildSteps(d: NextStepInput, onReviewWrong: () => void, onReviewBlank: () => void, onReviewAll: () => void): Step[] {
  const steps: Step[] = [];

  // Bước 1 — quay lại đúng những câu đã mất điểm.
  if (d.wrongCount > 0) {
    steps.push({
      title: d.topLossName
        ? `Soát lại ${d.wrongCount} câu sai, bắt đầu từ «${d.topLossName}»`
        : `Soát lại ${d.wrongCount} câu sai`,
      body: "Trước khi đọc lời giải, tự chỉ ra bước mình đã đi lệch. Ghi lại một dòng cho mỗi câu — đó là tư liệu ôn tập quý nhất.",
      action: { kind: "button", label: `Mở ${d.wrongCount} câu sai`, onClick: onReviewWrong },
    });
  } else if (d.blankCount > 0) {
    steps.push({
      title: `Tự làm lại ${d.blankCount} câu bỏ trống`,
      body: "Làm lại không giới hạn thời gian rồi mới đối chiếu lời giải, để biết mình thiếu kiến thức hay chỉ thiếu thời gian.",
      action: { kind: "button", label: `Mở ${d.blankCount} câu bỏ trống`, onClick: onReviewBlank },
    });
  } else {
    steps.push({
      title: "Đọc lại lời giải các câu vận dụng",
      body: "Em đã giữ trọn điểm. So cách làm của mình với lời giải để tìm lối giải ngắn hơn cho các câu nhiều bước.",
      action: { kind: "button", label: "Xem bài làm", onClick: onReviewAll },
    });
  }

  // Bước 2 — xử lý phần gốc.
  if (d.rootCause) {
    steps.push({
      title: `Ôn lại bài nền tảng «${d.rootCause.foundationName}»`,
      body: `Số liệu các đề trước cho thấy bài này có thể liên quan tới điểm rơi ở «${d.rootCause.targetName}» (xem phân mục 06). Ôn lại trước khi luyện tiếp để không phải sửa cùng một lỗi nhiều lần.`,
      action: { kind: "link", label: "Xem hồ sơ năng lực", to: "/hoc-sinh/ho-so-nang-luc" },
    });
  } else if (d.dominantType) {
    const meta = ERROR_TYPE_META[d.dominantType];
    steps.push({
      title: `Khơi thông nhóm lỗi ${meta.short.toLowerCase()}`,
      body: `${meta.description} ${meta.action}`,
    });
  } else if (d.topLossName) {
    steps.push({
      title: `Củng cố «${d.topLossName}»`,
      body: "Đây là bài rơi nhiều điểm nhất. Xem lại lý thuyết trọng tâm rồi làm thêm 5–10 câu cùng dạng, ưu tiên mức Thông hiểu và Vận dụng.",
      action: { kind: "link", label: "Xem hồ sơ năng lực", to: "/hoc-sinh/ho-so-nang-luc" },
    });
  } else {
    steps.push({
      title: "Nâng dần độ khó",
      body: "Chọn thêm đề có nhiều câu Vận dụng và Vận dụng cao để hồ sơ nhận thức có thêm căn cứ.",
    });
  }

  // Bước 3 — luyện lại có chủ đích.
  const notes: string[] = [];
  if (d.recurringLabel) notes.push(`Đặc biệt chú ý mẫu lỗi «${d.recurringLabel}» — đã lặp lại qua nhiều đề.`);
  if (d.pacingIssue) notes.push("Ở đề tiếp theo, quá 2 lần định mức thời gian thì đánh dấu câu và chuyển tiếp.");
  steps.push({
    title: "Luyện lại cho tới khi thật sự vững",
    body: [
      "Các câu chưa đúng đã được đưa vào nhật ký Ôn tập câu sai — mỗi câu cần làm đúng ở 3 buổi ôn riêng biệt liên tiếp mới được rút khỏi danh sách.",
      ...notes,
    ].join(" "),
    action: { kind: "link", label: "Mở Ôn tập câu sai", to: "/hoc-sinh/on-tap-cau-sai" },
  });

  return steps;
}

export function NextStepPanel({
  data,
  onReviewWrong,
  onReviewBlank,
  onReviewAll,
}: {
  data: NextStepInput;
  onReviewWrong: () => void;
  onReviewBlank: () => void;
  onReviewAll: () => void;
}) {
  const steps = buildSteps(data, onReviewWrong, onReviewBlank, onReviewAll);
  return (
    <ol className="student-intelligence-steps">
      {steps.map((s, i) => (
        <li key={i} className="student-intelligence-step">
          <span className="student-intelligence-step-index" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="student-intelligence-step-body">
            <h3 className="student-intelligence-step-title">{s.title}</h3>
            <p className="student-intelligence-step-text">{s.body}</p>
            {s.action?.kind === "button" && (
              <button
                type="button"
                className={`student-intelligence-button${i === 0 ? " student-intelligence-button--primary" : ""}`}
                onClick={s.action.onClick}
              >
                {s.action.label}
                <ArrowRightIcon />
              </button>
            )}
            {s.action?.kind === "link" && (
              <Link className="student-intelligence-button" to={s.action.to}>
                {s.action.label}
                <ArrowRightIcon />
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
