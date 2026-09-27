import { Link } from "react-router-dom";
import { MASTERY_COLOR } from "../lib/diagnosis";
import {
  buildPrereqTree,
  computeRootCauseCandidates,
  isStrugglingLesson,
  ROOT_CAUSE_DISCLAIMER,
  type LessonEvidence,
  type PrereqEdge,
  type PrereqTreeNode,
} from "../lib/knowledgeGraph";
import type { ProfileAudience } from "../lib/learningState";

function dependencyLabel(weight: number | null): string {
  if (weight === null) return "";
  if (weight >= 0.7) return "nền tảng quan trọng";
  if (weight >= 0.45) return "nền tảng";
  return "liên quan theo thứ tự bài";
}

function NodeView({ node, candidateIds, isRoot }: { node: PrereqTreeNode; candidateIds: Set<string>; isRoot: boolean }) {
  const ev = node.evidence;
  const hasData = !!ev && ev.diagnosis.sampleCount > 0;
  const cls = [
    "li-tree-node",
    isRoot ? "li-tree-node--root" : "",
    candidateIds.has(node.lessonId) ? "li-tree-node--candidate" : "",
  ].join(" ");
  return (
    <li>
      <span className={cls}>
        {!isRoot && <span className="li-tree-edge">↑ {dependencyLabel(node.weight)}</span>}
        <span>{node.name}</span>
        {hasData ? (
          <span className="diagnosis-badge" style={{ background: MASTERY_COLOR[ev!.diagnosis.label] }}>
            {Math.round(ev!.diagnosis.avgScoreRatio * 100)}% · {ev!.diagnosis.sampleCount} câu
          </span>
        ) : (
          <span className="li-tree-edge">chưa có dữ liệu</span>
        )}
      </span>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <NodeView key={`${node.lessonId}-${c.lessonId}`} node={c} candidateIds={candidateIds} isRoot={false} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Module 3 — cây phân nhánh có hướng (Bài đang xét ở gốc, các Bài nền tảng
 * bên dưới, mũi tên "↑" = "là nền tảng cho") + ứng viên gốc rễ kèm bằng
 * chứng. Câu giải thích lấy NGUYÊN VĂN từ computeRootCauseCandidates — không
 * tự ghép câu khác ở đây (xem nguyên tắc đầu file knowledgeGraph.ts).
 */
export function RootCauseTree({
  lessonId,
  edges,
  tableMissing,
  lessonNames,
  evidence,
  audience,
  showCandidates = true,
}: {
  lessonId: string;
  edges: PrereqEdge[];
  tableMissing: boolean;
  lessonNames: Map<string, string>;
  evidence: Map<string, LessonEvidence>;
  audience: ProfileAudience;
  /** false = chỉ vẽ cây (vd số liệu cả lớp không có loại lỗi để làm bằng chứng). */
  showCandidates?: boolean;
}) {
  if (tableMissing) {
    return audience === "teacher" ? (
      <p className="ai-hint">Chưa chạy migration_020_knowledge_graph.sql nên chưa có bản đồ Bài nền tảng.</p>
    ) : null;
  }
  const tree = buildPrereqTree(lessonId, edges, lessonNames, evidence);
  if (tree.children.length === 0) {
    return (
      <p className="li-summary-line">
        Chưa khai báo Bài nền tảng cho Bài này
        {audience === "teacher" && (
          <>
            {" "}— thêm ở <Link to="/giao-vien/ban-do-kien-thuc">Bản đồ kiến thức</Link>
          </>
        )}
        .
      </p>
    );
  }
  const candidates = showCandidates ? computeRootCauseCandidates(tree) : [];
  const struggling = tree.evidence ? isStrugglingLesson(tree.evidence.diagnosis) : false;
  return (
    <div className="li-rows">
      <ul className="li-tree">
        <NodeView node={tree} candidateIds={new Set(candidates.map((c) => c.lessonId))} isRoot />
      </ul>
      {!showCandidates ? null : !struggling ? (
        <p className="li-summary-line">Bài này chưa ở mức cần tìm gốc rễ (chưa yếu hoặc chưa đủ 2 câu dữ liệu).</p>
      ) : candidates.length === 0 ? (
        <p className="li-summary-line">
          Các Bài nền tảng đang ổn hoặc chưa đủ dữ liệu — khó khăn có thể nằm ngay trong Bài này.
        </p>
      ) : (
        <>
          {candidates.map((c) => (
            <p key={c.lessonId} className="li-candidate">
              {c.explanation}
            </p>
          ))}
          <p className="li-disclaimer">{ROOT_CAUSE_DISCLAIMER}</p>
        </>
      )}
    </div>
  );
}
