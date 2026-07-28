// --- FailureAnalysis (Move Representation Prototype Sprint v1, Required
// Analysis #4) ----------------------------------------------------------------
// Disclosed, measured-data-based classification -- first match wins.
import type { CaseResult } from "./CapabilityEvaluation";

export type FailureReason = "SOLVED" | "WRONG_TARGET_NO_CYCLE" | "COMMUTATOR_FAILURE" | "UNKNOWN";

function classifyFailure(c: CaseResult): FailureReason {
  if (c.result.moves) return "SOLVED";
  if (c.result.cycleLength === null) return "WRONG_TARGET_NO_CYCLE"; // analyzeMultiCycle found no cycle at all
  // A cycle WAS detected but the low-footprint core search (bounded DFS,
  // same leaf cap/deadline discipline as BP-1/CCR) never found any leaf
  // that both improves wrongWingCount AND survives Deferred Validation --
  // this maps directly onto PURE_CYCLE_ISOLATION Mechanism Analysis Sprint
  // v1's own "SEARCH_EXHAUSTED" finding (the representational gap), not a
  // bug in this Prototype's own setup/conjugation step.
  return "COMMUTATOR_FAILURE";
}

export interface FailureTally {
  reason: FailureReason;
  count: number;
  labels: string[];
}

export function tallyFailures(cases: CaseResult[]): FailureTally[] {
  const reasons: FailureReason[] = ["SOLVED", "WRONG_TARGET_NO_CYCLE", "COMMUTATOR_FAILURE", "UNKNOWN"];
  return reasons
    .map((reason) => {
      const members = cases.filter((c) => classifyFailure(c) === reason);
      return { reason, count: members.length, labels: members.map((m) => m.label) };
    })
    .filter((t) => t.count > 0);
}
