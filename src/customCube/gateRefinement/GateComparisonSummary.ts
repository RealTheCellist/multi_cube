// --- GateComparisonSummary (Gate Refinement Sprint v1, Section 6
// "Measurements") ------------------------------------------------------------
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import type { CaseMeasurement } from "./GateCaseMeasurement";
import type { GateId } from "./GateDefinitions";

export interface GateSummaryRow {
  gateId: GateId;
  eligibleCases: number; // cases where this Gate's predicate holds (out of 142, repeat-independent)
  generatedCases: number; // eligible AND mixedGenerated (repeat-independent -- Mixed itself is deterministic)
  // Below are aggregated across all case-repeats (n = cases x nRepeats)
  mixedChosenCount: number; // how many case-repeats picked MIXED_COMMUTATOR as the real chooseBestRecovery() winner
  improvedByMixedCount: number; // mixedChosen AND wrongWingAfter < wrongWingBefore
  uniqueCapabilityCases: number; // cases (not case-repeats) where Mixed was EVER the winner across repeats AND no other candidate type ever won an improving outcome for that case without Mixed (i.e. Gate A's own row never had an improving non-Mixed winner either)
  trueRegressionCount: number; // cases where this Gate's mean wrongWingAfter is >0.5 worse than Gate A's own mean, across repeats
  runtimeStats: SampleStats; // wall-ms cost of Mixed's own generation, ONLY counted on repeats where eligible (0 otherwise)
  timeoutCount: number; // eligible AND mixedGenerated-attempt did not exhaust its search space within budget
}

const TRUE_REGRESSION_MEAN_GAP_THRESHOLD = 0.5;

export function summarizeGate(gateId: GateId, cases: readonly CaseMeasurement[]): GateSummaryRow {
  let eligibleCases = 0;
  let generatedCases = 0;
  let mixedChosenCount = 0;
  let improvedByMixedCount = 0;
  let uniqueCapabilityCases = 0;
  let trueRegressionCount = 0;
  const runtimeSamples: number[] = [];
  let timeoutCount = 0;

  for (const c of cases) {
    const gateRows = c.perRepeat.map((row) => row.find((r) => r.gateId === gateId)!);
    const baselineRows = c.perRepeat.map((row) => row.find((r) => r.gateId === "A")!);
    const eligible = gateRows[0].eligible;
    if (eligible) {
      eligibleCases++;
      if (c.mixedGenerated) generatedCases++;
    }

    for (const row of gateRows) {
      if (row.mixedChosen) {
        mixedChosenCount++;
        if (row.wrongWingAfter !== null && row.wrongWingAfter < c.wrongWingBefore) improvedByMixedCount++;
      }
    }

    if (gateRows.some((row) => row.mixedChosen)) {
      const anyNonMixedImprovingWithoutMixed = baselineRows.some((row) => !row.mixedChosen && row.wrongWingAfter !== null && row.wrongWingAfter < c.wrongWingBefore);
      if (!anyNonMixedImprovingWithoutMixed) uniqueCapabilityCases++;
    }

    if (eligible && c.mixedGenerated) {
      runtimeSamples.push(c.mixedWallMs);
      if (!c.mixedExhausted) timeoutCount++;
    } else if (eligible) {
      runtimeSamples.push(c.mixedWallMs); // Gate check + failed search still costs wall time
    }

    const meanGateWrong = gateRows.reduce((a, r) => a + (r.wrongWingAfter ?? c.wrongWingBefore), 0) / gateRows.length;
    const meanBaselineWrong = baselineRows.reduce((a, r) => a + (r.wrongWingAfter ?? c.wrongWingBefore), 0) / baselineRows.length;
    if (meanGateWrong - meanBaselineWrong > TRUE_REGRESSION_MEAN_GAP_THRESHOLD) trueRegressionCount++;
  }

  return {
    gateId,
    eligibleCases,
    generatedCases,
    mixedChosenCount,
    improvedByMixedCount,
    uniqueCapabilityCases,
    trueRegressionCount,
    runtimeStats: computeStats(runtimeSamples),
    timeoutCount,
  };
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}
