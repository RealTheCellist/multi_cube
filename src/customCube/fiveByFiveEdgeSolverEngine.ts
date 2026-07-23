// --- SolverEngine (Architecture Spec v2.0 section 7) ------------------------
// Top-level entry point: owns the Plan Cache and Move Queue, and is the only
// module the UI ever talks to (spec section 20 -- "UI는 Solver 내부를 알지
// 못한다"). Wires Planner (strategy) + Executor (move generation against the
// existing, untouched library) + Trace (why every choice was made) together
// behind solve()/nextMove()/invalidatePlan()/hasValidPlan()/currentPlan().
//
// Whole-plan time budget: the user explicitly chose "under 1 second" for
// how long computing the COMPLETE edge-pairing plan may take (not per
// move -- the entire plan, every task, up front), accepting that this is
// far tighter than the ~45s-100s budgets the existing solveEdgePairingHumanStyle
// uses for genuinely hard scrambles (this session's own extensive
// measurements -- see the parity-gap investigation -- established that some
// residuals need that much search just to make partial progress, let alone
// finish). A 1-second cap means hard scrambles will more often produce an
// INCOMPLETE plan than the older, much-slower solver did; SolvePlan.score
// reflects exactly how much was actually resolved, and the UI is expected to
// surface that honestly (see App.tsx's existing "couldn't fully solve"
// messaging) rather than imply a guarantee this budget can't back up.
import type { Cubie } from "./cubeState";
import { cloneCubies } from "./cubeState";
import { applySeq, buildCaseLibrary, buildFlipLibrary, buildWingLibrary, wrongWingCount5 } from "./fiveByFiveEdges";
import type { Move } from "./fiveByFiveEdges";
import { computeEdgeSolverStateHash } from "./fiveByFiveEdgeStateHash";
import { planEdgeTasks } from "./fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import type { SolvePlan, SolveTask, TraceEntry } from "./fiveByFiveEdgeSolverTypes";
import type { EvaluatorWeights } from "./fiveByFiveEdgeEvaluator";

export const PLAN_TIME_BUDGET_MS = 1000;

// ENDGAME Optimization Prototype Sprint v1 (Blueprint Sprint v1's Final
// Operating Contract, STEP6): the real Saturation Curve's 500ms operating
// point (0.694 avg improvement, 562.4ms avg runtime -- Solver System
// Bottleneck Attribution Refinement Sprint v1's own measurement). Reserved
// off the OUTER solve() loop so ENDGAME's own primary attempt gets a
// guaranteed floor, protected from being consumed by earlier PAIR/FLIP/
// PARITY tasks -- the Reserved Slice budget policy variant. Not applied by
// default (existing behavior unchanged for every caller that doesn't pass
// `endgameReserveMs` explicitly); only this Sprint's own A/B benchmark
// exercises it.
export const ENDGAME_RESERVE_MS = 500;

/**
 * Pre-builds the wing/flip/case libraries (buildWingLibrary/buildFlipLibrary/
 * buildCaseLibrary are each cached at the module level in fiveByFiveEdges.ts,
 * so this is idempotent and near-free on every call after the first). Call
 * this once, eagerly, well before the user ever presses the solve button
 * (e.g. on app mount) -- the very first build measured ~1.3s in this
 * session's own testing, which would otherwise consume the ENTIRE 1-second
 * plan budget on whichever solve() call happens to run first, leaving no
 * time for the plan itself. solve() also builds them itself as a safety net
 * (so it still works correctly if warmup() was never called), but times its
 * own budget AFTER that build finishes specifically so a cold start doesn't
 * silently eat the budget without at least logging it.
 */
export function warmupFiveByFiveEdgeLibraries(): void {
  buildWingLibrary();
  buildFlipLibrary();
  buildCaseLibrary();
}

export class FiveByFiveEdgeSolverEngine {
  private plan: SolvePlan | null = null;
  // A snapshot of the cube exactly as it stood when solve() was called --
  // kept privately alongside the public SolvePlan (whose own stateHash
  // field is a single number, not enough by itself to re-derive "what
  // should the cube look like after N of the queue's moves") purely so
  // hasValidPlan can replay moveQueue[0..currentMove] and compare against
  // the LIVE cube, rather than only being able to check validity before
  // the very first move is consumed.
  private planStartCubies: Cubie[] | null = null;
  private trace: TraceEntry[] = [];

  private log(label: string, detail?: string): void {
    this.trace.push({ at: Date.now(), label, detail });
  }

  /** Every decision made while building the most recent plan, in order --
   * see spec section 17 (Debug Trace): every choice must be reproducible
   * from this log alone. */
  getTrace(): readonly TraceEntry[] {
    return this.trace;
  }

