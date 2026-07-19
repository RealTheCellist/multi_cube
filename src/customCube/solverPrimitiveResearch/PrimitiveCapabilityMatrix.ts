// --- PrimitiveCapabilityMatrix (Solver Primitive Capability Analysis
// Sprint v1) ----------------------------------------------------------
// STEP1: builds the real Primitive x Replay success/fail matrix over the
// 150-replay Dataset for the 5 existing allowed Primitives (BASE/FLIP/
// CASE/PARITY/BP-1 -- same scope Representation Prototype Sprint v1 used).
// Reuses `testAllAllowedSingleShot`/`ALLOWED_PRIMITIVES`
// (solverRepresentationPrototype/RepresentationPrimitiveSelector.ts,
// unmodified, read-only) -- a single independent probe per Primitive on a
// fresh clone of each replay's ORIGINAL untouched state, exactly like this
// whole project's own GapDetector.profileReplay/testAllCapabilities
// pattern (no sequential orchestration this time -- this Sprint measures
// raw per-Primitive CAPABILITY, not order-dependent outcomes).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { ALLOWED_PRIMITIVES, testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";

const SINGLE_SHOT_DEADLINE_MS = 300;

export interface MatrixRow {
  hash: string;
  success: Record<AllowedPrimitive, boolean>;
  anySucceeded: boolean;
  successCount: number; // how many of the 5 Primitives succeed on this replay
}

export function buildCapabilityMatrix(failuresDbPath: string): MatrixRow[] {
  const all150 = loadAll75(failuresDbPath);
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  return all150.map((snapshot) => {
    const cubies = deserializeCube(snapshot.cubeState);
    const success = testAllAllowedSingleShot(cubies, libs, SINGLE_SHOT_DEADLINE_MS);
    const successCount = ALLOWED_PRIMITIVES.filter((p) => success[p]).length;
    return { hash: snapshot.hash, success, anySucceeded: successCount > 0, successCount };
  });
}

export interface PrimitiveSuccessSummary {
  primitive: AllowedPrimitive;
  successCount: number;
  totalReplays: number;
  successRate: number;
}

export function summarizePrimitiveSuccess(matrix: readonly MatrixRow[]): PrimitiveSuccessSummary[] {
  const total = matrix.length;
  return ALLOWED_PRIMITIVES.map((p) => {
    const successCount = matrix.filter((r) => r.success[p]).length;
    return { primitive: p, successCount, totalReplays: total, successRate: total ? successCount / total : 0 };
  });
}

// How many of the 5 Primitives succeed per replay -- a coarse read on how
// much redundancy/richness exists BEFORE any pairwise Jaccard analysis
// (STEP2): a replay with successCount=0 is a Gap candidate (STEP4); a
// replay with successCount>=3 suggests substantial redundancy among
// whichever Primitives fire together.
export interface SuccessCountHistogramEntry {
  successCount: number;
  replayCount: number;
}

export function successCountHistogram(matrix: readonly MatrixRow[]): SuccessCountHistogramEntry[] {
  const counts = new Map<number, number>();
  for (let i = 0; i <= ALLOWED_PRIMITIVES.length; i++) counts.set(i, 0);
  for (const row of matrix) counts.set(row.successCount, (counts.get(row.successCount) ?? 0) + 1);
  return [...counts.entries()].map(([successCount, replayCount]) => ({ successCount, replayCount })).sort((a, b) => a.successCount - b.successCount);
}
