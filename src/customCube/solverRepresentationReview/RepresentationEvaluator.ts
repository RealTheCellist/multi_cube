// --- RepresentationEvaluator (Solver Representation Revalidation Sprint v1)
// Shared utility: re-runs Solver v3 Kickoff's own comparison
// (`evaluateStateRepresentationCandidates`, solverV3Research/
// StateRepresentationCandidates.ts, existing/unmodified) against whatever
// the CURRENT failures.json contains -- now 150 replays instead of 75 --
// and provides a generic before/after comparison helper the STEP1~3 review
// files reuse.
import { evaluateStateRepresentationCandidates, type StateRepresentationComparison, type RepresentationEvalResult } from "../solverV3Research/StateRepresentationCandidates";

export type { StateRepresentationComparison, RepresentationEvalResult };

export function evaluateAllRepresentations(failuresDbPath: string, gapDeadlineMs: number): StateRepresentationComparison {
  return evaluateStateRepresentationCandidates(failuresDbPath, gapDeadlineMs);
}

export type ChangeDirection = "IMPROVED" | "WORSENED" | "UNCHANGED";

export interface BeforeAfterComparison {
  metric: string;
  before75: number;
  after150: number;
  delta: number;
  percentChange: number; // relative to before75
  direction: ChangeDirection;
}

export function compareMetric(metric: string, before75: number, after150: number, higherIsBetter: boolean): BeforeAfterComparison {
  const delta = after150 - before75;
  const percentChange = before75 !== 0 ? (delta / before75) * 100 : 0;
  const direction: ChangeDirection = delta === 0 ? "UNCHANGED" : (higherIsBetter ? delta > 0 : delta < 0) ? "IMPROVED" : "WORSENED";
  return { metric, before75, after150, delta, percentChange, direction };
}
