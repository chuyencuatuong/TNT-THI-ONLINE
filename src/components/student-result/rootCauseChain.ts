import {
  buildPrereqTree,
  computeRootCauseCandidates,
  type LessonEvidence,
  type PrereqEdge,
  type PrereqTreeNode,
  type RootCauseCandidate,
} from "../../lib/knowledgeGraph";
import type { RootCauseHint } from "../../lib/resultReport";
import type { TopChain } from "./DiagnosisChapter";
import { formatPoints } from "./resultFormat";

/**
 * Chọn 1 mắt xích gốc rễ mạnh nhất (theo attributionScore của engine) cho
 * các Bài rơi nhiều điểm nhất ở đề này, kèm đường đi Bài nền tảng → [trung
 * gian] → Bài trong đề. Câu giải thích lấy NGUYÊN VĂN từ computeRootCauseCandidates.
 */

function findPath(node: PrereqTreeNode, lessonId: string): PrereqTreeNode[] | null {
  if (node.lessonId === lessonId && node.depth > 0) return [node];
  for (const c of node.children) {
    const sub = findPath(c, lessonId);
    if (sub) return [node, ...sub];
  }
  return null;
}

export function topRootCauseChain(input: {
  targets: { lessonId: string; name: string; lost: number }[];
  edges: PrereqEdge[];
  lessonNames: Map<string, string>;
  lessonGrades: Map<string, number>;
  evidence: Map<string, LessonEvidence>;
}): { chain: TopChain; hint: RootCauseHint } | null {
  let best: { cand: RootCauseCandidate; path: PrereqTreeNode[]; target: { lessonId: string; name: string; lost: number } } | null = null;
  const seen = new Set<string>();
  for (const t of input.targets) {
    const tree = buildPrereqTree(t.lessonId, input.edges, input.lessonNames, input.evidence);
    for (const cand of computeRootCauseCandidates(tree)) {
      seen.add(cand.lessonId);
      const down = findPath(tree, cand.lessonId);
      if (down && (!best || cand.attributionScore > best.cand.attributionScore)) {
        best = { cand, path: [...down].reverse(), target: t };
      }
    }
  }
  if (!best) return null;
  const grade = (id: string) => input.lessonGrades.get(id) ?? null;
  const gradeTxt = (id: string, fallback: string) => (grade(id) ? `Lớp ${grade(id)}` : fallback);
  const nodes = best.path.map((n, i, arr) => {
    const isOrigin = i === 0;
    const isTarget = i === arr.length - 1;
    const ev = n.evidence;
    return {
      kind: (isOrigin ? "origin" : isTarget ? "target" : "mid") as "origin" | "mid" | "target",
      role: isTarget
        ? `Bài trong đề · ${gradeTxt(n.lessonId, "bài đang xét")}`
        : isOrigin
          ? `Bài nền tảng · ${gradeTxt(n.lessonId, "nghi vấn")}`
          : `Bài trung gian · ${gradeTxt(n.lessonId, "nền tảng")}`,
      name: n.name,
      evidence: isTarget
        ? `Rơi −${formatPoints(best!.target.lost)} điểm ở đề này`
        : isOrigin
          ? `Tích luỹ: đúng ${best!.cand.accuracyPercent}% · ${best!.cand.sampleCount} câu`
          : ev && ev.diagnosis.sampleCount > 0
            ? `Tích luỹ: đúng ${Math.round(ev.diagnosis.avgScoreRatio * 100)}% · ${ev.diagnosis.sampleCount} câu`
            : "Chưa có dữ liệu",
    };
  });
  return {
    chain: { nodes, explanation: best.cand.explanation, moreCount: Math.max(0, seen.size - 1) },
    hint: { foundationName: best.cand.name, foundationGrade: grade(best.cand.lessonId), targetName: best.target.name },
  };
}
