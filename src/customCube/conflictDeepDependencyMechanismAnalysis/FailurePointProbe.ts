// --- FailurePointProbe (CONFLICT_DEEP_DEPENDENCY Structural Mechanism
// Analysis Sprint v1, RQ-2) ---------------------------------------------------
// Shadow-instruments each of the 5 Recovery primitives (DISRUPT/SETUP/
// REPAIR/CCR/MIXED_COMMUTATOR) against the CONFLICT_DEEP_DEPENDENCY
// population, calling every underlying function EXACTLY as
// fiveByFiveEdgeRecovery.ts's own generateRecoveryStrategies() calls it
// (same args, same order) -- all read-only, no Production file modified.
//
// Failure Reason taxonomy (disclosed, fixed before measurement):
//   GATE_REJECTED               -- the Primitive's own structural Gate
//     rejected the state before any search ran (REPAIR: analyzeMultiCycle
//     null/cycleLength outside [2,4]; CCR: analyzeCcrGate.eligible===false;
//     MIXED_COMMUTATOR: runMixedCommutatorPrototype's own cycleLength===null,
//     i.e. its internal detectCycle Gate failed).
//   CANDIDATE_GENERATION_EMPTY  -- (DISRUPT/SETUP only, which have NO
//     structural Gate) the exported enumerateWingCandidates() -- the exact
//     function SETUP calls internally, and a same-signature proxy for
//     DISRUPT's own internal (unexported) enumerateWingCandidatesRelaxed,
//     which can only find EQUAL OR MORE candidates than the strict version
//     -- returns zero candidates for EVERY wrong wing.
//   SEARCH_EXHAUSTED_NO_IMPROVEMENT -- candidates existed (per the above
//     proxy) but the real Primitive call still returned null/no match --
//     it explored what it could and never reached a net-improving state.
//   DEADLINE_HIT                -- the real call's own wall-clock exceeded
//     90% of the probe budget (an actual budget-exhaustion artifact, kept
//     separate from a genuine capability ceiling).
//   SOLVED                      -- the real call returned a net-improving
//     result (measured via wrongWingCount decrease), across any of the
//     N repeats.
//
// FAILURE_POINT_BUDGET_MS=5000 matches this arc's own established
// "extended budget, decoupled from production scheduling" convention
// (COVERAGE_TEST_BUDGET_MS in primitiveSetCompleteness/PrimitiveCoverageMatrix
// .ts) -- large enough that DEADLINE_HIT is a genuine signal, not routine
// starvation. N=10 repeats (this arc's own established convention) since
// DISRUPT/SETUP draw from shuffle()-driven stochastic search; REPAIR/CCR/
// MIXED_COMMUTATOR's Gates and search bodies are deterministic given a
// fixed state, so N=10 for them only confirms determinism (expected to be
// unanimous), never changes the classification.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, enumerateWingCandidates, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, wrongWings5, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { runMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";

export const FAILURE_POINT_BUDGET_MS = 5000;
export const FAILURE_POINT_REPEATS = 10;
const DEADLINE_HIT_FRACTION = 0.9; // elapsedMs >= 90% of budget -> classified DEADLINE_HIT

export type RecoveryPrimitiveName = "DISRUPT" | "SETUP" | "REPAIR" | "CCR" | "MIXED_COMMUTATOR";
export type FailureReason = "GATE_REJECTED" | "CANDIDATE_GENERATION_EMPTY" | "SEARCH_EXHAUSTED_NO_IMPROVEMENT" | "DEADLINE_HIT" | "SOLVED";

export interface PrimitiveFailurePointResult {
  primitive: RecoveryPrimitiveName;
  label: string;
  failureReason: FailureReason;
  solvedCount: number; // of N repeats
  avgElapsedMs: number;
  gateDetail: string; // disclosed, human-readable Gate/measurement detail
}

function anyCandidatesExist(cubies: Cubie[], lib: WingLibrary, deadline: number): boolean {
  for (const w of wrongWings5(cubies)) {
    if (enumerateWingCandidates(cubies, w, lib, deadline, 30).length > 0) return true;
  }
  return false;
}

function classifySearchOnlyResult(solvedCount: number, hadCandidates: boolean, avgElapsedMs: number, budgetMs: number): FailureReason {
  if (solvedCount > 0) return "SOLVED";
  if (avgElapsedMs >= budgetMs * DEADLINE_HIT_FRACTION) return "DEADLINE_HIT";
  return hadCandidates ? "SEARCH_EXHAUSTED_NO_IMPROVEMENT" : "CANDIDATE_GENERATION_EMPTY";
}