  /**
   * Builds ONE complete SolvePlan from the cube's current state and caches
   * it. Always returns a fully-formed plan (never a half-built one, per
   * spec section 18) -- if the time budget runs out before every task
   * finishes, the plan simply contains however many moves were actually
   * found, with `score` reflecting the real remaining wrongWingCount.
   */
  solve(
    cubies: Cubie[],
    weights?: EvaluatorWeights,
    // ENDGAME Optimization Prototype Sprint v1 -- Reserved Slice budget
    // policy variant. `undefined` (default) preserves exact current
    // behavior for every existing caller. When set, non-ENDGAME tasks
    // (PAIR/FLIP/PARITY) are capped to `deadline - endgameReserveMs`
    // instead of the full outer `deadline`, guaranteeing ENDGAME's own
    // primary attempt (queued last, per fiveByFiveEdgePlanner.ts) a
    // protected floor of real wall-clock time -- ONLY when an ENDGAME task
    // actually exists in this solve's own task list (no wasted reservation
    // on a plan that never reaches ENDGAME).
    endgameReserveMs?: number,
    // ENDGAME Optimization Prototype Sprint v1 -- Absorb budget policy
    // variant, threaded straight through to executeTask's own
    // recoveryReserveMsOverride. `undefined` (default) preserves exact
    // current behavior (RECOVERY_RESERVE_MS).
    recoveryReserveMsOverride?: number
  ): SolvePlan {
    this.trace = [];
    const startHash = computeEdgeSolverStateHash(cubies);

    // Built BEFORE the deadline starts ticking -- see warmupFiveByFiveEdgeLibraries's
    // own comment. Cached after the first call in the process, so this is a
    // real cost exactly once (logged, not silently absorbed into the plan
    // budget) and free every time after.
    const buildStart = Date.now();
    const lib = buildWingLibrary();
    const flipLib = buildFlipLibrary();
    const caseLib = buildCaseLibrary();
    const libs: ExecutorLibraries = { lib, flipLib, caseLib };
    const buildMs = Date.now() - buildStart;
    if (buildMs > 5) this.log("library-build", `최초 라이브러리 빌드 ${buildMs}ms (예산에 포함 안 됨)`);

    const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
    this.log("analyze", `초기 wrongWingCount=${wrongWingCount5(cubies)}`);

    // Budget split per the Planner v2 Upgrade spec: Planner (strategy
    // generation) + Simulation (previewing candidates) share a combined
    // 200ms slice up front, leaving the rest of PLAN_TIME_BUDGET_MS for the
    // REAL task-execution loop below (spec: Planner<=100ms, Simulation<=100ms,
    // Executor<=700ms, Trace<=50ms, slack 50ms -- summing to the same
    // 1000ms this file already budgeted as one lump before the upgrade).
    const working = cloneCubies(cubies);
    const planDeadline = Math.min(deadline, Date.now() + 200);
    const { tasks, trace: plannerTrace } = planEdgeTasks(working, libs, weights, planDeadline, deadline);
    this.trace.push(...plannerTrace);
    this.log("plan-tasks", `${tasks.length}개 태스크: ${tasks.map((t) => `${t.type}(${t.targetEdge})`).join(", ")}`);

    const moveQueue: Move[] = [];
    const completedTasks: SolveTask[] = [];

    // Reserved Slice (ENDGAME Optimization Prototype Sprint v1, STEP1):
    // computed ONCE, before the loop, since whether an ENDGAME task exists
    // is already knowable from the planned `tasks` array. Non-ENDGAME tasks
    // are capped to this tighter ceiling; the ENDGAME task itself always
    // gets the full, unrestricted `deadline`, below.
    const hasEndgameTask = tasks.some((t) => t.type === "ENDGAME");
    const nonEndgameCeiling =
      endgameReserveMs !== undefined && hasEndgameTask ? Math.max(Date.now(), deadline - endgameReserveMs) : deadline;

    for (const task of tasks) {
      const taskCeiling = task.type === "ENDGAME" ? deadline : nonEndgameCeiling;
      if (Date.now() > taskCeiling) {
        this.log("budget-exhausted", `${task.type} 태스크 도달 전 예산 소진`);
        break;
      }
      if (wrongWingCount5(working) === 0) {
        this.log("already-solved", "더 남은 태스크 없음");
        break;
      }
      // allowRecovery=true only here (Adaptive Executor v2) -- this is the
      // one real, top-level execution loop, as opposed to Planner's own
      // simulateStrategy preview calls, which must stay recovery-free to
      // preserve the Planner v2 determinism guarantee (see executeTask's
      // own comment in fiveByFiveEdgeExecutor.ts for why).
      const before = wrongWingCount5(working);
      const taskStart = Date.now();
      const remainingAtStart = deadline - taskStart;
      const moves = executeTask(working, task, libs, taskCeiling, this.trace, true, undefined, true, true, undefined, undefined, recoveryReserveMsOverride);
      const taskRuntimeMs = Date.now() - taskStart;
      const after = wrongWingCount5(working);
      if (task.type === "ENDGAME") {
        this.log(
          "endgame-instrumentation",
          `runtimeMs=${taskRuntimeMs}, remainingBudgetAtStart=${remainingAtStart}, reservedSliceActive=${endgameReserveMs !== undefined}, improved=${after < before}, wrongWingCount ${before} -> ${after}`
        );
      }
      if (moves.length > 0) {
        moveQueue.push(...moves);
        completedTasks.push(task);
        this.log(`task-${task.id}`, `${task.description}: wrongWingCount ${before} -> ${after} (${moves.length}수)`);
      } else {
        this.log(`task-${task.id}-skip`, `${task.description}: 진전 없음 (라이브러리에서 해당 케이스를 찾지 못함)`);
      }
    }

    const finalWrong = wrongWingCount5(working);
    this.log("done", `최종 wrongWingCount=${finalWrong}, 총 ${moveQueue.length}수`);

    const plan: SolvePlan = {
      stateHash: startHash,
      tasks: completedTasks,
      moveQueue,
      currentMove: 0,
      score: -finalWrong,
      createdAt: Date.now(),
    };
    this.plan = plan;
    this.planStartCubies = cloneCubies(cubies);
    return plan;
  }

