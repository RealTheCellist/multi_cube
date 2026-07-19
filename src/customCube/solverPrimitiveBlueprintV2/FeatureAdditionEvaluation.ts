// --- FeatureAdditionEvaluation (Solver Primitive Blueprint Sprint v2) ----
// STEP3: tests whether adding a further conjunct (wrongWingCount/
// pairCount/swapEdgeCount/cycleEdgeCount) on top of the base candidate
// (cycleLength 2~3 AND conflictEdgeCount>0) improves explanatory power,
// or just shrinks the matched sample without a real gain -- reuses the
// SAME multi-run Dataset STEP1 collected.
import type { RunRecord, CandidatePredicate, ReproducibilityResult } from "./ReproducibilityCheck";
import { evaluateReproducibility, NEW_CANDIDATE } from "./ReproducibilityCheck";

export const FEATURE_ADDITION_CANDIDATES: CandidatePredicate[] = [
  NEW_CANDIDATE,
  { name: "+ wrongWingCount 3~11", predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount > 0 && f.wrongWingCount >= 3 && f.wrongWingCount <= 11 },
  { name: "+ pairCount<=5", predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount > 0 && f.pairCount <= 5 },
  { name: "+ swapEdgeCount<=2", predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount > 0 && f.swapEdgeCount <= 2 },
  { name: "+ cycleEdgeCount<=4", predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount > 0 && f.cycleEdgeCount <= 4 },
];

export function evaluateFeatureAdditions(multiRun: readonly RunRecord[][]): ReproducibilityResult[] {
  return FEATURE_ADDITION_CANDIDATES.map((c) => evaluateReproducibility(multiRun, c));
}
