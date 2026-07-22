// --- StageInstrumentedMirror (Solver System Bottleneck Attribution
// Sprint v1) -----------------------------------------------------------------
// READ-ONLY analysis Sprint -- zero Production code changes. This module is
// a byte-identical mirror of the real, unmodified runPrimaryPipeline()
// (fiveByFiveEdgeExecutor.ts, private) / executeTask() (same file, exported,
// called here unchanged for the top-level entry) / attemptRecovery()
// (fiveByFiveEdgeRecovery.ts, exported) / solve() (fiveByFiveEdgeSolverEngine.ts)
// control flow -- reusing every real exported function UNMODIFIED
// (tryFlipWingsInPlace/tryFixWing/tryExactCaseMatch/bestFixOverall/
// tryEndgameMultiPly/tryEndgameThroughDisruption/generateRecoveryStrategies/
// chooseBestRecovery/planEdgeTasks), wrapping each real sub-stage call with
// Date.now() timing. This is the same "byte-identical mirror" pattern used
// throughout this whole research arc (e.g. Incremental Recovery Blueprint
// Sprint v1's own PairFailurePopulationAnalysis.ts) -- required here because
// solve()'s own public API doesn't expose per-stage timing, and this
// Sprint's own protected-file rule forbids adding instrumentation INSIDE
// Executor.ts/Recovery.ts/fiveByFiveEdges.ts themselves.
//
// generateRecoveryStrategies (fiveByFiveEdgeRecovery.ts) already has an
// EXISTING, real, previously-added `onEvent` instrumentation hook (added by
// Integration Refinement Sprint v1, documented as "no-op for every real
// caller") -- this Sprint reuses that EXISTING hook read-only (passing a
// callback, not modifying the function) to get exact start/end timing for
// each of DISRUPT1/DISRUPT2/SETUP/REPAIR/CCR, rather than needing to mirror
// generateRecoveryStrategies' own body.
//
// Stage taxonomy (matches the REAL code structure exactly, not the work
// order's illustrative example names):
//   FLIP, PAIR, PARITY                          -- runPrimaryPipeline branches
//   ENDGAME_BESTFIX, ENDGAME_MULTIPLY, ENDGAME_DISRUPTION -- runPrimaryPipeline's ENDGAME branch
//   RECOVERY_DISRUPT1, RECOVERY_DISRUPT2, RECOVERY_SETUP,
//   RECOVERY_REPAIR, RECOVERY_CCR                -- generateRecoveryStrategies' 5 candidate generators
//   RECOVERY_RETRY                                -- attemptRecovery's retryTask call (itself a nested runPrimaryPipeline)
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import {
  applySeq,
  bestFixOverall,
  ENDGAME_MULTIPLY_THRESHOLD,
  tryEndgameMultiPly,
  tryEndgameThroughDisruption,
  tryExactCaseMatch,
  tryFixWing,
  tryFlipWingsInPlace,
  wrongWingCount5,
  wrongWings5,
  type Move,
} from "../fiveByFiveEdges";
import { analyzeEdgeSlots } from "../fiveByFiveHumanEdges";
import type { SolveTask, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { slotKeyForIndex, planEdgeTasks } from "../fiveByFiveEdgePlanner";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import {
  generateRecoveryStrategies,
  chooseBestRecovery,
  RECOVERY_GEN_BUDGET_MS,
  RECOVERY_RETRY_BUDGET_MS,
  MAX_RECOVERY_RETRIES,
  type SchedulingEvent,
} from "../fiveByFiveEdgeRecovery";
import { computeEdgeSolverStateHash } from "../fiveByFiveEdgeStateHash";
import { DEFAULT_EVALUATOR_WEIGHTS, type EvaluatorWeights } from "../fiveByFiveEdgeEvaluator";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";

export type StageName =
  | "FLIP"
  | "PAIR"
  | "PARITY"
  | "ENDGAME_BESTFIX"
  | "ENDGAME_MULTIPLY"
  | "ENDGAME_DISRUPTION"
  | "RECOVERY_DISRUPT1"
  | "RECOVERY_DISRUPT2"
  | "RECOVERY_SETUP"
  | "RECOVERY_REPAIR"
  | "RECOVERY_CCR"
  | "RECOVERY_RETRY";

export interface StageEvent {
  hash: string;
  taskId: number;
  taskType: string;
  stage: StageName;
  runtimeMs: number;
}

// Mirrors fiveByFiveEdgeExecutor.ts's own TASK_LOCAL_BUDGET_MS/FIXED_BUDGET_MS
// exactly (private constants there, so this Sprint's own read-only mirror
// re-declares the same values with a citation rather than exporting them
// from the protected file, per this Sprint's own "read-only" scope).
const TASK_LOCAL_BUDGET_MS = 120;
const FIXED_BUDGET_MS = 140;
const RECOVERY_RESERVE_MS = RECOVERY_GEN_BUDGET_MS + MAX_RECOVERY_RETRIES * RECOVERY_RETRY_BUDGET_MS;

function wrongWingsInSlot(cubies: Cubie[], slot: string): Cubie[] {
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const stats = analyzeEdgeSlots(cubies).find((s) => s.slot === slot);
  if (!stats) return [];
  return stats.wings.filter((w) => wrongIds.has(w.id));
}

function time<T>(fn: () => T): { result: T; runtimeMs: number } {
  const start = Date.now();
  const result = fn();
  return { result, runtimeMs: Date.now() - start };
}

/** Byte-identical mirror of runPrimaryPipeline(), instrumented. `pairBudgetMs` defaults to FIXED_BUDGET_MS (real production value); STEP2's Budget Savings Flow passes `undefined` explicitly to reconstruct the pre-Integration-Sprint counterfactual. */
export function mirrorRunPrimaryPipeline(
  hash: string,
  cubies: Cubie[],
  task: SolveTask,
  libs: ExecutorLibraries,
  deadline: number,
  events: StageEvent[],
  pairBudgetMs: number | undefined = FIXED_BUDGET_MS
): Move[] {
  const { lib, flipLib, caseLib } = libs;
  const before = wrongWingCount5(cubies);
  const localDeadline = Math.min(deadline, Date.now() + TASK_LOCAL_BUDGET_MS);
  const push = (stage: StageName, runtimeMs: number) => events.push({ hash, taskId: task.id, taskType: task.type, stage, runtimeMs });

  if (task.type === "FLIP" || task.type === "PAIR") {
    const slot = task.targetEdge >= 0 ? slotKeyForIndex(task.targetEdge) : null;
    if (!slot) return [];
    let flipMs = 0;
    let flipResult: Move[] | null = null;
    for (const w of wrongWingsInSlot(cubies, slot)) {
      if (Date.now() > localDeadline) break;
      const { result, runtimeMs } = time(() => tryFlipWingsInPlace(cubies, w, flipLib, before));
      flipMs += runtimeMs;
      if (result && result.length > 0) {
        flipResult = result;
        break;
      }
    }
    push("FLIP", flipMs);
    if (flipResult) {
      applySeq(cubies, flipResult);
      return flipResult;
    }

    if (task.type === "PAIR") {
      let pairMs = 0;
      let pairResult: Move[] | null = null;
      for (const w of wrongWingsInSlot(cubies, slot)) {
        if (Date.now() > localDeadline) break;
        const { result, runtimeMs } = time(() => tryFixWing(cubies, w, lib, localDeadline, pairBudgetMs));
        pairMs += runtimeMs;
        if (result && result.length > 0) {
          pairResult = result;
          break;
        }
      }
      push("PAIR", pairMs);
      if (pairResult) {
        applySeq(cubies, pairResult);
        return pairResult;
      }
    }
    return [];
  }

  if (task.type === "PARITY") {
    const { result: fix, runtimeMs } = time(() => tryExactCaseMatch(cubies, caseLib, deadline));
    push("PARITY", runtimeMs);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      return fix;
    }
    return [];
  }

  // ENDGAME
  const applied: Move[] = [];
  let guard = 0;
  let bestFixMs = 0;
  let multiplyMs = 0;
  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline && guard < 50) {
    guard++;
    const { result: fix, runtimeMs: fixMs } = time(() => bestFixOverall(cubies, lib, flipLib, deadline));
    bestFixMs += fixMs;
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      applied.push(...fix);
      continue;
    }
    if (wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD) {
      const { result: endgameFix, runtimeMs: multMs } = time(() => tryEndgameMultiPly(cubies, lib, flipLib, deadline));
      multiplyMs += multMs;
      if (endgameFix && endgameFix.length > 0) {
        applySeq(cubies, endgameFix);
        applied.push(...endgameFix);
        continue;
      }
    }
    break;
  }
  push("ENDGAME_BESTFIX", bestFixMs);
  push("ENDGAME_MULTIPLY", multiplyMs);
  if (wrongWingCount5(cubies) > 0 && wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD && Date.now() < deadline) {
    const { result: disruptionFix, runtimeMs: disMs } = time(() =>
      tryEndgameThroughDisruption(cubies, lib, flipLib, deadline, undefined, undefined, caseLib)
    );
    push("ENDGAME_DISRUPTION", disMs);
    if (disruptionFix && disruptionFix.length > 0) {
      applySeq(cubies, disruptionFix);
      applied.push(...disruptionFix);
    }
  }
  return applied;
}