  /** Returns the next move from the cached plan's queue, advancing the
   * cursor, or null once the queue is exhausted or no plan exists. Does NOT
   * itself validate the plan against a live cube -- call hasValidPlan()
   * first (the UI is expected to, right before requesting a move; see
   * fiveByFiveEdgeSolverEngine's usage in customSolvePlayback.ts). */
  nextMove(): Move | null {
    if (!this.plan) return null;
    if (this.plan.currentMove >= this.plan.moveQueue.length) return null;
    const move = this.plan.moveQueue[this.plan.currentMove];
    this.plan.currentMove += 1;
    return move;
  }

  /** Discards the cached plan -- called whenever the cube changes in a way
   * the plan didn't itself produce (a user move off-plan, scramble, reset,
   * undo; see spec section 5). */
  invalidatePlan(): void {
    this.plan = null;
    this.planStartCubies = null;
  }

  /** True only if a plan exists AND the live cube matches exactly where the
   * plan's own move queue should have taken it by now (spec section 6) --
   * i.e. replays moveQueue[0..currentMove] from the plan's starting
   * snapshot and compares hashes, so this also catches the user having
   * played a DIFFERENT move than the plan expected partway through, not
   * just changes before the first move. */
  hasValidPlan(cubies: Cubie[]): boolean {
    if (!this.plan || !this.planStartCubies) return false;
    const expected = cloneCubies(this.planStartCubies);
    applySeq(expected, this.plan.moveQueue.slice(0, this.plan.currentMove));
    return computeEdgeSolverStateHash(cubies) === computeEdgeSolverStateHash(expected);
  }

  currentPlan(): SolvePlan | null {
    return this.plan;
  }

  /**
   * The method the UI actually calls every time the solve button is
   * pressed. This solver only ever PREVIEWS a move (turn-then-revert, see
   * customSolvePlayback.ts) -- it never commits one itself, so the live
   * cube only advances once the USER manually performs the swipe matching
   * the last preview. That means a plain nextMove() (which unconditionally
   * advances the queue cursor) would desync from reality the instant it's
   * called on a press where the user hasn't actually moved yet. This method
   * does the 3-way check that actually matches that UX:
   *
   * 1. Live cube matches "plan replayed through move N+1" (the user just
   *    performed the previously-previewed move) -> accept it, advance the
   *    cursor, return the move AFTER that as the new preview.
   * 2. Live cube matches "plan replayed through move N" (nothing changed
   *    since the last preview -- e.g. pressed again without moving) ->
   *    re-return the same move N, no advancement.
   * 3. Neither (an off-plan move, scramble, reset, undo) -> invalidate and
   *    return null so the caller knows to build a fresh plan instead.
   */
  syncAndPeekNextMove(liveCubies: Cubie[]): Move | null {
    if (!this.plan || !this.planStartCubies) return null;
    const liveHash = computeEdgeSolverStateHash(liveCubies);

    const atCurrent = cloneCubies(this.planStartCubies);
    applySeq(atCurrent, this.plan.moveQueue.slice(0, this.plan.currentMove));
    if (computeEdgeSolverStateHash(atCurrent) === liveHash) {
      if (this.plan.currentMove < this.plan.moveQueue.length) return this.plan.moveQueue[this.plan.currentMove];
      // Queue exhausted with nothing left to offer -- invalidate here too
      // (not just on an off-plan mismatch below), so the caller's own
      // hasValidPlan() check reliably signals "build a fresh plan" instead
      // of reporting a stale plan as still valid with nothing in it.
      this.invalidatePlan();
      return null;
    }

    if (this.plan.currentMove < this.plan.moveQueue.length) {
      const atNext = cloneCubies(atCurrent);
      applySeq(atNext, [this.plan.moveQueue[this.plan.currentMove]]);
      if (computeEdgeSolverStateHash(atNext) === liveHash) {
        this.plan.currentMove += 1;
        this.log("move-confirmed", `${this.plan.currentMove}/${this.plan.moveQueue.length}수 진행`);
        if (this.plan.currentMove < this.plan.moveQueue.length) return this.plan.moveQueue[this.plan.currentMove];
        this.invalidatePlan();
        return null;
      }
    }

    this.log("off-plan-detected", "라이브 큐브가 예상 상태와 불일치 -- Plan 폐기");
    this.invalidatePlan();
    return null;
  }
}
