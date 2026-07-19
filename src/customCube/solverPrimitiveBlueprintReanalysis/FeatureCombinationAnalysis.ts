// --- FeatureCombinationAnalysis (Solver Primitive Blueprint Reanalysis
// Sprint v1) -------------------------------------------------------------
// STEP4: tests whether combining features explains real Prototype success
// better than any single feature -- including the OLD Blueprint
// preconditions themselves (cited, unmodified) as baseline candidates to
// beat, and the disclosed STEP2 discovery from Primitive Prototype Sprint
// v2 (cycleLength, not cycleCount, is what actually gates
// resolveBoundedMultiCycle).
import type { PrimitiveRunRecord, ReplayFeatureVector } from "./SuccessFailureComparison";

export interface CombinationCandidate {
  name: string;
  isOldBlueprint: boolean; // cited, unmodified precondition from a prior Sprint
  // A candidate that is EXACTLY the Prototype's own hard-coded activation
  // gate (nothing outside it can EVER succeed, by construction of the
  // already-committed Prototype code) is not a new Blueprint finding --
  // restricting to it will trivially "predict" success better than any
  // unrelated old precondition, since success is IMPOSSIBLE outside it.
  // Flagged so the decision logic (BlueprintReanalysisDecision.ts) doesn't
  // let a circular restatement of already-known code count as this
  // Sprint's own discovery.
  isBareGate: boolean;
  predicate: (f: ReplayFeatureVector) => boolean;
}

export interface CombinationResult {
  name: string;
  isOldBlueprint: boolean;
  isBareGate: boolean;
  matchedCount: number;
  successCount: number;
  successRate: number;
  totalReplays: number;
}

export function evaluateCombinations(records: readonly PrimitiveRunRecord[], combos: readonly CombinationCandidate[]): CombinationResult[] {
  return combos
    .map((c) => {
      const matched = records.filter((r) => c.predicate(r.features));
      const successCount = matched.filter((r) => r.succeeded).length;
      return {
        name: c.name,
        isOldBlueprint: c.isOldBlueprint,
        isBareGate: c.isBareGate,
        matchedCount: matched.length,
        successCount,
        successRate: matched.length ? successCount / matched.length : 0,
        totalReplays: records.length,
      };
    })
    .sort((a, b) => b.successRate - a.successRate);
}

// Multi-Hop Bridge Prototype's own MIN/MAX_BRIDGE_CYCLE_LENGTH=[2,3]
// (solverPrimitivePrototype/MultiHopBridgePrototype.ts, cited) and its
// original Blueprint precondition (solverPrimitiveBlueprint/
// CandidateExpansion.ts's Level-2 refined precondition, cited).
//
// "cycleLength 2~3" alone is the Prototype's own bare activation gate --
// already disclosed in Primitive Prototype Sprint v2, not a new finding of
// THIS Sprint (isBareGate=true, excluded from "new discovery" credit). The
// genuinely new question this Sprint asks is: AMONG the 18 replays where
// the gate lets the mechanism run at all, what explains the 6 that
// succeeded vs the 12 that didn't? STEP1's own mean-comparison already
// flagged conflictEdgeCount as the sharpest within-band split (success
// mean 5.67 vs failure mean 1.51) -- tested directly below, both
// directions, since only testing "=0" the first time silently missed it.
export const BRIDGE_COMBINATIONS: CombinationCandidate[] = [
  { name: "cycleCount<=2 (기존 Blueprint 원안)", isOldBlueprint: true, isBareGate: false, predicate: (f) => f.cycleCount <= 2 },
  { name: "cycleLength 2~3 (Prototype v2에서 이미 알려진 활성화 게이트 그 자체)", isOldBlueprint: false, isBareGate: true, predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 },
  { name: "cycleLength 2~3 AND conflictEdgeCount>0 (게이트 내 신규 발견)", isOldBlueprint: false, isBareGate: false, predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount > 0 },
  { name: "cycleLength 2~3 AND swapEdgeCount=0", isOldBlueprint: false, isBareGate: false, predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.swapEdgeCount === 0 },
  { name: "cycleLength 2~3 AND wrongWingCount 3~11", isOldBlueprint: false, isBareGate: false, predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.wrongWingCount >= 3 && f.wrongWingCount <= 11 },
  { name: "cycleLength 2~3 AND conflictEdgeCount=0", isOldBlueprint: false, isBareGate: false, predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount === 0 },
];

// Conflict-Dominant Sacrifice Move's original Blueprint precondition
// (solverPrimitiveBlueprint/CandidateExpansion.ts, cited, unmodified).
// The Prototype itself does nothing when conflictEdges.length===0
// (ConflictDominantSacrificePrototype.ts's own loop is a no-op on an empty
// list), so "conflictEdgeCount>0" is ALSO this Primitive's own bare
// necessary condition, not a new finding -- flagged the same way as
// Multi-Hop Bridge's cycleLength gate, for the same reason.
export const SACRIFICE_COMBINATIONS: CombinationCandidate[] = [
  { name: "conflictEdgeCount > swap+cycleEdge (기존 Blueprint 원안)", isOldBlueprint: true, isBareGate: false, predicate: (f) => f.conflictEdgeCount > f.swapEdgeCount + f.cycleEdgeCount },
  { name: "conflictEdgeCount>0 (이 Primitive의 활성화 필요조건 그 자체)", isOldBlueprint: false, isBareGate: true, predicate: (f) => f.conflictEdgeCount > 0 },
  { name: "conflictEdgeCount>=2", isOldBlueprint: false, isBareGate: false, predicate: (f) => f.conflictEdgeCount >= 2 },
  { name: "conflictEdgeCount>0 AND cycleCount<=1", isOldBlueprint: false, isBareGate: false, predicate: (f) => f.conflictEdgeCount > 0 && f.cycleCount <= 1 },
  { name: "conflictEdgeCount>0 AND wrongWingCount 6~14", isOldBlueprint: false, isBareGate: false, predicate: (f) => f.conflictEdgeCount > 0 && f.wrongWingCount >= 6 && f.wrongWingCount <= 14 },
];
