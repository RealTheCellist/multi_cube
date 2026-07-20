// --- Executor (Architecture Spec v2.0 section 11) --------------------------
// Turns ONE already-chosen SolveTask into real Move[], using ONLY the
// existing, untouched fiveByFiveEdges.ts/fiveByFiveHumanEdges.ts library
// (BASE_ALG/FLIP_ALG/PARITY_ALG rotations, the case library, tryFixWing's
// setup search, bestFixOverall's grinder) -- no new algorithms. The Executor
// never decides WHICH task to run (that's the Planner's job); it just does
// the one it's handed as well as the current library can, within whatever
// slice of the overall deadline is left.
import type { Cubie } from "./cubeState";
import { cloneCubies } from "./cubeState";
import {
  applySeq,
  bestFixOverall,
  type CaseEntry,
  ENDGAME_MULTIPLY_THRESHOLD,
  tryEndgameMultiPly,
  tryEndgameThroughDisruption,
  tryExactCaseMatch,
  tryFixWing,
  tryFlipWingsInPlace,
  wrongWingCount5,
  wrongWings5,
  type WingLibrary,
} from "./fiveByFiveEdges";
import { analyzeEdgeSlots } from "./fiveByFiveHumanEdges";
import type { Move } from "./fiveByFiveEdges";
import type { SolveTask, TraceEntry } from "./fiveByFiveEdgeSolverTypes";
import { slotKeyForIndex } from "./fiveByFiveEdgePlanner";
import { attemptRecovery, MAX_RECOVERY_RETRIES, RECOVERY_GEN_BUDGET_MS, RECOVERY_RETRY_BUDGET_MS, type SchedulingStrategy } from "./fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS, type EvaluatorWeights } from "./fiveByFiveEdgeEvaluator";

// The ordinary ENDGAME pipeline below loops on `Date.now() < deadline`, so
// left unchecked it naturally consumes the ENTIRE remaining deadline before
// ever giving up -- which means by the time it returns [] (no progress),
// there is never any time left for Recovery to run at all (measured
// directly: 0 "recovery-triggered" events across 144 solve() calls before
// this reservation existed). Reserving this slice up front -- the same
// generate+retry budget Recovery itself is capped to in
// fiveByFiveEdgeRecovery.ts -- guarantees Recovery actually gets a turn
// whenever the ordinary pipeline stalls, mirroring the same
// deadline-splitting pattern PAIR/FLIP already use via TASK_LOCAL_BUDGET_MS.
const RECOVERY_RESERVE_MS = RECOVERY_GEN_BUDGET_MS + MAX_RECOVERY_RETRIES * RECOVERY_RETRY_BUDGET_MS;

export interface ExecutorLibraries {
  lib: WingLibrary;
  flipLib: Map<string, Move[]>;
  caseLib: readonly CaseEntry[];
}

function wrongWingsInSlot(cubies: Cubie[], slot: string): Cubie[] {
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const stats = analyzeEdgeSlots(cubies).find((s) => s.slot === slot);
  if (!stats) return [];
  return stats.wings.filter((w) => wrongIds.has(w.id));
}

// tryFixWing's own setup-search BFS can run for a genuinely long time on a
// single wrong wing before giving up (it only checks the deadline it's
// GIVEN, not any smaller budget of its own -- see fiveByFiveEdges.ts). Since
// the whole plan's time budget is only ~1 second (see PLAN_TIME_BUDGET_MS in
// fiveByFiveEdgeSolverEngine.ts), passing the FULL remaining deadline into
// the very first task's tryFixWing call risked exactly what it was measured
// to do here: one stuck wing consuming the ENTIRE budget before any task
// completes, leaving a plan with ZERO moves even though plenty of easier
// tasks were queued right behind it. Capped the same way
// fiveByFiveHumanEdges.ts's own generateEdgeGoals already caps its priority
// pass (PRIORITY_PASS_BUDGET_MS) for the identical reason.
const TASK_LOCAL_BUDGET_MS = 120;

/**
 * The ORIGINAL Architecture Spec v2.0 pipeline (BASE/FLIP -> CASE/PARITY ->
 * ENDGAME grinder), extracted unchanged out of executeTask so the Adaptive
 * Executor v2 Recovery layer (see fiveByFiveEdgeRecovery.ts) can call this
 * exact same logic again as its own Retry step (spec section 10: "Recovery
 * 후 원래 Task를 다시 시도한다") without duplicating it.
 */