/** Byte-identical mirror of attemptRecovery(), instrumented via generateRecoveryStrategies' own existing onEvent hook. */
export function mirrorAttemptRecovery(
  hash: string,
  cubies: Cubie[],
  task: SolveTask,
  libs: ExecutorLibraries,
  deadline: number,
  weights: EvaluatorWeights,
  events: StageEvent[],
  pairBudgetMs: number | undefined = FIXED_BUDGET_MS
): Move[] {
  const push = (stage: StageName, runtimeMs: number) => events.push({ hash, taskId: task.id, taskType: task.type, stage, runtimeMs });
  const visited = new Set<number>();
  visited.add(computeEdgeSolverStateHash(cubies));
  const originalBaseline = wrongWingCount5(cubies);
  const scratch = cloneCubies(cubies);
  const applied: Move[] = [];

  for (let round = 0; round < MAX_RECOVERY_RETRIES; round++) {
    if (Date.now() > deadline) break;

    // Positional disambiguation: real production order (schedulingStrategy
    // "reservedBudget", the default) is [DISRUPT1, DISRUPT2, SETUP, REPAIR,
    // CCR] -- generateRecoveryStrategies' own onEvent fires "DISRUPT" for
    // BOTH disrupt candidates (same candidateType label), so the Nth
    // "start" event of type DISRUPT is disambiguated by occurrence order.
    const starts = new Map<string, number>();
    let disruptOccurrence = 0;
    const onEvent = (e: SchedulingEvent) => {
      if (e.phase !== "start") {
        let stage: StageName;
        if (e.candidateType === "DISRUPT") stage = disruptOccurrence === 1 ? "RECOVERY_DISRUPT1" : "RECOVERY_DISRUPT2";
        else if (e.candidateType === "SETUP") stage = "RECOVERY_SETUP";
        else if (e.candidateType === "REPAIR") stage = "RECOVERY_REPAIR";
        else stage = "RECOVERY_CCR";
        const startKey = `${e.candidateType}:${disruptOccurrence}`;
        const startAt = starts.get(startKey) ?? e.atMs;
        push(stage, e.atMs - startAt);
        return;
      }
      if (e.candidateType === "DISRUPT") disruptOccurrence++;
      starts.set(`${e.candidateType}:${disruptOccurrence}`, e.atMs);
    };

    const candidates = generateRecoveryStrategies(scratch, libs, deadline, weights, true, "reservedBudget", onEvent, true);
    if (candidates.length === 0) break;

    const best = chooseBestRecovery(candidates);
    if (!best) break;

    const probe = cloneCubies(scratch);
    applySeq(probe, best.moves);
    const probeHash = computeEdgeSolverStateHash(probe);
    if (visited.has(probeHash)) break;
    visited.add(probeHash);

    applySeq(scratch, best.moves);
    applied.push(...best.moves);
    const afterDisrupt = wrongWingCount5(scratch);

    if ((best.type === "REPAIR" || best.type === "CCR") && afterDisrupt < originalBaseline) {
      applySeq(cubies, applied);
      return applied;
    }

    const retryDeadline = Math.min(deadline, Date.now() + RECOVERY_RETRY_BUDGET_MS);
    const { result: retryMoves, runtimeMs: retryMs } = time(() => mirrorRunPrimaryPipeline(hash, scratch, task, libs, retryDeadline, events, pairBudgetMs));
    push("RECOVERY_RETRY", retryMs);
    if (retryMoves.length > 0) {
      applied.push(...retryMoves);
      const finalWrong = wrongWingCount5(scratch);
      if (finalWrong < originalBaseline) {
        applySeq(cubies, applied);
        return applied;
      }
      continue;
    }
  }
  return [];
}

