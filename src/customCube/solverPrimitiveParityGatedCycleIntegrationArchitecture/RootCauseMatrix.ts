// --- RootCauseMatrix (Parity-Gated Cycle Integration Architecture Analysis
// Sprint v1, STEP6) -----------------------------------------------------------
// Classifies every real Hole Dataset case into exactly one of 5 required
// categories (+ an implicit RESOLVED bucket for cases where
// PARITY_GATED_CYCLE was already the real production outcome), using ONLY
// data already produced by STEP1 (RecoveryTimelineCollector, real
// production timeline), STEP3 (CounterfactualSchedulerReplay, Options B/C),
// and STEP4 (DedicatedBudgetSimulation, "remainingTime" policy at the real
// position). No new Primitive execution paths are introduced here.
//
// Classification rule (mutually exclusive, applied in this precedence order
// per case):
//   1. componentCount(cubies) <= 1                         -> GATE_MISS
//   2. Gate PASS, real timeline entry.chosen === true       -> RESOLVED
//      (PARITY_GATED_CYCLE already IS the real outcome; excluded from the
//      deficiency population since Capability is not absent here)
//   3. Gate PASS, not chosen, but entry.offered === true     -> CANDIDATE_SELECTION
//      (the Primitive found net-improving moves and validateDeferred
//      accepted them, but a competing candidate scored higher / had already
//      been committed to -- Capability exists, integration lost the pick)
//   4. Gate PASS, not chosen, not offered, but Counterfactual
//      Option B (REPAIR->PARITY->CCR) OR Option C (PARITY->REPAIR->CCR)
//      DOES offer PARITY_GATED_CYCLE for this case               -> SCHEDULER_ORDERING
//      (a different relative order recovers the same underlying
//      Capability -- the real order, not the budget NUMBER, is the
//      limiting factor)
//   5. Gate PASS, not chosen, not offered, reordering does NOT help,
//      but DedicatedBudgetSimulation's "remainingTime" policy (fully
//      unclamped, SAME real position after REPAIR->CCR) DOES offer it
//      for this case                                              -> BUDGET_STARVATION
//      (the position is structurally fine; the fixed reserved-slice
//      NUMBER at that position is what starves it, not the order)
//   6. Gate PASS, not chosen, not offered, and NEITHER reordering NOR an
//      unbounded dedicated slice at the same position recovers it -> PRIMITIVE_FAILURE
//      (the Prototype's own bridge/traversal/cleanup search genuinely
//      cannot solve this case regardless of scheduling or budget --
//      a structural Primitive limitation, not an integration problem)
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import type { CaseTimeline } from "./RecoveryTimelineCollector";
import { replayOption } from "./CounterfactualSchedulerReplay";
import { replayBudgetPolicy } from "./DedicatedBudgetSimulation";

export type RootCause = "GATE_MISS" | "RESOLVED" | "CANDIDATE_SELECTION" | "SCHEDULER_ORDERING" | "BUDGET_STARVATION" | "PRIMITIVE_FAILURE";

export const DEFICIENCY_CAUSES: Exclude<RootCause, "RESOLVED">[] = ["GATE_MISS", "CANDIDATE_SELECTION", "SCHEDULER_ORDERING", "BUDGET_STARVATION", "PRIMITIVE_FAILURE"];

export interface RootCauseCaseResult {
  label: string;
  cause: RootCause;
}

export function classifyCase(hole: HoleCase, timeline: CaseTimeline, libs: ExecutorLibraries): RootCauseCaseResult {
  const stats = analyzeConstraints(buildStateGraph(hole.cubies));
  if (stats.componentCount <= 1) return { label: hole.label, cause: "GATE_MISS" };

  const entry = timeline.entries.PARITY_GATED_CYCLE;
  if (entry.chosen) return { label: hole.label, cause: "RESOLVED" };
  if (entry.offered) return { label: hole.label, cause: "CANDIDATE_SELECTION" };

  const optionB = replayOption(hole.cubies, hole.label, libs, "B_repair_parity_ccr");
  const optionC = replayOption(hole.cubies, hole.label, libs, "C_parity_repair_ccr");
  const reorderingHelps = optionB.offered.includes("PARITY_GATED_CYCLE") || optionC.offered.includes("PARITY_GATED_CYCLE");
  if (reorderingHelps) return { label: hole.label, cause: "SCHEDULER_ORDERING" };

  const dedicatedUnclamped = replayBudgetPolicy(hole.cubies, hole.label, libs, "remainingTime");
  if (dedicatedUnclamped.parityOffered) return { label: hole.label, cause: "BUDGET_STARVATION" };

  return { label: hole.label, cause: "PRIMITIVE_FAILURE" };
}

export interface RootCauseMatrixResult {
  totalCases: number;
  counts: Record<RootCause, number>;
  percentOfTotal: Record<RootCause, number>;
  deficiencyPopulation: number; // totalCases - counts.RESOLVED
  percentOfDeficiency: Record<Exclude<RootCause, "RESOLVED">, number>;
  dominantDeficiencyCause: Exclude<RootCause, "RESOLVED"> | "NONE";
}

function zeroCounts(): Record<RootCause, number> {
  return { GATE_MISS: 0, RESOLVED: 0, CANDIDATE_SELECTION: 0, SCHEDULER_ORDERING: 0, BUDGET_STARVATION: 0, PRIMITIVE_FAILURE: 0 };
}

export function buildRootCauseMatrix(holes: readonly HoleCase[], timelines: readonly CaseTimeline[], libs: ExecutorLibraries): { perCase: RootCauseCaseResult[]; matrix: RootCauseMatrixResult } {
  const perCase = holes.map((h, i) => classifyCase(h, timelines[i], libs));
  const counts = zeroCounts();
  for (const r of perCase) counts[r.cause]++;

  const totalCases = holes.length;
  const percentOfTotal = zeroCounts();
  for (const cause of Object.keys(counts) as RootCause[]) {
    percentOfTotal[cause] = totalCases > 0 ? (counts[cause] / totalCases) * 100 : 0;
  }

  const deficiencyPopulation = totalCases - counts.RESOLVED;
  const percentOfDeficiency: Record<Exclude<RootCause, "RESOLVED">, number> = {
    GATE_MISS: 0,
    CANDIDATE_SELECTION: 0,
    SCHEDULER_ORDERING: 0,
    BUDGET_STARVATION: 0,
    PRIMITIVE_FAILURE: 0,
  };
  for (const cause of DEFICIENCY_CAUSES) {
    percentOfDeficiency[cause] = deficiencyPopulation > 0 ? (counts[cause] / deficiencyPopulation) * 100 : 0;
  }

  let dominantDeficiencyCause: Exclude<RootCause, "RESOLVED"> | "NONE" = "NONE";
  let maxCount = 0;
  for (const cause of DEFICIENCY_CAUSES) {
    if (counts[cause] > maxCount) {
      maxCount = counts[cause];
      dominantDeficiencyCause = cause;
    }
  }

  return {
    perCase,
    matrix: { totalCases, counts, percentOfTotal, deficiencyPopulation, percentOfDeficiency, dominantDeficiencyCause },
  };
}