function runPrimaryPipeline(cubies: Cubie[], task: SolveTask, libs: ExecutorLibraries, deadline: number): Move[] {
  const { lib, flipLib, caseLib } = libs;
  const before = wrongWingCount5(cubies);
  const localDeadline = Math.min(deadline, Date.now() + TASK_LOCAL_BUDGET_MS);

  if (task.type === "FLIP" || task.type === "PAIR") {
    const slot = task.targetEdge >= 0 ? slotKeyForIndex(task.targetEdge) : null;
    if (!slot) return [];
    for (const w of wrongWingsInSlot(cubies, slot)) {
      if (Date.now() > localDeadline) break;
      const flipFix = tryFlipWingsInPlace(cubies, w, flipLib, before);
      if (flipFix && flipFix.length > 0) {
        applySeq(cubies, flipFix);
        return flipFix;
      }
    }
    if (task.type === "PAIR") {
      for (const w of wrongWingsInSlot(cubies, slot)) {
        if (Date.now() > localDeadline) break;
        const fix = tryFixWing(cubies, w, lib, localDeadline);
        if (fix && fix.length > 0) {
          applySeq(cubies, fix);
          return fix;
        }
      }
    }
    return [];
  }

  if (task.type === "PARITY") {
    const fix = tryExactCaseMatch(cubies, caseLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      return fix;
    }
    return [];
  }

  // ENDGAME: the general-purpose grinder, in increasing cost order --
  // deliberately does NOT include the full random kick loop
  // (solveEdgePairingHumanStyle's own) here: that loop's whole value is
  // running MANY iterations, which the ~1s total plan budget (see
  // fiveByFiveEdgeSolverEngine.ts) essentially never has room for. What's
  // left (bestFixOverall, tryEndgameMultiPly, one through-disruption
  // attempt) are all single-shot and bounded by the same deadline.
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

/**
 * Executes a single task against `cubies` IN PLACE (mutates, same
 * convention as applySeq elsewhere), returning the Move[] it applied (empty
 * if the library couldn't make progress on this task within `deadline`).
 *
 * `allowRecovery` (Adaptive Executor v2) defaults to false and must be
 * explicitly opted into by the caller. This is deliberate: Planner v2's
 * simulateStrategy also calls executeTask (as its own black-box preview
 * step, never touching Library directly) under a very tight, carefully
 * fair-shared time budget whose own determinism guarantee ("동일한 Cube는
 * 항상 동일한 Strategy를 선택한다") was fixed once already this session by
 * removing exactly this kind of timing-jitter-sensitive branch. Recovery's
 * own candidate search (tryEndgameThroughDisruption/tryEndgameMultiPly) is
 * inherently timing-jitter-sensitive (it shuffles and stops whenever its
 * slice of the clock runs out), so letting it run inside Planner's
 * simulation could reintroduce that class of bug. Recovery is therefore
 * wired in ONLY at the real, single, top-level execution call
 * (fiveByFiveEdgeSolverEngine.ts's solve() loop passes true), never through
 * Planner's simulation path, which is left completely untouched.
 *
 * Recovery is further scoped to ENDGAME tasks only: PAIR/FLIP/PARITY each
 * already run under a deliberately tiny TASK_LOCAL_BUDGET_MS (120ms)
 * specifically to prevent one stuck task from consuming the whole plan's
 * budget (a real bug this session already hit and fixed once). Recovery's
 * own generate+retry budgets would blow straight through that 120ms cap if
 * allowed there, reintroducing the same failure mode. ENDGAME already had
 * room for exactly this kind of expensive fallback search (it already ran
 * one unconditional tryEndgameThroughDisruption attempt before this
 * upgrade), so that's the only task type Recovery applies to.
 */
export function executeTask(
  cubies: Cubie[],
  task: SolveTask,
  libs: ExecutorLibraries,
  deadline: number,
  trace?: TraceEntry[],
  allowRecovery = false,
  weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS,
  // Integration Prototype Sprint v1: pass-through to attemptRecovery, see
  // fiveByFiveEdgeRecovery.ts's own comments on each. Both default to the
  // real production behavior (REPAIR included, short-circuited); the
  // Integration Benchmark passes non-default values to reconstruct
  // counterfactual behavior for comparison, never product callers.
  includeRepair = true,
  shortCircuitRepair = true,
  // Integration Refinement Sprint v1: pass-through to attemptRecovery, see
  // fiveByFiveEdgeRecovery.ts's SchedulingStrategy comment. Defaults to
  // "baseline" -- unchanged production behavior; the Refinement Sprint's
  // own benchmark code passes "priorityGate"/"reservedBudget" to compare,
  // never product callers.
  schedulingStrategy: SchedulingStrategy = "baseline"
): Move[] {
  const recoveryEligible = allowRecovery && task.type === "ENDGAME";
  // Reserve RECOVERY_RESERVE_MS off the END of the deadline for the primary
  // pipeline's own attempt -- see RECOVERY_RESERVE_MS's comment above for
  // why this reservation is required for Recovery to ever get a turn.
  const primaryDeadline = recoveryEligible ? Math.max(Date.now(), deadline - RECOVERY_RESERVE_MS) : deadline;
  const primary = runPrimaryPipeline(cubies, task, libs, primaryDeadline);
  if (primary.length > 0) return primary;

  if (!recoveryEligible || Date.now() > deadline) return [];

  trace?.push({ at: Date.now(), label: "recovery-triggered", detail: `${task.type} 기본 파이프라인 실패 -- Recovery 시도` });
  return attemptRecovery(
    cubies,
    libs,
    deadline,
    weights,
    (working, taskDeadline) => runPrimaryPipeline(working, task, libs, taskDeadline),
    trace,
    includeRepair,
    shortCircuitRepair,
    schedulingStrategy
  );
}

/** Pure-preview variant: same as executeTask, but against a scratch clone,
 * leaving `cubies` untouched -- used by the Planner/Evaluator if a task's
 * OWN estimated outcome is ever needed without committing to it. */
export function previewTask(cubies: Cubie[], task: SolveTask, libs: ExecutorLibraries, deadline: number): { moves: Move[]; result: Cubie[] } {
  const clone = cloneCubies(cubies);
  const moves = executeTask(clone, task, libs, deadline);
  return { moves, result: clone };
}
