// --- GateReplayV2 (Solver Validation Framework Qualification Refinement
// Sprint v1, STEP3) ----------------------------------------------------------
// Same as the original GateReplay.ts (feeds each HistoricalCase's own
// reconstructed KPI MetricEvaluations through the Framework's Gate
// functions), except Gate C is now called with strict=true for Category
// B/C/D -- this is what closes the 1 False PASS (Incremental Recovery),
// which will now surface as OPEN_QUESTION instead of PASS since its own
// improvedCountDiff is not a significant improvement (CI=[-0.691,0.224]).
// Gates A/B/D/E are untouched -- same calls as the original GateReplay.ts.
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateD, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { PLACEHOLDER_BASELINE_P95_MS } from "../solverValidationFrameworkQualification/GateReplay";
import type { HistoricalCase } from "../solverValidationFrameworkQualification/HistoricalQualificationDataset";
import { requiresStrictGateC } from "./QualificationHelper";

export function replayGatesForCaseV2(historicalCase: HistoricalCase): GateResult[] {
  const gateA = evaluateGateA(historicalCase.trueRegressionDiff, historicalCase.trueRegressionDiff);
  const gateB = evaluateGateB(historicalCase.runtimeDiffMs, PLACEHOLDER_BASELINE_P95_MS);
  const gateC = evaluateGateC(historicalCase.improvedCountDiff, requiresStrictGateC(historicalCase.assignedCategory));
  const gateD = evaluateGateD([{ contract: `${historicalCase.sprintName} (historical)`, status: historicalCase.contractsHeld ? "PASS" : "FAIL" }]);
  const gateE = evaluateGateE({ duplicateCount: 0, starvedTypeCount: 0 });
  return [gateA, gateB, gateC, gateD, gateE];
}

export interface GateReplayRowV2 {
  sprintName: string;
  gates: GateResult[];
}

export function replayAllGatesV2(cases: readonly HistoricalCase[]): GateReplayRowV2[] {
  return cases.map((c) => ({ sprintName: c.sprintName, gates: replayGatesForCaseV2(c) }));
}
