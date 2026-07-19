// --- BlueprintFailureAnalysis (Solver Primitive Blueprint Refinement
// Sprint v1) -------------------------------------------------------------
// STEP1: for the Gap replays NOT covered by Primitive Blueprint Sprint
// v1's genuinely-novel candidates (Slot Perturbation + Multi-Hop Bridge --
// Parity-Aware Extended Search excluded, it's not genuinely novel), this
// diagnoses WHICH precondition clause blocks each uncovered replay from
// the NEAREST candidate, and how often each clause is the blocker overall
// -- directly answering Q1/Q2 ("Preconditions가 지나치게 좁은가?").
// Reuses Blueprint Sprint v1's own GapStructuralAnalysis/PrimitiveCandidates/
// PrimitiveCoverageMatrix (unmodified, read-only).
import type { GapReplayFeatures } from "../solverPrimitiveBlueprint/GapStructuralAnalysis";
import { CANDIDATE_PRIMITIVES } from "../solverPrimitiveBlueprint/PrimitiveCandidates";
import { computeCoverage, computeGenuineNovelUnionCoverage } from "../solverPrimitiveBlueprint/PrimitiveCoverageMatrix";

function diagnoseSlotPerturbation(f: GapReplayFeatures): string[] {
  const failing: string[] = [];
  if (f.cycleCount !== 0) failing.push(`cycleCount=${f.cycleCount}(needs 0)`);
  if (f.swapEdgeCount !== 0) failing.push(`swapEdgeCount=${f.swapEdgeCount}(needs 0)`);
  if (f.conflictEdgeCount !== 0) failing.push(`conflictEdgeCount=${f.conflictEdgeCount}(needs 0)`);
  return failing;
}

function diagnoseMultiHopBridge(f: GapReplayFeatures): string[] {
  const failing: string[] = [];
  if (!(f.wrongWingCount >= 3 && f.wrongWingCount <= 8)) failing.push(`wrongWingCount=${f.wrongWingCount}(needs 3-8)`);
  if (!(f.cycleCount <= 1)) failing.push(`cycleCount=${f.cycleCount}(needs <=1)`);
  if (f.swapEdgeCount !== 0) failing.push(`swapEdgeCount=${f.swapEdgeCount}(needs 0)`);
  return failing;
}

export interface UncoveredReplayDiagnosis {
  hash: string;
  features: GapReplayFeatures;
  nearestCandidate: string;
  failingClauses: string[];
}

export interface BlueprintFailureReport {
  gapTotal: number;
  genuineCoveredCount: number;
  uncoveredCount: number;
  uncoveredFeatures: GapReplayFeatures[];
  diagnoses: UncoveredReplayDiagnosis[];
  clauseFailureFrequency: { axis: string; count: number }[];
  summary: string;
}

export function analyzeBlueprintFailure(gapFeatures: readonly GapReplayFeatures[]): BlueprintFailureReport {
  const coverages = computeCoverage(CANDIDATE_PRIMITIVES, gapFeatures);
  const genuineUnion = computeGenuineNovelUnionCoverage(coverages, gapFeatures);
  const uncoveredSet = new Set(genuineUnion.uncoveredHashes);
  const uncoveredFeatures = gapFeatures.filter((f) => uncoveredSet.has(f.hash));

  const diagnoses: UncoveredReplayDiagnosis[] = uncoveredFeatures.map((f) => {
    const slotFailing = diagnoseSlotPerturbation(f);
    const bridgeFailing = diagnoseMultiHopBridge(f);
    const useSlot = slotFailing.length <= bridgeFailing.length;
    return {
      hash: f.hash,
      features: f,
      nearestCandidate: useSlot ? "Slot Perturbation Primitive (고립 Wrong Wing 해소)" : "Low-Structure Multi-Hop Bridge (2~3-hop 확장 탐색)",
      failingClauses: useSlot ? slotFailing : bridgeFailing,
    };
  });

  const clauseCounts = new Map<string, number>();
  for (const d of diagnoses) {
    for (const clause of d.failingClauses) {
      const axis = clause.split("=")[0];
      clauseCounts.set(axis, (clauseCounts.get(axis) ?? 0) + 1);
    }
  }
  const clauseFailureFrequency = [...clauseCounts.entries()].map(([axis, count]) => ({ axis, count })).sort((a, b) => b.count - a.count);

  const summary =
    `Gap ${gapFeatures.length}건 중 신규성 있는 후보(Slot Perturbation/Multi-Hop Bridge)로 커버된 것은 ${gapFeatures.length - uncoveredFeatures.length}건, 미커버 ${uncoveredFeatures.length}건. ` +
    `미커버 replay가 가장 자주 위반하는 조건: ${clauseFailureFrequency.map((c) => `${c.axis}(${c.count}건)`).join(", ") || "없음"}.`;

  return { gapTotal: gapFeatures.length, genuineCoveredCount: gapFeatures.length - uncoveredFeatures.length, uncoveredCount: uncoveredFeatures.length, uncoveredFeatures, diagnoses, clauseFailureFrequency, summary };
}
