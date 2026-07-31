// --- GateAudit (Parity-Gated Cycle Integration Architecture Analysis
// Sprint v1, STEP5) ----------------------------------------------------------
// Funnel over the real 142-case Hole Dataset: Gate PASS -> Offered ->
// Budget 부족 -> Primitive 성공 -> Primitive 선택. Reuses
// RecoveryTimelineCollector.ts's own real timelines (already captured via
// the production onEvent hook, unmodified) -- no new instrumentation.
//
// Disclosed collapse: in THIS codebase's own contract, "offered" (a
// candidate appears in generateRecoveryStrategies' own return array) and
// "Primitive 성공" are the SAME event -- add() only ever pushes a
// candidate when its moves are both non-null AND already net-improving
// (validateDeferred accepted internally by genParityGatedCycle before
// add() is even called). There is no distinct "found moves but rejected"
// state visible at this layer, so the funnel's own "Offered" and
// "Primitive 성공" columns are identical by construction -- reported as
// such, not force-split.
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import type { CaseTimeline } from "./RecoveryTimelineCollector";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const BUDGET_INSUFFICIENT_THRESHOLD_MS = 500; // Integration Planning Refinement Sprint v1's own Budget Sweep found ~0% rescue below this

export interface GateAuditFunnel {
  totalCases: number;
  gatePassCount: number; // componentCount>1
  offeredCount: number; // === "Primitive 성공" in this codebase's contract, see file header
  budgetInsufficientCount: number; // Gate PASS, NOT offered, remainingTimeBeforeMs < threshold
  primitiveFailureCount: number; // Gate PASS, NOT offered, remainingTimeBeforeMs >= threshold (genuinely searched, found nothing)
  chosenCount: number; // offered AND chosen by chooseBestRecovery's argmax
}

export function auditGateFunnel(holes: readonly HoleCase[], timelines: readonly CaseTimeline[]): GateAuditFunnel {
  let gatePassCount = 0;
  let offeredCount = 0;
  let budgetInsufficientCount = 0;
  let primitiveFailureCount = 0;
  let chosenCount = 0;

  for (let i = 0; i < holes.length; i++) {
    const stats = analyzeConstraints(buildStateGraph(holes[i].cubies));
    const gatePass = stats.componentCount > 1;
    if (!gatePass) continue;
    gatePassCount++;

    const entry = timelines[i].entries.PARITY_GATED_CYCLE;
    if (entry.offered) {
      offeredCount++;
      if (entry.chosen) chosenCount++;
      continue;
    }
    const remainingBefore = entry.remainingTimeBeforeMs ?? 0;
    if (remainingBefore < BUDGET_INSUFFICIENT_THRESHOLD_MS) budgetInsufficientCount++;
    else primitiveFailureCount++;
  }

  return {
    totalCases: holes.length,
    gatePassCount,
    offeredCount,
    budgetInsufficientCount,
    primitiveFailureCount,
    chosenCount,
  };
}
