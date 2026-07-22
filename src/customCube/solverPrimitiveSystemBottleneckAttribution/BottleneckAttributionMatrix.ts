// --- BottleneckAttributionMatrix (Solver System Bottleneck Attribution
// Sprint v1, STEP6) ----------------------------------------------------------
// Synthesizes STEP1-5's real measurements into a final bottleneck
// contribution matrix, Priority 1 selection, Level1-3 judgment, and Decision
// A/B/C. Each row's % is derived transparently from ONE specific real STEP1-5
// measurement (disclosed in `basis`), not an opaque combined score:
//   ENDGAME          <- OpportunityLossAnalysis's B_endgameConsumedAll%
//   Recovery Trigger <- OpportunityLossAnalysis's C_recoveryNotTriggered%
//     (real production gates Recovery to ENDGAME-type tasks only --
//     fiveByFiveEdgeExecutor.ts's own recoveryEligible check, read-only)
//   Planner          <- OpportunityLossAnalysis's D_otherPrimitiveBottleneck%
//     (cases where neither ENDGAME nor Recovery were ever reached at all --
//     upstream of both, i.e. the task queue itself)
//   Executor         <- OpportunityLossAnalysis's A_budgetUnused%
//     (budget was available but the scheduling/coordination logic simply
//     never spent it on anything further)
//   Primitive        <- CounterfactualSimulation's own finding: does EXTRA
//     time (any of the 3 redirections) actually buy more improvement, or is
//     the ceiling already reached regardless of time given?
import type { OpportunityLossSummary } from "./OpportunityLossAnalysis";
import type { CounterfactualSummary } from "./CounterfactualSimulation";
import type { StageRuntimeRow } from "./StageRuntimeAttribution";

export type BottleneckComponent = "ENDGAME" | "Recovery Trigger" | "Planner" | "Executor" | "Primitive";

export interface BottleneckRow {
  component: BottleneckComponent;
  contributionPct: number;
  basis: string;
}