export function probeDisrupt(cubies: Cubie[], label: string, libs: ExecutorLibraries, nRepeats: number = FAILURE_POINT_REPEATS): PrimitiveFailurePointResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  let solvedCount = 0;
  let totalElapsed = 0;
  for (let r = 0; r < nRepeats; r++) {
    const deadline = Date.now() + FAILURE_POINT_BUDGET_MS;
    const start = Date.now();
    const moves = tryEndgameThroughDisruption(cloneCubies(cubies), libs.lib, libs.flipLib, deadline, 2, 1, libs.caseLib);
    totalElapsed += Date.now() - start;
    if (moves) {
      const clone = cloneCubies(cubies);
      applySeq(clone, moves);
      if (wrongWingCount5(clone) < wrongWingBefore) solvedCount++;
    }
  }
  const hadCandidates = anyCandidatesExist(cubies, libs.lib, Date.now() + FAILURE_POINT_BUDGET_MS);
  const avgElapsedMs = totalElapsed / nRepeats;
  const failureReason = classifySearchOnlyResult(solvedCount, hadCandidates, avgElapsedMs, FAILURE_POINT_BUDGET_MS);
  return { primitive: "DISRUPT", label, failureReason, solvedCount, avgElapsedMs, gateDetail: `no structural Gate; candidateProxyFound=${hadCandidates} (enumerateWingCandidates proxy, DISRUPT itself uses the relaxed superset internally)` };
}

export function probeSetup(cubies: Cubie[], label: string, libs: ExecutorLibraries, nRepeats: number = FAILURE_POINT_REPEATS): PrimitiveFailurePointResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  let solvedCount = 0;
  let totalElapsed = 0;
  for (let r = 0; r < nRepeats; r++) {
    const deadline = Date.now() + FAILURE_POINT_BUDGET_MS;
    const start = Date.now();
    const moves = tryEndgameMultiPly(cloneCubies(cubies), libs.lib, libs.flipLib, deadline);
    totalElapsed += Date.now() - start;
    if (moves) {
      const clone = cloneCubies(cubies);
      applySeq(clone, moves);
      if (wrongWingCount5(clone) < wrongWingBefore) solvedCount++;
    }
  }
  const hadCandidates = anyCandidatesExist(cubies, libs.lib, Date.now() + FAILURE_POINT_BUDGET_MS);
  const avgElapsedMs = totalElapsed / nRepeats;
  const failureReason = classifySearchOnlyResult(solvedCount, hadCandidates, avgElapsedMs, FAILURE_POINT_BUDGET_MS);
  return { primitive: "SETUP", label, failureReason, solvedCount, avgElapsedMs, gateDetail: `no structural Gate; candidateExists=${hadCandidates} (exact same enumerateWingCandidates SETUP calls internally)` };
}

export function probeRepair(cubies: Cubie[], label: string, libs: ExecutorLibraries, nRepeats: number = FAILURE_POINT_REPEATS): PrimitiveFailurePointResult {
  const analysis = analyzeMultiCycle(cubies);
  const gateEligible = !!analysis && analysis.cycleLength >= 2 && analysis.cycleLength <= 4;
  if (!gateEligible) {
    return {
      primitive: "REPAIR",
      label,
      failureReason: "GATE_REJECTED",
      solvedCount: 0,
      avgElapsedMs: 0,
      gateDetail: `analyzeMultiCycle=${analysis ? `cycleLength=${analysis.cycleLength}` : "null (no cycle)"} -- Gate requires cycleLength in [2,4]`,
    };
  }
  const wrongWingBefore = wrongWingCount5(cubies);
  let solvedCount = 0;
  let totalElapsed = 0;
  for (let r = 0; r < nRepeats; r++) {
    const deadline = Date.now() + FAILURE_POINT_BUDGET_MS;
    const start = Date.now();
    const result = runSuccessV2(cloneCubies(cubies), libs.lib, deadline, W2_WIDER_HOP);
    totalElapsed += Date.now() - start;
    if (result.moves) {
      const clone = cloneCubies(cubies);
      applySeq(clone, result.moves);
      if (wrongWingCount5(clone) < wrongWingBefore) solvedCount++;
    }
  }
  const avgElapsedMs = totalElapsed / nRepeats;
  const failureReason = solvedCount > 0 ? "SOLVED" : avgElapsedMs >= FAILURE_POINT_BUDGET_MS * DEADLINE_HIT_FRACTION ? "DEADLINE_HIT" : "SEARCH_EXHAUSTED_NO_IMPROVEMENT";
  return { primitive: "REPAIR", label, failureReason, solvedCount, avgElapsedMs, gateDetail: `Gate PASSED (cycleLength=${analysis!.cycleLength}), search ran` };
}

