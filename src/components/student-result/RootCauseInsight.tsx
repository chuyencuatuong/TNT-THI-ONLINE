import { useMemo } from "react";
import {
  buildPrereqTree,
  computeRootCauseCandidates,
  isStrugglingLesson,
  ROOT_CAUSE_DISCLAIMER,
  type LessonEvidence,
  type PrereqEdge,
  type PrereqTreeNode,
  type RootCauseCandidate,
} from "../../lib/knowledgeGraph";
import { formatPoints } from "./resultFormat";

/**
 * Phân mục 06 — Truy vết nguyên nhân gốc rễ trên đồ thị tiên quyết.
 *
 * Với tối đa 3 Bài mất điểm nhiều nhất ở đề này (autopsy.scoreLoss):
 * buildPrereqTree -> computeRootCauseCandidates. Mỗi ứng viên vẽ thành 1 chuỗi
 * mắt xích: Bài nền tảng (vd Lớp 11) -> [Bài trung gian] -> Bài trong đề (vd
 * Lớp 12), kèm câu giải thích lấy NGUYÊN VĂN từ computeRootCauseCandidates và
 * ROOT_CAUSE_DISCLAIMER bắt buộc (nguyên tắc ở đầu knowledgeGraph.ts: gốc rễ
 * chỉ là ỨNG VIÊN, UI không tự ghép câu khẳng định nào khác).
 *
 * Bằng chứng mỗi Bài (evidence) là số liệu TÍCH LUỸ qua mọi đề của học sinh,
 * không chỉ đề này — đúng như Hồ sơ năng lực.
 */

export interface RootCauseTarget {
  lessonId: string;
  name: string;
  /** Điểm rơi ở CHÍNH đề này. */
  pointsLost: number;
}

interface Chain {
  target: RootCauseTarget;
  candidate: RootCauseCandidate;
  /** Đường đi từ Bài nền tảng lên Bài trong đề (phần tử cuối = Bài trong đề). */
  path: PrereqTreeNode[];
}

const MAX_CHAINS = 3;

/** Đường đi gốc -> node có lessonId (DFS, cây sâu tối đa 2 tầng). */
function findPath(node: PrereqTreeNode, lessonId: string): PrereqTreeNode[] | null {
  if (node.lessonId === lessonId && node.depth > 0) return [node];
  for (const c of node.children) {
    const sub = findPath(c, lessonId);
    if (sub) return [node, ...sub];
  }
  return null;
}

function ArrowIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function RootCauseInsight({
  status,
  tableMissing,
  targets,
  edges,
  lessonNames,
  lessonGrades,
  evidence,
}: {
  status: "loading" | "error" | "ready";
  tableMissing: boolean;
  targets: RootCauseTarget[];
  edges: PrereqEdge[];
  lessonNames: Map<string, string>;
  /** lessonId -> lớp (10/11/12) qua Chương của Bài; thiếu thì không ghi lớp. */
  lessonGrades: Map<string, number>;
  evidence: Map<string, LessonEvidence>;
}) {
  const { chains, notes } = useMemo(() => {
    const chains: Chain[] = [];
    const notes: string[] = [];
    for (const target of targets) {
      const tree = buildPrereqTree(target.lessonId, edges, lessonNames, evidence);
      if (tree.children.length === 0) {
        notes.push(`«${target.name}»: chưa có bài nền tảng nào được khai báo trên bản đồ kiến thức.`);
        continue;
      }
      if (!tree.evidence || !isStrugglingLesson(tree.evidence.diagnosis)) {
        notes.push(
          `«${target.name}»: kết quả tích luỹ qua các đề vẫn ở mức ổn hoặc chưa đủ 2 câu — điểm rơi lần này chưa đủ căn cứ để truy vết xuống bài nền tảng.`,
        );
        continue;
      }
      const candidates = computeRootCauseCandidates(tree);
      if (candidates.length === 0) {
        notes.push(
          `«${target.name}»: các bài nền tảng đang vững hoặc chưa đủ dữ liệu — khó khăn nhiều khả năng nằm ngay trong bài này.`,
        );
        continue;
      }
      for (const candidate of candidates) {
        const down = findPath(tree, candidate.lessonId);
        if (down) chains.push({ target, candidate, path: [...down].reverse() });
      }
    }
    chains.sort((a, b) => b.candidate.attributionScore - a.candidate.attributionScore);
    // Cùng 1 Bài nền tảng có thể là ứng viên cho nhiều Bài trong đề — chỉ giữ
    // chuỗi mạnh nhất của mỗi Bài nền tảng để học sinh không đọc lặp lại.
    const seen = new Set<string>();
    const unique = chains.filter((c) => !seen.has(c.candidate.lessonId) && !!seen.add(c.candidate.lessonId));
    return { chains: unique.slice(0, MAX_CHAINS), notes };
  }, [targets, edges, lessonNames, evidence]);

  if (status === "loading") {
    return <div className="student-intelligence-skeleton" aria-busy="true">Đang dò các mắt xích kiến thức nền…</div>;
  }
  if (status === "error") {
    return (
      <div className="student-intelligence-placeholder">
        Chưa tải được bản đồ kiến thức để truy vết. Em có thể xem hồ sơ theo từng bài ở trang Hồ sơ năng lực.
      </div>
    );
  }
  if (tableMissing) {
    return (
      <div className="student-intelligence-placeholder">
        Bản đồ bài nền tảng chưa được thiết lập nên phần truy vết chưa khả dụng.
      </div>
    );
  }
  if (targets.length === 0) {
    return (
      <p className="student-intelligence-quiet">
        Không có bài nào mất điểm (hoặc các câu mất điểm chưa được gán Bài), nên chưa cần truy vết.
      </p>
    );
  }

  const gradeLabel = (id: string, fallback: string) => {
    const g = lessonGrades.get(id);
    return g ? `Lớp ${g}` : fallback;
  };

  return (
    <div className="student-intelligence-rootcause">
      {chains.length > 0 ? (
        <ol className="student-intelligence-chains">
          {chains.map(({ target, candidate, path }) => {
            const ev = path[0].evidence;
            return (
              <li key={`${target.lessonId}:${candidate.lessonId}`} className="student-intelligence-chain">
                <span className="student-intelligence-insight-kicker">Mắt xích có thể liên quan</span>
                <div className="student-intelligence-chain-flow">
                  {path.map((node, i) => {
                    const isOrigin = i === 0;
                    const isTarget = i === path.length - 1;
                    return (
                      <div key={node.lessonId} className="student-intelligence-chain-step">
                        {i > 0 && (
                          <span className="student-intelligence-chain-arrow">
                            <ArrowIcon />
                          </span>
                        )}
                        <div
                          className={`student-intelligence-chain-node${isOrigin ? " is-origin" : ""}${
                            isTarget ? " is-target" : ""
                          }`}
                        >
                          <span className="student-intelligence-chain-role">
                            {isTarget
                              ? `Bài trong đề · ${gradeLabel(node.lessonId, "bài đang xét")}`
                              : isOrigin
                                ? `Bài nền tảng · ${gradeLabel(node.lessonId, "nghi vấn")}`
                                : `Bài trung gian · ${gradeLabel(node.lessonId, "nền tảng")}`}
                          </span>
                          <span className="student-intelligence-chain-name">{node.name}</span>
                          <span className="student-intelligence-chain-evidence">
                            {isTarget
                              ? `Rơi −${formatPoints(target.pointsLost)} điểm ở đề này`
                              : isOrigin && ev
                                ? `Tích luỹ: đúng ${candidate.accuracyPercent}% · ${candidate.sampleCount} câu`
                                : node.evidence && node.evidence.diagnosis.sampleCount > 0
                                  ? `Tích luỹ: đúng ${Math.round(node.evidence.diagnosis.avgScoreRatio * 100)}% · ${node.evidence.diagnosis.sampleCount} câu`
                                  : "Chưa có dữ liệu"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="student-intelligence-chain-explain">{candidate.explanation}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="student-intelligence-quiet">
          Chưa tìm thấy bài nền tảng nào đủ căn cứ để coi là mắt xích liên quan tới điểm rơi lần này.
        </p>
      )}

      {notes.length > 0 && (
        <ul className="student-intelligence-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <p className="student-intelligence-disclaimer" role="note">
        {ROOT_CAUSE_DISCLAIMER}
      </p>
    </div>
  );
}
