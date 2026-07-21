// --- RecoveryLevelCollector (CCR Production Integration Sprint v1) --------
// STEP1/3/4. Calls the REAL, now-CCR-wired attemptRecovery() (Recovery
// layer, this Sprint's own allowed "Integration Layer") DIRECTLY --
// bypassing fiveByFiveEdgeExecutor.ts (frozen this Sprint) -- for a
// controlled Baseline (includeCCR=false) vs Candidate (includeCCR=true)
// comparison at N repeated runs. Since attemptRecovery() needs a
// `retryTask` callback (normally supplied by Executor), this file
// provides `endgameRetryTask`: a disclosed, independent reimplementation
// of fiveByFiveEdgeExecutor.ts's own UNEXPORTED runPrimaryPipeline ENDGAME
// branch, using the exact same EXISTING, unmodified exports
// (bestFixOverall/tryEndgameMultiPly/tryEndgameThroughDisruption) --
// Executor itself is never imported, modified, or bypassed at the type
// level; this only reproduces its ENDGAME branch's real behavior so
// attemptRecovery's retry step behaves exactly as production's real
// retryTask would.
//
// Ground-truth CCR/REPAIR Gate eligibility and probe success are computed
// ONCE per snapshot (computeGroundTruth), not once per run -- both are
// deterministic given the snapshot's own raw state (no PARITY-style
// shuffle() randomness involved in Gate checks), so recomputing them on
// every one of N=15~30 runs would be pure waste (each CCR probe alone
// costs up to ~1000ms on its own eligible population). Only
// wasExistingGap (testAllAllowedSingleShot, which DOES include PARITY's
// own real randomness) and the baseline/candidate attemptRecovery() calls
// themselves (the actual effect under test) are recomputed per run.
import { cloneCubies, type Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import {
  applySeq,
  bestFixOverall,
  ENDGAME_MULTIPLY_THRESHOLD,
  tryEndgameMultiPly,
  tryEndgameThroughDisruption,
  wrongWingCount5,
  type Move,
  type WingLibrary,
} from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;

// Matches PLAN_TIME_BUDGET_MS (fiveByFiveEdgeSolverEngine.ts) -- the
// isolated-call convention every prior Sprint's own Recovery-level
// benchmark in this arc has used (e.g. solverPrimitiveIntegrationV2's own
// GATE_VARIANT_DEADLINE_MS), sized to the real whole-plan budget so CCR's
// own remainingTime policy is exercised realistically.
const CALL_DEADLINE_MS = 1000;

function endgameRetryTask(cubies: Cubie[], libs: ExecutorLibraries, deadline: number): Move[] {
  const { lib, flipLib, caseLib } = libs;
  const applied: Move[] = [];
  let guard = 0;
  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline && guard < 50) {
    guard++;
    const fix = bestFixOverall(cubies, lib, flipLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      applied.push(...fix);
      continue;
    }
    if (wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD) {
      const endgameFix = tryEndgameMultiPly(cubies, lib, flipLib, deadline);
      if (endgameFix && endgameFix.length > 0) {
        applySeq(cubies, endgameFix);
        applied.push(...endgameFix);
        continue;
      }
    }
    break;
  }
  if (wrongWingCount5(cubies) > 0 && wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD && Date.now() < deadline) {
    const disruptionFix = tryEndgameThroughDisruption(cubies, lib, flipLib, deadline, undefined, undefined, caseLib);
    if (disruptionFix && disruptionFix.length > 0) {
      applySeq(cubies, disruptionFix);
      applied.push(...disruptionFix);
    }
  }
  return applied;
}

function chosenTypeFromTrace(trace: TraceEntry[]): "DISRUPT" | "SETUP" | "REPAIR" | "CCR" | "none" {
  for (const t of trace) {
    if (t.label === "recovery-repair-short-circuit" || t.label === "recovery-applied") {
      const detail = t.detail ?? "";
      if (detail.includes("CCR가") || detail.includes("Clean-Cycle Resolution")) return "CCR";
      if (detail.includes("REPAIR가") || detail.includes("구조적 Cycle 해결")) return "REPAIR";
      if (detail.includes("확장 Disruption") || detail.includes("가벼운 Disruption")) return "DISRUPT";
      if (detail.includes("Multi-ply Setup")) return "SETUP";
    }
  }
  return "none";
}

export interface GroundTruth {
  hash: string;
  cycleLength: number;
  conflictEdgeCount: number;
  ccrGateEligible: boolean;
  ccrDeferredRejected: boolean;
  ccrProbeSucceeded: boolean;
  repairProbeSucceeded: boolean;
  ccrRemainingBudgetMs: number;
}

