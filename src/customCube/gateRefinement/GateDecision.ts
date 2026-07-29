// --- GateDecision (Gate Refinement Sprint v1, Section 7 "Success Criteria",
// Section 10 "Expected Decision") ---------------------------------------------
import type { GateSummaryRow } from "./GateComparisonSummary";
import type { RecoveryRatioRow } from "./RecoveryRatio";

export type GateConclusion = "A_REPLACE_GATE" | "B_NEEDS_REFINEMENT" | "C_KEEP_CURRENT";

export interface GateDecisionRow {
  gateId: GateSummaryRow["gateId"];
  improvedIncreased: boolean;
  improvedDelta: number; // gate.improvedByMixedCount - baseline.improvedByMixedCount
  regressionZero: boolean;
  runtimeAcceptable: boolean;
  recoveryRatioMeaningfullyIncreased: boolean;
  conclusion: GateConclusion;
  rationale: string;
}

// Disclosed thresholds, fixed before reading results:
// - "meaningful" Improved increase: >=5 case-repeats (out of 142*N) -- small
//   enough to catch a real signal, large enough not to chase single-digit
//   noise from DISRUPT/SETUP's own stochastic search.
// - "runtime acceptable": timeout rate among eligible+attempted cases <=50%
//   (every attempt is already hard-capped at the 300ms production budget by
//   construction -- this only flags a Gate whose ADDED eligible population
//   is dominated by cases that never even finish searching in time).
const MEANINGFUL_IMPROVED_DELTA = 5;
const TIMEOUT_RATE_ACCEPTABLE = 0.5;

export function decideGate(gate: GateSummaryRow, baseline: GateSummaryRow, ratio: RecoveryRatioRow, baselineRatio: RecoveryRatioRow): GateDecisionRow {
  const improvedDelta = gate.improvedByMixedCount - baseline.improvedByMixedCount;
  const improvedIncreased = improvedDelta > 0;
  const regressionZero = gate.trueRegressionCount === 0;
  const attemptedCount = gate.eligibleCases; // cases actually attempted (repeat-independent, Mixed itself deterministic)
  const timeoutRate = attemptedCount > 0 ? gate.timeoutCount / attemptedCount : 0;
  const runtimeAcceptable = timeoutRate <= TIMEOUT_RATE_ACCEPTABLE;
  const recoveryRatioMeaningfullyIncreased = ratio.recoveryRatio > baselineRatio.recoveryRatio && improvedDelta >= MEANINGFUL_IMPROVED_DELTA;

  let conclusion: GateConclusion;
  let rationale: string;
  if (recoveryRatioMeaningfullyIncreased && regressionZero && runtimeAcceptable) {
    conclusion = "A_REPLACE_GATE";
    rationale = `improvedDelta=+${improvedDelta} (유의미), regression=0, timeoutRate=${(timeoutRate * 100).toFixed(1)}% (허용범위), recoveryRatio ${baselineRatio.recoveryRatio.toFixed(3)}->${ratio.recoveryRatio.toFixed(3)} -- Gate 교체 권고 조건 모두 충족.`;
  } else if (improvedIncreased && (!regressionZero || !runtimeAcceptable)) {
    conclusion = "B_NEEDS_REFINEMENT";
    rationale = `improvedDelta=+${improvedDelta}(증가)이나 regressionZero=${regressionZero}, runtimeAcceptable=${runtimeAcceptable} -- 추가 Refinement 필요.`;
  } else if (improvedIncreased) {
    conclusion = "B_NEEDS_REFINEMENT";
    rationale = `improvedDelta=+${improvedDelta}로 증가는 있으나 ${MEANINGFUL_IMPROVED_DELTA}건 미만으로 유의미하지 않음 -- 추가 Refinement 검토 필요.`;
  } else {
    conclusion = "C_KEEP_CURRENT";
    rationale = `improvedDelta=${improvedDelta >= 0 ? "+" : ""}${improvedDelta} -- 증가가 거의 없거나 없음. 현재 Gate 유지.`;
  }

  return { gateId: gate.gateId, improvedIncreased, improvedDelta, regressionZero, runtimeAcceptable, recoveryRatioMeaningfullyIncreased, conclusion, rationale };
}

export function pickFinalRecommendedGate(decisions: readonly GateDecisionRow[], summaries: readonly GateSummaryRow[]): GateDecisionRow | null {
  const candidatesA = decisions.filter((d) => d.conclusion === "A_REPLACE_GATE");
  if (candidatesA.length === 0) return null;
  const byImproved = new Map(summaries.map((s) => [s.gateId, s.improvedByMixedCount]));
  return candidatesA.reduce((best, d) => ((byImproved.get(d.gateId) ?? 0) > (byImproved.get(best.gateId) ?? 0) ? d : best));
}