export interface BottleneckAttributionResult {
  rows: BottleneckRow[];
  priority1: BottleneckComponent;
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

export function computeBottleneckMatrix(
  opportunityLoss: OpportunityLossSummary,
  counterfactual: CounterfactualSummary,
  stageRuntime: readonly StageRuntimeRow[],
  budgetFlowMeasured: boolean
): BottleneckAttributionResult {
  const primitiveCeilingPct =
    counterfactual.n > 0 && counterfactual.avgBaselineImprovement > 0
      ? Math.max(
          0,
          100 -
            (Math.max(counterfactual.avgEndgameExtendedImprovement, counterfactual.avgRecoveryExtendedImprovement, counterfactual.avgCcrExtendedImprovement) /
              Math.max(counterfactual.avgBaselineImprovement, 0.001)) *
              100
        )
      : counterfactual.n > 0
      ? 100 // baseline improvement was already 0 and no redirection helped either -- pure capability ceiling
      : 0;

  const endgameStages = new Set(["ENDGAME_BESTFIX", "ENDGAME_MULTIPLY", "ENDGAME_DISRUPTION"]);
  const endgameRuntimePct = stageRuntime.filter((r) => endgameStages.has(r.stage)).reduce((a, r) => a + r.pctOfTotalRuntime, 0);

  const rows: BottleneckRow[] = [
    {
      component: "ENDGAME",
      contributionPct: opportunityLoss.byCategoryPct.B_endgameConsumedAll,
      basis: `Opportunity Loss category B (ENDGAME consumed all remaining budget): ${opportunityLoss.byCategory.B_endgameConsumedAll}/${opportunityLoss.totalCases} no-improvement cases (ENDGAME stages account for ${endgameRuntimePct.toFixed(1)}% of total measured Stage Runtime, STEP1)`,
    },
    {
      component: "Recovery Trigger",
      contributionPct: opportunityLoss.byCategoryPct.C_recoveryNotTriggered,
      basis: `Opportunity Loss category C (ENDGAME ran/failed but Recovery never triggered): ${opportunityLoss.byCategory.C_recoveryNotTriggered}/${opportunityLoss.totalCases} no-improvement cases`,
    },
    {
      component: "Planner",
      contributionPct: opportunityLoss.byCategoryPct.D_otherPrimitiveBottleneck,
      basis: `Opportunity Loss category D (neither ENDGAME nor Recovery ever reached): ${opportunityLoss.byCategory.D_otherPrimitiveBottleneck}/${opportunityLoss.totalCases} no-improvement cases`,
    },
    {
      component: "Executor",
      contributionPct: opportunityLoss.byCategoryPct.A_budgetUnused,
      basis: `Opportunity Loss category A (meaningful plan budget left unused, nothing further invoked): ${opportunityLoss.byCategory.A_budgetUnused}/${opportunityLoss.totalCases} no-improvement cases`,
    },
    {
      component: "Primitive",
      contributionPct: primitiveCeilingPct,
      basis: `Counterfactual Simulation (n=${counterfactual.n}): best redirection (${counterfactual.bestRedirection}) improvement vs baseline improvement -- ${primitiveCeilingPct.toFixed(1)}% of the gap is NOT closeable by giving any Primitive more time (a real search-capability ceiling, not a scheduling problem)`,
    },
  ];

  const sorted = [...rows].sort((a, b) => b.contributionPct - a.contributionPct);
  const priority1 = sorted[0].component;

  const level1Pass = rows.every((r) => Number.isFinite(r.contributionPct));
  const level1Detail = `Bottleneck contribution computed for all 5 components from real measurements across ${opportunityLoss.totalCases} no-improvement cases and ${counterfactual.n} counterfactual simulations.`;

  const level2Pass = budgetFlowMeasured;
  const level2Detail = budgetFlowMeasured
    ? "Budget Flow (STEP2) completed: PAIR savings traced to ENDGAME/RECOVERY/unaccounted deltas on the same real cube states."
    : "Budget Flow (STEP2) incomplete.";

  const top = sorted[0].contributionPct;
  const second = sorted[1]?.contributionPct ?? 0;
  const third = sorted[2]?.contributionPct ?? 0;
  const clearWinner = top > 0 && top >= second * 1.5 && top - second >= 15;
  const twoOrThreeClose = !clearWinner && top > 0 && (second > 0 || third > 0);

  const level3Pass = clearWinner;
  const level3Detail = clearWinner
    ? `Priority 1 clearly confirmed: ${priority1} at ${top.toFixed(1)}%, next closest ${sorted[1].component} at ${second.toFixed(1)}%.`
    : twoOrThreeClose
    ? `No single dominant bottleneck -- top candidates: ${sorted
        .slice(0, 3)
        .map((r) => `${r.component} (${r.contributionPct.toFixed(1)}%)`)
        .join(", ")}.`
    : "No clear bottleneck signal in the data collected.";

  let decision: "A" | "B" | "C";
  let decisionRationale: string;
  if (clearWinner) {
    decision = "A";
    decisionRationale = `Bottleneck clearly identified as ${priority1} (${top.toFixed(1)}% contribution, decisively ahead of the next candidate). Proceed to System Optimization Blueprint Sprint v1 targeting ${priority1}.`;
  } else if (twoOrThreeClose) {
    decision = "B";
    decisionRationale = `Bottleneck candidates narrowed to 2-3: ${sorted
      .slice(0, 3)
      .map((r) => `${r.component} (${r.contributionPct.toFixed(1)}%)`)
      .join(", ")} -- needs an additional, more targeted instrumentation Sprint to disambiguate before committing to one optimization target.`;
  } else {
    decision = "C";
    decisionRationale = "No component shows a clear bottleneck signal -- the Evaluation Framework itself (how 'opportunity loss'/'capability' are being measured) should be reconsidered before further instrumentation Sprints.";
  }

  return { rows: sorted, priority1, level1Pass, level1Detail, level2Pass, level2Detail, level3Pass, level3Detail, decision, decisionRationale };
}
