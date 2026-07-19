// --- PrimitiveBlueprint (Solver Primitive Blueprint Sprint v1) -----------
// STEP5: reaches this Sprint's required A/B/C conclusion from STEP1~4's
// real measurements:
//   A. Prototype 진행 -- candidates collectively (Union Coverage) target a
//      substantial share of the Gap, and at least one candidate has
//      meaningful individual coverage grounded in real structure.
//   B. Blueprint 보완 필요 -- some real signal exists but coverage is too
//      thin/fragmented to commit to a Prototype yet.
//   C. 새 Primitive 불필요 -- no candidate meaningfully targets the Gap.
import type { CandidateCoverage, UnionCoverageResult } from "./PrimitiveCoverageMatrix";

export type FinalDecision = "A" | "B" | "C";

const SUBSTANTIAL_UNION_COVERAGE_THRESHOLD = 0.4;
const MEANINGFUL_INDIVIDUAL_COVERAGE_THRESHOLD = 0.1;

export interface BlueprintDecision {
  decision: FinalDecision;
  rationale: string;
  recommendedCandidates: string[];
}

// `union` = ALL candidates (raw, includes non-novel ones); `genuineUnion` =
// isGenuinelyNovel candidates only. The decision is driven by genuineUnion
// -- a non-novel candidate's Coverage is real (it does describe part of the
// Gap) but doesn't by itself justify a NEW Primitive per Research Exit
// Criteria ②, so it's reported for transparency but excluded from the
// substantiality gate.
export function buildBlueprint(coverages: readonly CandidateCoverage[], union: UnionCoverageResult, genuineUnion: UnionCoverageResult): BlueprintDecision {
  const meaningful = coverages.filter((c) => c.coverageRate >= MEANINGFUL_INDIVIDUAL_COVERAGE_THRESHOLD);
  const meaningfulNovel = meaningful.filter((c) => c.isGenuinelyNovel);
  const nonNovelNote =
    coverages.some((c) => !c.isGenuinelyNovel && c.coverageRate >= MEANINGFUL_INDIVIDUAL_COVERAGE_THRESHOLD)
      ? ` (참고: ${coverages
          .filter((c) => !c.isGenuinelyNovel && c.coverageRate >= MEANINGFUL_INDIVIDUAL_COVERAGE_THRESHOLD)
          .map((c) => `"${c.name}"(${(c.coverageRate * 100).toFixed(1)}%)`)
          .join(", ")}는 기존 Primitive의 파라미터 확장에 가까워(Research Exit Criteria ②) 이 판정에서 제외했다 -- Raw Union(신규성 무관) ${(union.unionCoverageRate * 100).toFixed(1)}%는 별도 참고.)`
      : "";

  if (meaningfulNovel.length === 0 || genuineUnion.unionCoverageRate < 0.1) {
    return {
      decision: "C",
      rationale: `신규성 있는 후보의 개별 Coverage가 낮고(<${(MEANINGFUL_INDIVIDUAL_COVERAGE_THRESHOLD * 100).toFixed(0)}%) 신규 Union Coverage도 ${(genuineUnion.unionCoverageRate * 100).toFixed(1)}%에 그쳐, 이 Gap을 겨냥한 새 Primitive를 정당화하기 어렵다.${nonNovelNote}`,
      recommendedCandidates: [],
    };
  }

  if (genuineUnion.unionCoverageRate >= SUBSTANTIAL_UNION_COVERAGE_THRESHOLD) {
    return {
      decision: "A",
      rationale: `신규 Union Coverage ${(genuineUnion.unionCoverageRate * 100).toFixed(1)}%로 Gap의 상당 부분을 신규성 있는 후보들이 구조적으로 겨냥하며, ${meaningfulNovel.map((c) => `"${c.name}"(${(c.coverageRate * 100).toFixed(1)}%)`).join(", ")}는 개별 Coverage도 ${(MEANINGFUL_INDIVIDUAL_COVERAGE_THRESHOLD * 100).toFixed(0)}% 이상으로 실측 근거가 뚜렷하다 -- Prototype 진행을 권고한다.${nonNovelNote}`,
      recommendedCandidates: meaningfulNovel.map((c) => c.name),
    };
  }

  return {
    decision: "B",
    rationale: `신규 Union Coverage ${(genuineUnion.unionCoverageRate * 100).toFixed(1)}%로 일부 Gap을 설명하지만 ${(SUBSTANTIAL_UNION_COVERAGE_THRESHOLD * 100).toFixed(0)}% 기준에는 못 미친다 -- 전제조건 재정의 또는 추가 후보 설계로 Blueprint를 보완한 뒤 재평가가 필요하다.${nonNovelNote}`,
    recommendedCandidates: meaningfulNovel.map((c) => c.name),
  };
}
