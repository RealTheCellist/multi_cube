// --- GateReplay (Solver Validation Framework Qualification Sprint v1,
// STEP3) -------------------------------------------------------------------
// Feeds each HistoricalCase's own reconstructed KPI MetricEvaluations
// through the Framework's OWN, unmodified Gate functions
// (solverPostReleaseValidationFramework/ReleaseGates.ts) -- no Framework
// code changed, no new Gate logic invented here.
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateD, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import type { HistoricalCase } from "./HistoricalQualificationDataset";

// Baseline p95 stand-in for Gate B: most historical Sprints did not
// separately publish a "Baseline p95" figure comparable across Sprints
// (some report only the Integrated arm's own p95). Disclosed placeholder,
// consistent with the ~1200-1300ms range this arc's own Sprints
// repeatedly measured (Scheduler Prototype/Production Integration/Release
// Readiness all landed in this band).
export const PLACEHOLDER_BASELINE_P95_MS = 1200;

export function replayGatesForCase(historicalCase: HistoricalCase): GateResult[] {
  const gateA = evaluateGateA(historicalCase.trueRegressionDiff, historicalCase.trueRegressionDiff);
  const gateB = evaluateGateB(historicalCase.runtimeDiffMs, PLACEHOLDER_BASELINE_P95_MS);
  const gateC = evaluateGateC(historicalCase.improvedCountDiff);
  const gateD = evaluateGateD([{ contract: `${historicalCase.sprintName} (historical)`, status: historicalCase.contractsHeld ? "PASS" : "FAIL" }]);
  const gateE = evaluateGateE({ duplicateCount: 0, starvedTypeCount: 0 }); // historical Sprints predate Duplicate/Starvation fields -- assumed clean, disclosed
  return [gateA, gateB, gateC, gateD, gateE];
}

export interface GateReplayRow {
  sprintName: string;
  gates: GateResult[];
}

export function replayAllGates(cases: readonly HistoricalCase[]): GateReplayRow[] {
  return cases.map((c) => ({ sprintName: c.sprintName, gates: replayGatesForCase(c) }));
}
