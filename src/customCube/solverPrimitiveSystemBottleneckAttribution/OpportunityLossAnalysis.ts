// --- OpportunityLossAnalysis (Solver System Bottleneck Attribution
// Sprint v1, STEP4) ----------------------------------------------------------
// Extracts real snapshots where the candidate arm's PAIR stage finished
// FAST (well within its own budget) yet the solve() call as a whole showed
// NO net capability improvement (candidateWrongAfter >= wrongWingBefore) --
// i.e. the saved PAIR time bought nothing. Classifies each such case using
// the SAME real candidate-run StageEvent[] already collected by
// StageInstrumentedMirror.ts (production default pairBudgetMs=140, no
// separate run needed):
//   A. Budget remained unused: no ENDGAME/RECOVERY stage fired at all, and
//      a meaningful chunk of the 1-second plan budget was never spent.
//   B. ENDGAME consumed everything: ENDGAME fired and total time spent is
//      close to the full plan budget (little/no room left for Recovery).
//   C. Recovery not triggered: ENDGAME fired (and failed to improve) but
//      RECOVERY never ran (real production only allows Recovery on ENDGAME-
//      type tasks -- see fiveByFiveEdgeExecutor.ts's own recoveryEligible
//      gate, read-only, unmodified).
//   D. Other Primitive bottleneck: neither ENDGAME nor RECOVERY ever ran at
//      all (e.g. FLIP/PARITY/PAIR tasks alone consumed the plan, or the
//      Planner never even queued an ENDGAME task) -- the bottleneck is
//      upstream of ENDGAME/RECOVERY entirely.
import type { StageEvent } from "./StageInstrumentedMirror";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";

const ENDGAME_STAGES = new Set(["ENDGAME_BESTFIX", "ENDGAME_MULTIPLY", "ENDGAME_DISRUPTION"]);
const RECOVERY_STAGES = new Set([
  "RECOVERY_DISRUPT1",
  "RECOVERY_DISRUPT2",
  "RECOVERY_SETUP",
  "RECOVERY_REPAIR",
  "RECOVERY_CCR",
  "RECOVERY_RETRY",
]);

// A case counts as "meaningful unused budget" if less than this fraction of
// the nominal 1-second plan budget was actually spent across all stages.
const UNUSED_BUDGET_THRESHOLD_PCT = 0.7; // spent < 70% of PLAN_TIME_BUDGET_MS

export type OpportunityLossCategory = "A_budgetUnused" | "B_endgameConsumedAll" | "C_recoveryNotTriggered" | "D_otherPrimitiveBottleneck";

export interface OpportunityLossCase {
  hash: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  totalSpentMs: number;
  endgameInvoked: boolean;
  recoveryInvoked: boolean;
  category: OpportunityLossCategory;
}

export function classifyOpportunityLoss(hash: string, wrongWingBefore: number, wrongWingAfter: number, events: readonly StageEvent[]): OpportunityLossCase | null {
  if (wrongWingAfter < wrongWingBefore) return null; // real improvement happened -- not an opportunity loss case

  const totalSpentMs = events.reduce((a, e) => a + e.runtimeMs, 0);
  const endgameInvoked = events.some((e) => ENDGAME_STAGES.has(e.stage));
  const recoveryInvoked = events.some((e) => RECOVERY_STAGES.has(e.stage));

  let category: OpportunityLossCategory;
  if (!endgameInvoked && !recoveryInvoked && totalSpentMs < PLAN_TIME_BUDGET_MS * UNUSED_BUDGET_THRESHOLD_PCT) {
    category = "A_budgetUnused";
  } else if (endgameInvoked && totalSpentMs >= PLAN_TIME_BUDGET_MS * UNUSED_BUDGET_THRESHOLD_PCT) {
    category = "B_endgameConsumedAll";
  } else if (endgameInvoked && !recoveryInvoked) {
    category = "C_recoveryNotTriggered";
  } else {
    category = "D_otherPrimitiveBottleneck";
  }

  return { hash, wrongWingBefore, wrongWingAfter, totalSpentMs, endgameInvoked, recoveryInvoked, category };
}

export interface OpportunityLossSummary {
  totalCases: number;
  byCategory: Record<OpportunityLossCategory, number>;
  byCategoryPct: Record<OpportunityLossCategory, number>;
}

export function summarizeOpportunityLoss(cases: readonly OpportunityLossCase[]): OpportunityLossSummary {
  const byCategory: Record<OpportunityLossCategory, number> = {
    A_budgetUnused: 0,
    B_endgameConsumedAll: 0,
    C_recoveryNotTriggered: 0,
    D_otherPrimitiveBottleneck: 0,
  };
  for (const c of cases) byCategory[c.category]++;
  const totalCases = cases.length;
  const byCategoryPct = Object.fromEntries(
    Object.entries(byCategory).map(([k, v]) => [k, totalCases ? (v / totalCases) * 100 : 0])
  ) as Record<OpportunityLossCategory, number>;
  return { totalCases, byCategory, byCategoryPct };
}
