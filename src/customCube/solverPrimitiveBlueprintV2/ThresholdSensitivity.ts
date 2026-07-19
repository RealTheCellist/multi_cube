// --- ThresholdSensitivity (Solver Primitive Blueprint Sprint v2) ---------
// STEP2: sweeps the conflictEdgeCount threshold within the base candidate's
// cycleLength 2~3 band, across the SAME multi-run Dataset STEP1 collected
// (reused, not re-run) -- answers whether the exact threshold (>0 vs >=2
// vs >=3) matters, or whether the candidate is robust across nearby cuts.
import type { RunRecord, CandidatePredicate, ReproducibilityResult } from "./ReproducibilityCheck";
import { evaluateReproducibility } from "./ReproducibilityCheck";

export const THRESHOLD_CANDIDATES: CandidatePredicate[] = [
  { name: "cycleLength 2~3 AND conflictEdgeCount>0", predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount > 0 },
  { name: "cycleLength 2~3 AND conflictEdgeCount>=2", predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount >= 2 },
  { name: "cycleLength 2~3 AND conflictEdgeCount>=3", predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount >= 3 },
];

export function evaluateThresholdSensitivity(multiRun: readonly RunRecord[][]): ReproducibilityResult[] {
  return THRESHOLD_CANDIDATES.map((c) => evaluateReproducibility(multiRun, c));
}