export function computeGroundTruth(snapshots: readonly FailureSnapshot[], lib: WingLibrary): Map<string, GroundTruth> {
  const map = new Map<string, GroundTruth>();
  for (const s of snapshots) {
    const original = deserializeCube(s.cubeState);
    const gate = analyzeCcrGate(original);
    const ccrDeadline = Date.now() + CALL_DEADLINE_MS;
    const ccrProbe = runCCRPrototype(original, lib, ccrDeadline, "singleCycle");
    const ccrRemainingBudgetMs = gate.eligible ? Math.max(0, ccrDeadline - Date.now()) : 0;
    const repairProbe = runSuccessV2(original, lib, Date.now() + CALL_DEADLINE_MS, W2_WIDER_HOP);
    map.set(s.hash, {
      hash: s.hash,
      cycleLength: gate.primaryCycleLength,
      conflictEdgeCount: gate.conflictEdgeCount,
      ccrGateEligible: gate.eligible,
      ccrDeferredRejected: ccrProbe.matched && !ccrProbe.moves,
      ccrProbeSucceeded: !!ccrProbe.moves,
      repairProbeSucceeded: !!repairProbe.moves,
      ccrRemainingBudgetMs,
    });
  }
  return map;
}

export interface PerSnapshotRunRecord {
  hash: string;
  wasExistingGap: boolean;
  cycleLength: number;
  conflictEdgeCount: number;
  ccrGateEligible: boolean;
  ccrDeferredRejected: boolean;
  ccrProbeSucceeded: boolean;
  repairProbeSucceeded: boolean;
  ccrRemainingBudgetMs: number;
  baselineChosenType: "DISRUPT" | "SETUP" | "REPAIR" | "CCR" | "none";
  baselineSucceeded: boolean;
  baselineRegressed: boolean;
  candidateChosenType: "DISRUPT" | "SETUP" | "REPAIR" | "CCR" | "none";
  candidateSucceeded: boolean;
  candidateRegressed: boolean;
  candidateTimeMs: number;
  baselineTimeMs: number;
}

export type RunRecord = PerSnapshotRunRecord[];

export function collectRun(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, groundTruth: ReadonlyMap<string, GroundTruth>): RunRecord {
  return snapshots.map((s) => {
    const original = deserializeCube(s.cubeState);
    const wrongBefore = wrongWingCount5(original);
    const gt = groundTruth.get(s.hash)!;
    const primitiveSuccess = testAllAllowedSingleShot(original, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
    const wasExistingGap = (Object.keys(primitiveSuccess) as AllowedPrimitive[]).every((p) => !primitiveSuccess[p]);

    const baselineClone = cloneCubies(original);
    const baselineStart = Date.now();
    const baselineTrace: TraceEntry[] = [];
    const baselineMoves = attemptRecovery(
      baselineClone,
      libs,
      Date.now() + CALL_DEADLINE_MS,
      DEFAULT_EVALUATOR_WEIGHTS,
      (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline),
      baselineTrace,
      true,
      true,
      "reservedBudget",
      false // includeCCR=false -- Baseline: Production Recovery WITHOUT CCR
    );
    const baselineTimeMs = Date.now() - baselineStart;
    const baselineAfter = baselineMoves.length > 0 ? wrongWingCount5(baselineClone) : wrongBefore;

    const candidateClone = cloneCubies(original);
    const candidateStart = Date.now();
    const candidateTrace: TraceEntry[] = [];
    const candidateMoves = attemptRecovery(
      candidateClone,
      libs,
      Date.now() + CALL_DEADLINE_MS,
      DEFAULT_EVALUATOR_WEIGHTS,
      (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline),
      candidateTrace,
      true,
      true,
      "reservedBudget",
      true // includeCCR=true -- Candidate: Production Recovery + CCR
    );
    const candidateTimeMs = Date.now() - candidateStart;
    const candidateAfter = candidateMoves.length > 0 ? wrongWingCount5(candidateClone) : wrongBefore;

    return {
      hash: s.hash,
      wasExistingGap,
      cycleLength: gt.cycleLength,
      conflictEdgeCount: gt.conflictEdgeCount,
      ccrGateEligible: gt.ccrGateEligible,
      ccrDeferredRejected: gt.ccrDeferredRejected,
      ccrProbeSucceeded: gt.ccrProbeSucceeded,
      repairProbeSucceeded: gt.repairProbeSucceeded,
      ccrRemainingBudgetMs: gt.ccrRemainingBudgetMs,
      baselineChosenType: chosenTypeFromTrace(baselineTrace),
      baselineSucceeded: baselineAfter < wrongBefore,
      baselineRegressed: baselineAfter > wrongBefore,
      candidateChosenType: chosenTypeFromTrace(candidateTrace),
      candidateSucceeded: candidateAfter < wrongBefore,
      candidateRegressed: candidateAfter > wrongBefore,
      candidateTimeMs,
      baselineTimeMs,
    };
  });
}

export function collectMultipleRuns(
  snapshots: readonly FailureSnapshot[],
  libs: ExecutorLibraries,
  groundTruth: ReadonlyMap<string, GroundTruth>,
  times: number,
): RunRecord[] {
  const runs: RunRecord[] = [];
  for (let i = 0; i < times; i++) runs.push(collectRun(snapshots, libs, groundTruth));
  return runs;
}
