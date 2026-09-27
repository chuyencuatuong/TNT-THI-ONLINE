/**
 * Module 3 — Knowledge Graph & Candidate Root-Cause Engine (củng cố 27/09/2026).
 * Hàm thuần, không gọi AI, không phụ thuộc DB.
 *
 * Đồ thị CHỈ có cạnh "Bài B là nền tảng cho Bài A" giữa các lessons (bảng
 * skill_prerequisites, migration_020) — cố tình thưa, hiển thị dạng CÂY phân
 * nhánh có hướng (không phải mạng nhện).
 *
 * NGUYÊN TẮC BẮT BUỘC: gốc rễ chỉ là ỨNG VIÊN (candidate), KHÔNG BAO GIỜ là
 * kết luận đã chứng minh. Câu giải thích duy nhất được phép hiển thị được sinh
 * cứng trong computeRootCauseCandidates() — UI không tự ghép câu khác, để
 * không nơi nào vô tình in ra câu khẳng định kiểu "X là nguyên nhân khiến em
 * yếu Y".
 */

import type { TopicDiagnosis } from "./diagnosis";
import type { ErrorInstance } from "./errorIntelligence";
import type { ErrorInstanceType } from "./types";

export interface PrereqEdge {
  id?: string;
  lessonId: string;
  prerequisiteLessonId: string;
  /** 0..1 — mức độ phụ thuộc (curated thường 0.5-0.9, ppct_order 0.3). */
  weight: number;
  source: "curated" | "ppct_order";
}

export interface LessonEvidence {
  lessonId: string;
  name: string;
  diagnosis: TopicDiagnosis;
  /** Số câu sai theo loại lỗi (chỉ tính các câu đã tra được loại, bỏ unclassified). */
  errorTypeCounts: Partial<Record<ErrorInstanceType, number>>;
  patternLabels: string[];
}

export interface PrereqTreeNode {
  lessonId: string;
  name: string;
  /** Trọng số cạnh nối node này lên node cha — null với node gốc. */
  weight: number | null;
  depth: number;
  evidence: LessonEvidence | null;
  children: PrereqTreeNode[];
}

/** Dựng cây tiên quyết từ 1 Bài gốc đi xuống (Bài nền tảng ở tầng dưới).
 * Chống vòng lặp theo từng nhánh; mặc định sâu tối đa 2 tầng (đủ để đọc, sâu
 * hơn thì bằng chứng quá xa, dễ gây hiểu nhầm). */
export function buildPrereqTree(
  rootLessonId: string,
  edges: PrereqEdge[],
  lessonNames: Map<string, string>,
  evidence: Map<string, LessonEvidence>,
  maxDepth = 2,
): PrereqTreeNode {
  function build(id: string, depth: number, weight: number | null, path: Set<string>): PrereqTreeNode {
    const nextPath = new Set(path).add(id);
    const children =
      depth >= maxDepth
        ? []
        : edges
            .filter((e) => e.lessonId === id && !nextPath.has(e.prerequisiteLessonId))
            .sort((a, b) => b.weight - a.weight)
            .map((e) => build(e.prerequisiteLessonId, depth + 1, e.weight, nextPath));
    return {
      lessonId: id,
      name: lessonNames.get(id) ?? "(Bài không xác định)",
      weight,
      depth,
      evidence: evidence.get(id) ?? null,
      children,
    };
  }
  return build(rootLessonId, 0, null, new Set());
}

export const ROOT_CAUSE_DISCLAIMER =
  "Đây là các gợi ý dựa trên số liệu, không phải kết luận chắc chắn — nên đối chiếu thêm với quan sát thực tế trên lớp.";

const MIN_SAMPLE = 2;
/** Bài gốc được coi là "đang gặp khó khăn". */
const WEAK_TARGET_RATIO = 0.6;
/** Bài nền tảng từ ngưỡng này trở lên coi như vững — không đưa làm ứng viên. */
const SOLID_PREREQ_RATIO = 0.75;
const DEPTH2_DISCOUNT = 0.6;
const MAX_CANDIDATES = 3;

export function isStrugglingLesson(d: TopicDiagnosis): boolean {
  return (
    d.sampleCount >= MIN_SAMPLE &&
    (d.label === "co_lo_hong" || d.label === "mat_goc" || d.avgScoreRatio < WEAK_TARGET_RATIO)
  );
}

const ERROR_TYPE_SHORT: Record<ErrorInstanceType, string> = {
  conceptual: "lỗi khái niệm",
  procedural: "lỗi thủ tục",
  calculation: "lỗi tính toán",
  careless: "lỗi bất cẩn",
  unclassified: "chưa phân loại",
};

export interface RootCauseCandidate {
  lessonId: string;
  name: string;
  depth: number;
  /** Chỉ dùng để SẮP XẾP — không hiển thị như "% chắc chắn". */
  attributionScore: number;
  sampleCount: number;
  accuracyPercent: number;
  similarErrorCount: number;
  similarErrorTypes: ErrorInstanceType[];
  sharedPatternLabels: string[];
  isCandidate: true;
  explanation: string;
}