export function probeCcr(cubies: Cubie[], label: string, libs: ExecutorLibraries, nRepeats: number = FAILURE_POINT_REPEATS): PrimitiveFailurePointResult {
  const gate = analyzeCcrGate(cubies);
  if (!gate.eligible) {
    return {
      primitive: "CCR",
      label,
      failureReason: "GATE_REJECTED",
      solvedCount: 0,
      avgElapsedMs: 0,
      gateDetail: `primaryCycleLength=${gate.primaryCycleLength} (Gate requires [5,6]), conflictEdgeCount=${gate.conflictEdgeCount} (Gate requires 0)`,
    };
  }
  const wrongWingBefore = wrongWingCount5(cubies);
  let solvedCount = 0;
  let totalElapsed = 0;
  for (let r = 0; r < nRepeats; r++) {
    const deadline = Date.now() + FAILURE_POINT_BUDGET_MS;
    const start = Date.now();
    const result = runCCRPrototype(cloneCubies(cubies), libs.lib, deadline, "singleCycle");
    totalElapsed += Date.now() - start;
    if (result.moves) {
      const clone = cloneCubies(cubies);
      applySeq(clone, result.moves);
      if (wrongWingCount5(clone) < wrongWingBefore) solvedCount++;
    }
  }
  const avgElapsedMs = totalElapsed / nRepeats;
  const failureReason = solvedCount > 0 ? "SOLVED" : avgElapsedMs >= FAILURE_POINT_BUDGET_MS * DEADLINE_HIT_FRACTION ? "DEADLINE_HIT" : "SEARCH_EXHAUSTED_NO_IMPROVEMENT";
  return { primitive: "CCR", label, failureReason, solvedCount, avgElapsedMs, gateDetail: "Gate PASSED, search ran" };
}

export function probeMixedCommutator(cubies: Cubie[], label: string, libs: ExecutorLibraries, nRepeats: number = FAILURE_POINT_REPEATS): PrimitiveFailurePointResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  let solvedCount = 0;
  let totalElapsed = 0;
  let lastCycleLength: number | null = null;
  let anyAttempts = 0;
  for (let r = 0; r < nRepeats; r++) {
    const deadline = Date.now() + FAILURE_POINT_BUDGET_MS;
    const start = Date.now();
    const result = runMixedCommutatorPrototype(cloneCubies(cubies), libs.lib, deadline);
    totalElapsed += Date.now() - start;
    lastCycleLength = result.cycleLength;
    anyAttempts += result.attemptsEvaluated;
    if (result.moves) {
      const clone = cloneCubies(cubies);
      applySeq(clone, result.moves);
      if (wrongWingCount5(clone) < wrongWingBefore) solvedCount++;
    }
  }
  const avgElapsedMs = totalElapsed / nRepeats;
  if (lastCycleLength === null) {
    return {
      primitive: "MIXED_COMMUTATOR",
      label,
      failureReason: "GATE_REJECTED",
      solvedCount,
      avgElapsedMs,
      gateDetail: "internal detectCycle Gate failed (cycleLength=null, no cycle) -- attemptsEvaluated=0",
    };
  }
  const failureReason = solvedCount > 0 ? "SOLVED" : avgElapsedMs >= FAILURE_POINT_BUDGET_MS * DEADLINE_HIT_FRACTION ? "DEADLINE_HIT" : "SEARCH_EXHAUSTED_NO_IMPROVEMENT";
  return { primitive: "MIXED_COMMUTATOR", label, failureReason, solvedCount, avgElapsedMs, gateDetail: `Gate PASSED (cycleLength=${lastCycleLength}), avgAttemptsEvaluated=${(anyAttempts / nRepeats).toFixed(1)}` };
}

export function probeAllPrimitives(cubies: Cubie[], label: string, libs: ExecutorLibraries, nRepeats: number = FAILURE_POINT_REPEATS): PrimitiveFailurePointResult[] {
  return [probeDisrupt(cubies, label, libs, nRepeats), probeSetup(cubies, label, libs, nRepeats), probeRepair(cubies, label, libs, nRepeats), probeCcr(cubies, label, libs, nRepeats), probeMixedCommutator(cubies, label, libs, nRepeats)];
}
