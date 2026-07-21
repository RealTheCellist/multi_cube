// --- IntegrationSimulation (CCR Integration Blueprint Sprint v1) -----------
// STEP5. "실제 제품 코드 수정 없이 Integration 순서를 시뮬레이션한다" --
// achieved by COMPOSING two independently, REALLY executed measurements,
// never wiring CCR into fiveByFiveEdgeRecovery.ts itself:
//   1. analyzeProductionPath (solverPrimitiveIntegrationV2/
//      ProductionPathAnalysis.ts, READ-ONLY, unmodified) -- calls the
//      REAL, unmodified FiveByFiveEdgeSolverEngine.solve() to get the
//      REAL current baseline: runtime, whether Recovery triggered, final
//      score, exactly as production behaves TODAY (CCR does not exist in
//      this path at all).
//   2. runCCRPrototype (solverPrimitiveCCRPrototype/CCRPrototype.ts,
//      already built and validated in the prior Sprint, unmodified) --
//      called directly against the SAME raw snapshot state, entirely
//      separately from solve(), to measure CCR's own isolated
//      match/success/timing.
// Summing the two (baseline runtime + CCR's own added time, gated on
// "would CCR even get a turn": Recovery triggered AND CCR's Gate matches)
// is the disclosed simulation methodology -- an estimate composed from
// two real executions, not a new production code path.
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import type { ProductionPathRecord } from "../solverPrimitiveIntegrationV2/ProductionPathAnalysis";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";

export interface IntegrationSimulationRecord {
  hash: string;
  baselineSolved: boolean;
  baselineRuntimeMs: number;
  baselineRecoveryTriggered: boolean;
  ccrGateEligible: boolean;
  ccrWouldBeCalled: boolean; // baselineRecoveryTriggered && ccrGateEligible -- CCR only ever gets a turn inside Recovery
  ccrSucceeded: boolean; // CCR's own isolated net-improvement, only meaningful if ccrWouldBeCalled
  ccrTimeMs: number;
  estimatedNewCapability: boolean; // CCR succeeds where baseline alone did not solve
  estimatedIntegratedRuntimeMs: number;
}

export function simulateIntegration(
  snapshots: readonly FailureSnapshot[],
  productionRecords: readonly ProductionPathRecord[],
  lib: WingLibrary,
  ccrBudgetMs: number,
): IntegrationSimulationRecord[] {
  const productionByHash = new Map(productionRecords.map((r) => [r.hash, r]));
  return snapshots.map((s) => {
    const prod = productionByHash.get(s.hash)!;
    const cubies = deserializeCube(s.cubeState);
    const gate = analyzeCcrGate(cubies);
    const ccrWouldBeCalled = prod.recoveryTriggered && gate.eligible;

    let ccrSucceeded = false;
    let ccrTimeMs = 0;
    if (ccrWouldBeCalled) {
      const wrongBefore = wrongWingCount5(cubies);
      const start = Date.now();
      const result = runCCRPrototype(cubies, lib, Date.now() + ccrBudgetMs, "singleCycle");
      ccrTimeMs = Date.now() - start;
      if (result.moves) {
        const clone = cloneCubies(cubies);
        applySeq(clone, result.moves);
        ccrSucceeded = wrongWingCount5(clone) < wrongBefore;
      }
    }

    return {
      hash: s.hash,
      baselineSolved: prod.solved,
      baselineRuntimeMs: prod.timeMs,
      baselineRecoveryTriggered: prod.recoveryTriggered,
      ccrGateEligible: gate.eligible,
      ccrWouldBeCalled,
      ccrSucceeded,
      ccrTimeMs,
      estimatedNewCapability: !prod.solved && ccrSucceeded,
      estimatedIntegratedRuntimeMs: prod.timeMs + (ccrWouldBeCalled ? ccrTimeMs : 0),
    };
  });
}

export interface IntegrationSimulationSummary {
  n: number;
  ccrCallRate: number; // fraction of solve() calls where CCR would actually be invoked
  estimatedNewCapabilityCount: number;
  baselineAvgRuntimeMs: number;
  estimatedIntegratedAvgRuntimeMs: number;
  ccrAvgTimeMsWhenCalled: number;
  ccrEligibleAmongRecoveryTriggeredRate: number;
}

export function summarizeIntegrationSimulation(records: readonly IntegrationSimulationRecord[]): IntegrationSimulationSummary {
  const n = records.length;
  const called = records.filter((r) => r.ccrWouldBeCalled);
  const recoveryTriggered = records.filter((r) => r.baselineRecoveryTriggered);
  return {
    n,
    ccrCallRate: n ? called.length / n : 0,
    estimatedNewCapabilityCount: records.filter((r) => r.estimatedNewCapability).length,
    baselineAvgRuntimeMs: n ? records.reduce((a, r) => a + r.baselineRuntimeMs, 0) / n : 0,
    estimatedIntegratedAvgRuntimeMs: n ? records.reduce((a, r) => a + r.estimatedIntegratedRuntimeMs, 0) / n : 0,
    ccrAvgTimeMsWhenCalled: called.length ? called.reduce((a, r) => a + r.ccrTimeMs, 0) / called.length : 0,
    ccrEligibleAmongRecoveryTriggeredRate: recoveryTriggered.length ? called.length / recoveryTriggered.length : 0,
  };
}