/** Xây bằng chứng cho từng Bài từ chẩn đoán + danh sách câu sai. */
export function buildLessonEvidence(
  lessons: { lessonId: string; name: string; diagnosis: TopicDiagnosis }[],
  instances: ErrorInstance[],
): Map<string, LessonEvidence> {
  const map = new Map<string, LessonEvidence>();
  for (const l of lessons) {
    const own = instances.filter((i) => i.lessonId === l.lessonId);
    const errorTypeCounts: Partial<Record<ErrorInstanceType, number>> = {};
    for (const i of own) {
      if (i.errorType === "unclassified") continue;
      errorTypeCounts[i.errorType] = (errorTypeCounts[i.errorType] ?? 0) + 1;
    }
    map.set(l.lessonId, {
      lessonId: l.lessonId,
      name: l.name,
      diagnosis: l.diagnosis,
      errorTypeCounts,
      patternLabels: Array.from(new Set(own.map((i) => i.patternLabel).filter((x): x is string => !!x))),
    });
  }
  return map;
}

function flatten(node: PrereqTreeNode): PrereqTreeNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/**
 * Ứng viên gốc rễ cho 1 Bài đang gặp khó khăn. Rỗng nếu Bài gốc không yếu
 * hoặc chưa đủ dữ liệu. Mỗi ứng viên phải: có ≥ 2 câu dữ liệu và chưa vững
 * (< 75%). Điểm xếp hạng = trọng số cạnh + mức yếu của Bài nền tảng + khoảng
 * cách so với Bài gốc + số lỗi tương đồng (cùng loại lỗi đã phân loại được).
 */
export function computeRootCauseCandidates(tree: PrereqTreeNode): RootCauseCandidate[] {
  const target = tree.evidence;
  if (!target || !isStrugglingLesson(target.diagnosis)) return [];
  const targetTypes = Object.keys(target.errorTypeCounts) as ErrorInstanceType[];

  const seen = new Set<string>();
  const candidates: RootCauseCandidate[] = [];
  for (const node of flatten(tree).slice(1)) {
    if (seen.has(node.lessonId)) continue;
    seen.add(node.lessonId);
    const ev = node.evidence;
    if (!ev || ev.diagnosis.sampleCount < MIN_SAMPLE) continue;
    if (ev.diagnosis.avgScoreRatio >= SOLID_PREREQ_RATIO) continue;

    const similarErrorTypes = targetTypes.filter((t) => (ev.errorTypeCounts[t] ?? 0) > 0);
    const similarErrorCount = similarErrorTypes.reduce((s, t) => s + (ev.errorTypeCounts[t] ?? 0), 0);
    const sharedPatternLabels = ev.patternLabels.filter((l) => target.patternLabels.includes(l));

    const weight = (node.weight ?? 0.3) * (node.depth >= 2 ? DEPTH2_DISCOUNT : 1);
    const weakness = 1 - ev.diagnosis.avgScoreRatio;
    const gap = Math.max(0, target.diagnosis.avgScoreRatio - ev.diagnosis.avgScoreRatio);
    const similarity = Math.min(1, (similarErrorCount + sharedPatternLabels.length) / 3);
    const attributionScore = Math.round((weight * 0.35 + weakness * 0.35 + gap * 0.1 + similarity * 0.2) * 100) / 100;

    const pPct = Math.round(ev.diagnosis.avgScoreRatio * 100);
    const tPct = Math.round(target.diagnosis.avgScoreRatio * 100);
    let evidenceTail: string;
    if (similarErrorCount > 0) {
      evidenceTail = `, kèm ${similarErrorCount} lỗi tương đồng đã ghi nhận (${similarErrorTypes
        .map((t) => ERROR_TYPE_SHORT[t])
        .join(", ")})`;
      if (sharedPatternLabels.length > 0) {
        evidenceTail += `, cùng mẫu lỗi ${sharedPatternLabels.map((l) => `"${l}"`).join(", ")}`;
      }
    } else if (sharedPatternLabels.length > 0) {
      evidenceTail = `, kèm cùng mẫu lỗi ${sharedPatternLabels.map((l) => `"${l}"`).join(", ")}`;
    } else {
      evidenceTail = "; chưa ghi nhận lỗi tương đồng giữa 2 bài";
    }

    candidates.push({
      lessonId: node.lessonId,
      name: node.name,
      depth: node.depth,
      attributionScore,
      sampleCount: ev.diagnosis.sampleCount,
      accuracyPercent: pPct,
      similarErrorCount,
      similarErrorTypes,
      sharedPatternLabels,
      isCandidate: true,
      explanation:
        `TNT nhận thấy khó khăn ở "${target.name}" có thể liên quan đến "${node.name}" — ` +
        `Dựa trên: ${ev.diagnosis.sampleCount} câu "${node.name}" (đúng ${pPct}%), ` +
        `${target.diagnosis.sampleCount} câu "${target.name}" (đúng ${tPct}%)${evidenceTail}.`,
    });
  }
  return candidates.sort((a, b) => b.attributionScore - a.attributionScore).slice(0, MAX_CANDIDATES);
}

/** Chẩn đoán gần đúng từ số liệu gộp cả lớp (chỉ có tổng điểm, không có thời
 * gian/số lần đổi đáp án) — dùng để tô màu cây ở trang Bản đồ kiến thức. Cùng
 * ngưỡng điểm với diagnoseTopic (0.8 / 0.4, tối thiểu 2 câu). */
export function diagnosisFromTotals(total: number, correctScore: number, maxScore: number): TopicDiagnosis {
  const avg = maxScore > 0 ? Math.min(1, correctScore / maxScore) : 0;
  const label: TopicDiagnosis["label"] =
    total < 2 ? "chua_du_du_lieu" : avg >= 0.8 ? "vung" : avg >= 0.4 ? "co_lo_hong" : "mat_goc";
  return { label, sampleCount: total, avgScoreRatio: avg, avgTimeRatio: 0, avgChangeCount: 0, possiblyRushed: false };
}
