// --- RuntimeImpactModel (ENDGAME Optimization Blueprint Sprint v1, STEP3)
// -----------------------------------------------------------------------------
// Models each Budget strategy's impact on overall solve() Runtime/Deadline
// Miss/Recovery Trigger risk, using Bottleneck Attribution Refinement
// Sprint v1's own real avg-runtime-per-budget data (same report as the
// Saturation Curve) plus this Sprint's own confirmed architecture fact
// (RECOVERY_RESERVE_MS_TODAY = 450ms already reserved off the SAME
// deadline ENDGAME draws from).
import type { BudgetStrategyId } from "./BudgetAllocationBlueprint";
import { RECOVERY_RESERVE_MS_TODAY } from "./BudgetAllocationBlueprint";

// Bottleneck Attribution Refinement Sprint v1's own real avg runtime per
// budget (n=255 real Reachable snapshots) -- cited verbatim.
export const REAL_RUNTIME_CURVE = [
  { budgetMs: 120, avgRuntimeMs: 177.1 },
  { budgetMs: 250, avgRuntimeMs: 314.6 },
  { budgetMs: 500, avgRuntimeMs: 562.4 },
  { budgetMs: 1000, avgRuntimeMs: 1057.7 },
  { budgetMs: 5000, avgRuntimeMs: 4956.5 },
] as const;

export type RiskLevel = "low" | "medium" | "high";

export interface RuntimeImpactRow {
  strategy: BudgetStrategyId;
  representativeBudgetMs: number;
  expectedRuntimeMs: number;
  deadlineMissRisk: RiskLevel;
  recoveryTriggerImpact: string;
  overallRisk: RiskLevel;
}

export const RUNTIME_IMPACT_MATRIX: RuntimeImpactRow[] = [
  {
    strategy: "fixed",
    representativeBudgetMs: 500,
    expectedRuntimeMs: 562.4,
    deadlineMissRisk: "medium",
    recoveryTriggerImpact:
      "A fixed ENDGAME slice reduces PAIR/FLIP/PARITY's own share when the queue runs late -- could indirectly starve those tasks the same way the CURRENT RECOVERY_RESERVE_MS(450ms) already occasionally does, but bounded and measurable (same failure mode as an existing, already-accepted mechanism).",
    overallRisk: "medium",
  },
  {
    strategy: "remainingTime",
    representativeBudgetMs: 120,
    expectedRuntimeMs: 177.1,
    deadlineMissRisk: "low",
    recoveryTriggerImpact: "Status quo -- Recovery's own 450ms reservation is untouched, so Recovery Trigger behavior is unchanged from today's real, already-measured baseline.",
    overallRisk: "low",
  },
  {
    strategy: "adaptive",
    representativeBudgetMs: 250,
    expectedRuntimeMs: 314.6,
    deadlineMissRisk: "medium",
    recoveryTriggerImpact:
      "Dynamic sizing could shrink Recovery's own effective window unpredictably on snapshots where ENDGAME's adaptive logic claims more time than a fixed reservation would -- the exact class of timing-jitter risk this whole research arc's own Planner v2 determinism fix was built to avoid.",
    overallRisk: "high",
  },
  {
    strategy: "reservedSlice",
    representativeBudgetMs: 500,
    expectedRuntimeMs: 562.4,
    deadlineMissRisk: "medium",
    recoveryTriggerImpact: `Directly trades off against the EXISTING RECOVERY_RESERVE_MS(${RECOVERY_RESERVE_MS_TODAY}ms) -- STEP5 must decide whether ENDGAME_RESERVE_MS stacks on top (shrinking PAIR/FLIP/PARITY's own share further) or partially replaces/absorbs it (shrinking Recovery's own reservation, justified by this Sprint's own 87%-vs-13% Bottleneck Attribution finding).`,
    overallRisk: "medium",
  },
];