/** Byte-identical mirror of executeTask(allowRecovery=true), instrumented. */
export function mirrorExecuteTask(
  hash: string,
  cubies: Cubie[],
  task: SolveTask,
  libs: ExecutorLibraries,
  deadline: number,
  weights: EvaluatorWeights,
  events: StageEvent[],
  pairBudgetMs: number | undefined = FIXED_BUDGET_MS
): Move[] {
  const recoveryEligible = task.type === "ENDGAME";
  const primaryDeadline = recoveryEligible ? Math.max(Date.now(), deadline - RECOVERY_RESERVE_MS) : deadline;
  const primary = mirrorRunPrimaryPipeline(hash, cubies, task, libs, primaryDeadline, events, pairBudgetMs);
  if (primary.length > 0) return primary;

  if (!recoveryEligible || Date.now() > deadline) return [];

  return mirrorAttemptRecovery(hash, cubies, task, libs, deadline, weights, events, pairBudgetMs);
}

export interface MirrorSolveWithStagesResult {
  wrongWingBefore: number;
  wrongWingAfter: number;
  moveCount: number;
  tasksCompleted: number;
  events: StageEvent[];
}

/** Byte-identical mirror of FiveByFiveEdgeSolverEngine.solve()'s own loop, instrumented per-stage. `pairBudgetMs` defaults to FIXED_BUDGET_MS (real production); STEP2 passes `undefined` for the pre-Integration-Sprint counterfactual arm. */
export function mirrorSolveWithStages(
  hash: string,
  cubies: Cubie[],
  libs: ExecutorLibraries,
  pairBudgetMs: number | undefined = FIXED_BUDGET_MS
): MirrorSolveWithStagesResult {
  const working = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(working);
  const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);

  const events: StageEvent[] = [];
  const moveQueue: Move[] = [];
  let tasksCompleted = 0;

  for (const task of tasks) {
    if (Date.now() > deadline) break;
    if (wrongWingCount5(working) === 0) break;
    const moves = mirrorExecuteTask(hash, working, task, libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, events, pairBudgetMs);
    if (moves.length > 0) {
      moveQueue.push(...moves);
      tasksCompleted++;
    }
  }

  return {
    wrongWingBefore,
    wrongWingAfter: wrongWingCount5(working),
    moveCount: moveQueue.length,
    tasksCompleted,
    events,
  };
}

export type { TraceEntry };
