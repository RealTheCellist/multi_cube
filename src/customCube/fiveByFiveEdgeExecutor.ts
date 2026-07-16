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
import type { SolveTask } from "./fiveByFiveEdgeSolverTypes";
import { slotKeyForIndex } from "./fiveByFiveEdgePlanner";

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
 * Executes a single task against `cubies` IN PLACE (mutates, same
 * convention as applySeq elsewhere), returning the Move[] it applied (empty
 * if the library couldn't make progress on this task within `deadline`).
 */
export function executeTask(cubies: Cubie[], task: SolveTask, libs: ExecutorLibraries, deadline: number): Move[] {
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

/** Pure-preview variant: same as executeTask, but against a scratch clone,
 * leaving `cubies` untouched -- used by the Planner/Evaluator if a task's
 * OWN estimated outcome is ever needed without committing to it. */
export function previewTask(cubies: Cubie[], task: SolveTask, libs: ExecutorLibraries, deadline: number): { moves: Move[]; result: Cubie[] } {
  const clone = cloneCubies(cubies);
  const moves = executeTask(clone, task, libs, deadline);
  return { moves, result: clone };
}
