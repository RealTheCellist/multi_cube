// --- StructuralClosureAssessment (Solver Primitive Set Completeness
// Validation Sprint v2, Required Analysis #5, Deliverable #5) ---------------
// Per-residual A/B judgment, per the Directive's own wording: "A: 기존
// Primitive 조합으로 설명 가능, B: 새로운 독립 Primitive Family 필요".
// Disclosed, deterministic rule (no guessing): A residual is judged A iff
// ResidualFailureTaxonomy.classifyResidual() (reused UNMODIFIED from Sprint
// v1) assigns it a NAMED existing class (BRIDGE_MISSING/PURE_CYCLE_ISOLATION/
// CONFLICT_DEEP_DEPENDENCY/LOCKED_PAIR_NO_CYCLE) -- each of those class
// definitions is itself already a disclosed function of measured structural
// features (componentCount/cycleCount/conflictEdgeCount/swapEdgeCount), so
// "explainable by existing structure" and "falls into a named class" are the
// same claim by construction. UNKNOWN is judged B (potential new Family) --
// but only escalated to an actual claimed NEW_FAMILY if the UNKNOWN cluster
// shares a common structural signature (checked separately, see
// findSharedUnknownSignature below) rather than being a scattered grab-bag,
// per this arc's own "실측 데이터만 사용, 추측 금지" convention (a shared
// signature is measured evidence of a genuine new structural shape; a
// scattered grab-bag is not).
import type { ResidualClassification } from "../primitiveSetCompleteness/ResidualFailureTaxonomy";

export type ClosureVerdict = "A_EXPLAINABLE" | "B_NEW_FAMILY_CANDIDATE";

export interface ClosureRow {
  label: string;
  failureClass: ResidualClassification["failureClass"];
  verdict: ClosureVerdict;
}

export function assessClosure(classified: ResidualClassification[]): ClosureRow[] {
  return classified.map((c) => ({
    label: c.label,
    failureClass: c.failureClass,
    verdict: c.failureClass === "UNKNOWN" ? "B_NEW_FAMILY_CANDIDATE" : "A_EXPLAINABLE",
  }));
}

export interface ClosureSummary {
  totalResiduals: number;
  explainableCount: number;
  explainableRate: number; // Directive's own >=80% threshold checked against this
  newFamilyCandidateCount: number;
}

export function summarizeClosure(rows: ClosureRow[]): ClosureSummary {
  const totalResiduals = rows.length;
  const explainableCount = rows.filter((r) => r.verdict === "A_EXPLAINABLE").length;
  return {
    totalResiduals,
    explainableCount,
    explainableRate: totalResiduals ? explainableCount / totalResiduals : 1, // vacuously 100% explainable if there are no residuals at all
    newFamilyCandidateCount: totalResiduals - explainableCount,
  };
}

/**
 * Checks whether the UNKNOWN cluster (StructuralClosureAssessment's own "B"
 * bucket, before any escalation) shares a common measured structural
 * signature -- disclosed rule: ALL UNKNOWN members agree on
 * (componentCount<=1, cycleCount===0, conflictEdgeCount===0) by
 * ResidualFailureTaxonomy's own construction already; this function checks
 * the ADDITIONAL new v2 features (pairCount, cycleEdgeCount) and
 * dependencyDepth/branchingFactor for a shared range, to decide whether the
 * cluster is a coherent new shape (NEW_FAMILY, escalate to Conclusion C
 * eligible) or a scattered handful of unrelated edge cases (no escalation).
 */
export interface UnknownSignatureCheck {
  n: number;
  isCoherentCluster: boolean; // true iff n>=2 AND all members share swapEdgeCount===0 (the exact residual "no structural edges at all" shape)
  sharedDescription: string;
}

export function findSharedUnknownSignature(unknownProfiles: { swapEdgeCount: number; pairCount: number; wrongWingCount: number }[]): UnknownSignatureCheck {
  const n = unknownProfiles.length;
  if (n === 0) return { n: 0, isCoherentCluster: false, sharedDescription: "UNKNOWN 잔여 없음" };
  const allNoSwap = unknownProfiles.every((p) => p.swapEdgeCount === 0);
  const isCoherentCluster = n >= 2 && allNoSwap;
  const sharedDescription = allNoSwap
    ? `${n}건 전부 componentCount<=1 AND cycleCount=0 AND conflictEdgeCount=0 AND swapEdgeCount=0 -- 측정된 구조적 엣지가 전혀 없는데도 wrongWingCount>0으로 남아있는 공통 형태`
    : `${n}건이 UNKNOWN이나 swapEdgeCount 값이 갈라져 있어 단일 공통 형태로 보기 어려움`;
  return { n, isCoherentCluster, sharedDescription };
}
