// --- PopulationReplay (Solver Long-term Reliability Validation Sprint
// v1, STEP2) -----------------------------------------------------------------
// Real, unmodified-production population replay. Reuses solveE2EProbe()
// directly (disclosed reuse, imported not duplicated) from
// solverPrimitiveMultiComponentMergeValidationMethodology/SharedProbes.ts
// -- that function is fully generic over any HoleCase and already calls
// the real FiveByFiveEdgeSolverEngine.solve() end-to-end. This module only
// adds independent per-case wall-clock timing (for Runtime Distribution,
// STEP3) around that existing call -- no new solve()-invocation logic.
import { solveE2EProbe, type SolveE2EProbeResult } from "../solverPrimitiveMultiComponentMergeValidationMethodology/SharedProbes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface ReplayRow {
  label: string;
  runtimeMs: number;
  result: SolveE2EProbeResult;
}

export const PRODUCTION_RECOVERY_RESERVE_MS = 250; // real production default, read-only citation

export function runPopulationReplay(holes: readonly HoleCase[], recoveryReserveMsOverride: number = PRODUCTION_RECOVERY_RESERVE_MS): ReplayRow[] {
  return holes.map((hole) => {
    const t0 = Date.now();
    const result = solveE2EProbe(hole, recoveryReserveMsOverride);
    const runtimeMs = Date.now() - t0;
    return { label: hole.label, runtimeMs, result };
  });
}
