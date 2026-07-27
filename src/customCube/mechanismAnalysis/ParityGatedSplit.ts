// --- ParityGatedSplit (State Taxonomy Sprint v2 STEP3) --------------------
// Re-splits the Parity-Gated Cycle taxonomy class (56 cases in the Phase 2
// run) using WHICH specific primitive succeeded, not just whether any did.
// RECOVERY succeeding means the real production Recovery layer
// (DISRUPT/SETUP/REPAIR/CCR combined, via attemptRecovery()) already has
// the capability -- production's own solve() loop just isn't triggering
// it for this exact residual within its 50-iteration cap, a pure
// scheduling/trigger problem, NOT a missing-capability problem. BASE/FLIP/
// CASE/PARITY succeeding means the main non-recovery pipeline already
// covers it -- also a scheduling/task-selection problem (why did 50
// iterations of the real loop never find what a single isolated test
// call found immediately?), just a different mechanism than Recovery
// under-triggering. Neither succeeding is retested at extended budget
// (reusing CycleIsolationSubtypes' technique) before being called a true
// gap.
import { testAllCapabilities } from "../capabilityAnalysis/primitiveCapabilityTester";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { EXTENDED_BUDGET_MS } from "./CycleIsolationSubtypes";

export type ParityGatedVerdict = "RECOVERY_RECOVERABLE" | "BASE_PIPELINE_RECOVERABLE" | "BUDGET_RECOVERABLE" | "TRUE_GAP";

export interface ParityGatedCaseAnalysis {
  label: string;
  succeededPrimitivesAtBaseline: string[];
  verdict: ParityGatedVerdict;
  extendedBudgetNewlySucceeded: string[]; // only populated when verdict would otherwise be TRUE_GAP
}

export async function analyzeParityGatedCase(hole: HoleCase, libs: ExecutorLibraries): Promise<ParityGatedCaseAnalysis> {
  const succeeded = hole.capabilityResults.filter((r) => r.succeeded).map((r) => r.primitive);

  if (succeeded.includes("RECOVERY")) {
    return { label: hole.label, succeededPrimitivesAtBaseline: succeeded, verdict: "RECOVERY_RECOVERABLE", extendedBudgetNewlySucceeded: [] };
  }
  if (succeeded.length > 0) {
    return { label: hole.label, succeededPrimitivesAtBaseline: succeeded, verdict: "BASE_PIPELINE_RECOVERABLE", extendedBudgetNewlySucceeded: [] };
  }

  const extended = testAllCapabilities(hole.cubies, libs, EXTENDED_BUDGET_MS);
  const extendedSucceeded = extended.filter((r) => r.succeeded).map((r) => r.primitive);
  if (extendedSucceeded.length > 0) {
    return { label: hole.label, succeededPrimitivesAtBaseline: succeeded, verdict: "BUDGET_RECOVERABLE", extendedBudgetNewlySucceeded: extendedSucceeded };
  }

  return { label: hole.label, succeededPrimitivesAtBaseline: succeeded, verdict: "TRUE_GAP", extendedBudgetNewlySucceeded: [] };
}

export interface ParityGatedSummary {
  totalCases: number;
  verdictCounts: Record<ParityGatedVerdict, number>;
}

export function summarizeParityGated(analyses: ParityGatedCaseAnalysis[]): ParityGatedSummary {
  const verdictCounts: Record<ParityGatedVerdict, number> = {
    RECOVERY_RECOVERABLE: 0,
    BASE_PIPELINE_RECOVERABLE: 0,
    BUDGET_RECOVERABLE: 0,
    TRUE_GAP: 0,
  };
  for (const a of analyses) verdictCounts[a.verdict]++;
  return { totalCases: analyses.length, verdictCounts };
}
