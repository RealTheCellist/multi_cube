// --- RefinementRawDataCollector (Solver Primitive Integration Refinement
// Sprint v1) -- collects ONE shared raw dataset per run per scheduling
// strategy, reused by STEP1(Scheduling Verification)/STEP2(Budget
// Profile)/STEP3(Integration Benchmark), matching the "collect once per
// run, share across all downstream STEPs" discipline established since
// Evaluation Stabilization Sprint v1's own RawDataCollector.ts. Calls the
// REAL, now-parametrized generateRecoveryStrategies() directly (this
// Sprint's own STEP1 change in fiveByFiveEdgeRecovery.ts) with its
// SchedulingEvent instrumentation hook -- no reimplementation of the
// scheduling logic under test.
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { generateRecoveryStrategies, RECOVERY_GEN_BUDGET_MS, type SchedulingStrategy, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;
// Outer deadline handed to generateRecoveryStrategies -- large relative to
// RECOVERY_GEN_BUDGET_MS(300ms)/REPAIR_RESERVED_SLICE_MS(75ms) so genDeadline
// (and reservedBudget's own window) is never constrained by THIS outer
// value, matching how much headroom the real production Recovery call
// typically has (RECOVERY_RESERVE_MS reserves 450ms+ off the plan deadline).
const OUTER_DEADLINE_MS = 1000;

export interface PerSnapshotGenerationRecord {
  hash: string;
  repairGenerated: boolean; // REPAIR ended up in candidates[] (add() accepted non-null/non-empty moves)
  repairSucceeded: boolean; // generated AND net wrongWingCount improvement
  repairRegressed: boolean; // generated but wrongWingCount increased (should never happen -- checked empirically)
  repairAttempted: boolean; // REPAIR's own "start" event fired at all
  repairSkipped: boolean; // REPAIR's turn never even started (shared-genDeadline gate rejected it pre-emptively -- always false for reservedBudget by construction)
  candidateCount: number;
  generationTimeMs: number; // whole generateRecoveryStrategies() call wall time
  repairStartOffsetMs: number | null; // ms from call-start to REPAIR's own "start" event; null if never started
}

export type VariantGenerationRun = PerSnapshotGenerationRecord[];

export function collectGenerationRun(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, strategy: SchedulingStrategy): VariantGenerationRun {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);

    const events: SchedulingEvent[] = [];
    const callStart = Date.now();
    const candidates = generateRecoveryStrategies(cubies, libs, callStart + OUTER_DEADLINE_MS, DEFAULT_EVALUATOR_WEIGHTS, true, strategy, (e) => events.push(e));
    const generationTimeMs = Date.now() - callStart;

    const repair = candidates.find((c) => c.type === "REPAIR") ?? null;
    let repairSucceeded = false;
    let repairRegressed = false;
    if (repair) {
      const clone = cloneCubies(cubies);
      applySeq(clone, repair.moves);
      const wrongWingAfter = wrongWingCount5(clone);
      repairSucceeded = wrongWingAfter < wrongWingBefore;
      repairRegressed = wrongWingAfter > wrongWingBefore;
    }

    const repairStartEvent = events.find((e) => e.candidateType === "REPAIR" && e.phase === "start");
    const repairSkippedEvent = events.find((e) => e.candidateType === "REPAIR" && e.phase === "skipped");

    return {
      hash: s.hash,
      repairGenerated: !!repair,
      repairSucceeded,
      repairRegressed,
      repairAttempted: !!repairStartEvent,
      repairSkipped: !!repairSkippedEvent,
      candidateCount: candidates.length,
      generationTimeMs,
      repairStartOffsetMs: repairStartEvent ? repairStartEvent.atMs - callStart : null,
    };
  });
}

export function collectMultipleGenerationRuns(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, strategy: SchedulingStrategy, times: number): VariantGenerationRun[] {
  const runs: VariantGenerationRun[] = [];
  for (let i = 0; i < times; i++) runs.push(collectGenerationRun(snapshots, libs, strategy));
  return runs;
}

export interface GapRecord {
  hash: string;
  isGap: boolean; // all 5 existing research-framework Primitives fail (BASE/FLIP/CASE/PARITY/BP1) -- scheduling-independent, computed once per run
}
export type GapRunRecord = GapRecord[];

export function collectGapRun(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): GapRunRecord {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const primitiveSuccess = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
    const isGap = (Object.keys(primitiveSuccess) as AllowedPrimitive[]).every((p) => !primitiveSuccess[p]);
    return { hash: s.hash, isGap };
  });
}

export function collectMultipleGapRuns(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, times: number): GapRunRecord[] {
  const runs: GapRunRecord[] = [];
  for (let i = 0; i < times; i++) runs.push(collectGapRun(snapshots, libs));
  return runs;
}

export { RECOVERY_GEN_BUDGET_MS };
