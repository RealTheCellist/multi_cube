// --- GoalIntegration (Solver Integration Sprint v1) --------------------------
// Browser-safe runtime module -- NO `fs` import anywhere in this file or its
// dependencies (GoalAnalyzer.ts, GoalState.ts, GoalDescriptor.ts, and the
// generated EligibleGoals.generated.ts are all fs-free), so this is safe to
// import from fiveByFiveEdgeSolverEngine.ts, which IS bundled into the
// browser app. Never import GoalPlanner.ts/GoalReplay.ts/GoalDatabase.ts
// from here or from SolverEngine -- those pull in `node:fs` via
// failureDatabase.ts and will break the browser build.
//
// This is the ONLY place a Goal Candidate is actually "applied" against a
// live cube: it replays a Goal's `primitiveSequence` as a portable STRATEGY
// (see GoalAnalyzer.ts's runPrimitiveChain), never the candidate's literal
// recorded moves, and only commits the attempt if it both (a) completes
// every step and (b) produces a REAL, verified WrongWing improvement on
// THIS specific state right now -- the offline reliability gate (section 6)
// only decides which Goals are worth trying at all, it does not guarantee
// any single live attempt will succeed.
import { cloneCubies, type Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { runPrimitiveChain } from "./GoalAnalyzer";
import { ELIGIBLE_GOALS } from "./EligibleGoals.generated";
import type { PortableGoal } from "./GoalDescriptor";

export interface GoalIntegrationResult {
  applied: boolean;
  goalId?: string;
  primitivesUsed?: readonly string[];
  wrongWingBefore?: number;
  wrongWingAfter?: number;
}

/** How much wall-clock time a single Goal attempt (one candidate's whole
 * primitiveSequence chain) is allowed before giving up on it and moving to
 * the next-priority ELIGIBLE Goal. */
const PER_GOAL_ATTEMPT_BUDGET_MS = 120;

/**
 * Tries every ELIGIBLE_GOALS entry (already priority-sorted offline per
 * spec section 5: WrongWing 감소량 > Pair 증가량 > Replay 성공률 > Move 수)
 * against `cubies`, in order, until one both completes its full primitive
 * chain AND genuinely reduces wrongWingCount on THIS live attempt (spec
 * section 6's "Expected WrongWing 감소 > 0", checked for real, not assumed
 * from the offline stats alone). The first one that qualifies is committed
 * (mutates `cubies` in place); `cubies` is left untouched if none qualify
 * within `deadline`.
 */
export function tryApplyBestEligibleGoal(cubies: Cubie[], libs: ExecutorLibraries, deadline: number, trace?: TraceEntry[]): GoalIntegrationResult {
  if (ELIGIBLE_GOALS.length === 0) {
    trace?.push({ at: Date.now(), label: "goal-none-eligible", detail: "ELIGIBLE_GOALS 비어 있음 -- section 6 게이트를 통과한 Goal 없음" });
    return { applied: false };
  }

  const wrongWingBefore = wrongWingCount5(cubies);
  trace?.push({ at: Date.now(), label: "goal-search", detail: `ELIGIBLE Goal ${ELIGIBLE_GOALS.length}개 중 시도 시작 (현재 wrongWing=${wrongWingBefore})` });

  for (const goal of ELIGIBLE_GOALS as PortableGoal[]) {
    if (Date.now() > deadline) break;
    const attemptDeadline = Math.min(deadline, Date.now() + PER_GOAL_ATTEMPT_BUDGET_MS);
    const clone = cloneCubies(cubies);
    const perStepDeadlineMs = Math.max(10, attemptDeadline - Date.now());
    const result = runPrimitiveChain(clone, goal.primitiveSequence, libs, perStepDeadlineMs);

    trace?.push({
      at: Date.now(),
      label: "goal-attempt",
      detail: `Goal ${goal.id} [${goal.primitiveSequence.join(">")}] -- completed=${result.completed}, wrongWing ${result.wrongWingBefore}->${result.wrongWingAfter}`,
    });

    if (result.completed && result.wrongWingAfter < result.wrongWingBefore) {
      // Commit: copy the clone's mutated fields back into the real array
      // in place (matching applySeq's own mutate-in-place convention).
      for (let i = 0; i < cubies.length; i++) {
        cubies[i].position.copy(clone[i].position);
        cubies[i].orientation.copy(clone[i].orientation);
      }
      trace?.push({
        at: Date.now(),
        label: "goal-applied",
        detail: `Goal ${goal.id} 적용 -- wrongWing ${result.wrongWingBefore} -> ${result.wrongWingAfter}`,
      });
      return {
        applied: true,
        goalId: goal.id,
        primitivesUsed: goal.primitiveSequence,
        wrongWingBefore: result.wrongWingBefore,
        wrongWingAfter: result.wrongWingAfter,
      };
    }
  }

  trace?.push({ at: Date.now(), label: "goal-no-improvement", detail: "ELIGIBLE Goal 전부 시도했으나 이 상태에서는 개선 없음" });
  return { applied: false };
}
