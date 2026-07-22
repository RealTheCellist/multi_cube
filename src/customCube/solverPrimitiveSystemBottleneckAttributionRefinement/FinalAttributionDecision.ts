// --- FinalAttributionDecision (Solver System Bottleneck Attribution
// Refinement Sprint v1, STEP6) -----------------------------------------------
// Combines STEP4's ENDGAME time-headroom (per Reachable case) and STEP5's
// Planner routing-benefit (per PlannerSkipped case) into population-level
// TOTAL potential-gain figures (same units: summed wrongWingCount
// improvement across the full population), normalizes them to percentages
// of their combined total, and applies this whole research arc's own
// decisiveness rule (effect size >=1.5x OR absolute difference >=15pp) to
// either confirm a single Priority 1 or keep Decision B.
import type { ReachabilitySummary } from "./PlannerReachabilityAnalysis";
import type { EndgameHeadroom } from "./OpportunitySaturationCurve";
import type { PlannerBenefitSummary } from "./PlannerBenefitCeiling";

export interface AttributionRow {
  candidate: "ENDGAME" | "Planner";
  totalPotentialGain: number; // summed wrongWingCount improvement across the whole population if this issue alone were fixed
  contributionPct: number; // % of the combined (ENDGAME + Planner) total potential gain
}

export interface FinalAttributionResult {
  rows: AttributionRow[];
  priority1: "ENDGAME" | "Planner" | null;
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

const DECISIVE_RATIO = 1.5;
const DECISIVE_ABS_DIFF_PP = 15;
const NEGLIGIBLE_TOTAL_GAIN = 1; // both candidates' total potential gain below this (in wrongWingCount units) -> Decision C

export function computeFinalAttribution(
  reachability: ReachabilitySummary,
  endgameHeadroom: EndgameHeadroom,
  plannerBenefit: PlannerBenefitSummary
): FinalAttributionResult {
  const endgameTotalGain = endgameHeadroom.headroomPerCase * reachability.reachableCount;
  const plannerTotalGain = plannerBenefit.totalImprovement;
  const combinedTotal = endgameTotalGain + plannerTotalGain;

  const endgamePct = combinedTotal > 0 ? (endgameTotalGain / combinedTotal) * 100 : 0;
  const plannerPct = combinedTotal > 0 ? (plannerTotalGain / combinedTotal) * 100 : 0;

  const rows: AttributionRow[] = [
    { candidate: "ENDGAME" as const, totalPotentialGain: endgameTotalGain, contributionPct: endgamePct },
    { candidate: "Planner" as const, totalPotentialGain: plannerTotalGain, contributionPct: plannerPct },
  ].sort((a, b) => b.contributionPct - a.contributionPct);

  const level1Pass = reachability.n > 0;
  const level1Detail = `Reachability quantified across ${reachability.n} real snapshots: Reachable ${reachability.reachableCount} (${reachability.reachablePct.toFixed(1)}%), PlannerSkipped ${reachability.plannerSkippedCount} (${reachability.plannerSkippedPct.toFixed(1)}%), AlreadySolvedBeforeEndgame ${reachability.alreadySolvedCount} (${reachability.alreadySolvedPct.toFixed(1)}%), StructurallyImpossible ${reachability.structurallyImpossibleCount} (${reachability.structurallyImpossiblePct.toFixed(1)}%).`;

  const level2Pass = endgameHeadroom.largestBudgetImprovement >= 0;
  const level2Detail = `ENDGAME Capability Ceiling: avg improvement ${endgameHeadroom.smallestBudgetImprovement.toFixed(3)} (smallest budget) -> ${endgameHeadroom.largestBudgetImprovement.toFixed(3)} (largest budget), headroom per Reachable case = ${endgameHeadroom.headroomPerCase.toFixed(3)}.`;

  const top = rows[0];
  const second = rows[1];
  const isNegligible = combinedTotal < NEGLIGIBLE_TOTAL_GAIN;
  const isDecisive = !isNegligible && top.contributionPct >= second.contributionPct * DECISIVE_RATIO && top.contributionPct - second.contributionPct >= DECISIVE_ABS_DIFF_PP;

  const level3Pass = isDecisive;
  const level3Detail = isNegligible
    ? `Both candidates' total potential gain is negligible (combined ${combinedTotal.toFixed(2)} wrongWingCount units across the whole population) -- neither fix promises a meaningful improvement.`
    : `${top.candidate} (${top.contributionPct.toFixed(1)}%) vs ${second.candidate} (${second.contributionPct.toFixed(1)}%) -- ${isDecisive ? "decisive" : "not decisive (ratio or absolute-difference threshold not met)"}.`;

  let decision: "A" | "B" | "C";
  let decisionRationale: string;
  let priority1: "ENDGAME" | "Planner" | null = null;

  if (isNegligible) {
    decision = "C";
    decisionRationale = "Both ENDGAME time-headroom and Planner routing-benefit are negligible at the population level -- neither is a productive next optimization target; re-search for the real bottleneck elsewhere.";
  } else if (isDecisive) {
    decision = "A";
    priority1 = top.candidate;
    decisionRationale = `${top.candidate} decisively confirmed as Priority 1 (${top.contributionPct.toFixed(1)}% vs ${second.candidate}'s ${second.contributionPct.toFixed(1)}%, clearing both the ${DECISIVE_RATIO}x ratio and ${DECISIVE_ABS_DIFF_PP}pp absolute-difference thresholds). Proceed to ${top.candidate === "ENDGAME" ? "ENDGAME Optimization Blueprint Sprint v1" : "Planner Optimization Blueprint Sprint v1"}.`;
  } else {
    decision = "B";
    decisionRationale = `${top.candidate} (${top.contributionPct.toFixed(1)}%) and ${second.candidate} (${second.contributionPct.toFixed(1)}%) remain too close to decisively prioritize one -- both real, both worth fixing. Proceed with parallel Blueprint Sprints for both.`;
  }

  return { rows, priority1, level1Pass, level1Detail, level2Pass, level2Detail, level3Pass, level3Detail, decision, decisionRationale };
}
