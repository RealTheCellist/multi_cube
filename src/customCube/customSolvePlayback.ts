import { Alg } from "cubing/alg";
import type { KPattern, KPuzzle } from "cubing/kpuzzle";
import { cube2x2x2, cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve2x2x2 } from "cubing/search";
import { computeSolveHint, type SolveHint } from "../solvePlayback";
import type { Axis } from "./cubeMath";
import type { CustomCubeScene } from "./CustomCubeScene";
import { applyRawQuarterTurn, cloneCubies, FACE_TURNS, outerLayerCoordinate, type Cubie, type Face } from "./cubeState";
import { preloadFourByFourWorker, solveEdgesAndCentersStreaming } from "./fourByFourWorkerClient";
import { solveReduced, warmupFourByFourReductionSolver } from "./fourByFourReduction";
import { computeFourByFourStateHash } from "./fourByFourStateHash";
import { decideNextPlanMove, isCubiesStateAt } from "./planCursor";
import { solveTrueCenterPositions5, wrongCenterCount as wrongCenterCount5 } from "./fiveByFiveCenters";
import { wrongWingCount5 } from "./fiveByFiveEdges";
import { computeEdgeSolverStateHash } from "./fiveByFiveEdgeStateHash";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { solveCentersByCommutator5 } from "./fiveByFiveCentersCommutator";
import { planPairing5 } from "./fiveByFivePlan";
import { solveCentersHumanStyle } from "./fiveByFiveHumanCenters";
import { solveReduced5 } from "./fiveByFiveReduction";

export type Move = readonly [Axis, number, 1 | -1];

const MOVE_ANIMATION_MS = 350;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateProgress(scene: CustomCubeScene, from: number, to: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now: number) {
      const t = Math.min((now - start) / durationMs, 1);
      scene.setTurnProgress(from + easeOutCubic(t) * (to - from));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

const kpuzzlePromises = new Map<number, Promise<KPuzzle>>();
function getKpuzzle(gridSize: number): Promise<KPuzzle> {
  let promise = kpuzzlePromises.get(gridSize);
  if (!promise) {
    promise = (gridSize === 2 ? cube2x2x2 : cube3x3x3).kpuzzle();
    kpuzzlePromises.set(gridSize, promise);
  }
  return promise;
}

/**
 * Replays the scene's own move history onto a fresh cubing/kpuzzle pattern
 * to get a KPattern for the solver -- this custom renderer never talks to
 * cubing.js's piece/orientation encoding directly, so reproducing the exact
 * same state via the move list (rather than reading it out of the scene) is
 * the simplest way to hand off to the shared solver.
 */
async function currentPatternFor(scene: CustomCubeScene): Promise<KPattern> {
  const kpuzzle = await getKpuzzle(scene.gridSize);
  const historyAlg = Alg.fromString(scene.getMoveHistory().join(" "));
  return kpuzzle.defaultPattern().applyAlg(historyAlg);
}

async function solve2x2Hint(pattern: KPattern): Promise<SolveHint> {
  const solutionAlg = await experimentalSolve2x2x2(pattern);
  const moves = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  if (moves.length === 0) return { move: null, movesRemaining: 0 };
  return { move: moves[0], movesRemaining: moves.length - 1 };
}

/**
 * Solves for the scene's current pattern and plays its first move for real:
 * turns the layer and commits it, exactly as if the player had swiped it
 * themselves (real move history, moveCount, and solved-state detection all
 * follow). A magnitude-2 hint ("R2" etc.) is committed as two back-to-back
 * quarter turns rather than a single 180-degree one, since endTurn only ever
 * commits a quarter turn at a time -- see CustomCubeScene.ts. Only the 2x2x2
 * and 3x3x3 have a solver available -- see cubeState.ts for why a 4x4x4
 * doesn't have a single well-defined letter scheme to solve toward, and
 * cubing/search doesn't ship a 4x4x4 solver at all.
 */
export async function applyNextSolveMove(scene: CustomCubeScene): Promise<SolveHint> {
  if (scene.gridSize !== 2 && scene.gridSize !== 3) return { move: null, movesRemaining: 0 };
  const pattern = await currentPatternFor(scene);
  const hint = scene.gridSize === 2 ? await solve2x2Hint(pattern) : await computeSolveHint(pattern);
  if (!hint.move) return hint;

  const token = hint.move;
  const face = token[0] as Face;
  const suffix = token.slice(1);
  const { axis, sign: canonicalSign } = FACE_TURNS[face];
  const layer = outerLayerCoordinate(face, scene.gridSize);
  const dirSign: 1 | -1 = suffix === "'" ? -1 : 1;
  const magnitude = suffix === "2" ? 2 : 1;
  const quarterSign = (canonicalSign * dirSign) as 1 | -1;

  for (let i = 0; i < magnitude; i++) {
    // See the matching check in applyNextFourByFourMove -- if the scene's
    // turn is already owned (e.g. a live user drag), stop rather than
    // stealing or fighting it; any quarter turn already committed this call
    // stays committed.
    if (!scene.beginTurn(axis, layer)) break;
    await animateProgress(scene, 0, quarterSign, MOVE_ANIMATION_MS);
    scene.endTurn(quarterSign);
  }

  return hint;
}

/**
 * Kicks off the 4x4x4 solve pipeline's one-time, scramble-independent setup
 * costs (the 3-cycle algorithm library, and cubing/search's reduction
 * solver) ahead of the user's first solve press -- see
 * warmupFourByFourEdgeLibrary/warmupFourByFourReductionSolver's own
 * docstrings. Meant to be called (fire-and-forget, not awaited) as soon as
 * the player picks 4x4, same spirit as warmupFiveByFiveEdgeLibraries for the
 * 5x5. Cheap and safe to call more than once -- both warmups are internally
 * memoized/guarded.
 */
export function warmupFourByFour(): void {
  preloadFourByFourWorker();
  void warmupFourByFourReductionSolver();
}

export interface FourByFourSolvePlan {
  solved: boolean;
  moves: Move[];
}

/**
 * Computes the full 4x4x4 solve plan -- edges, then centers, then reduction
 * (same order as a real solve, see the comment inside) -- entirely on a
 * clone of the scene's cubies, so the live scene isn't touched at all. This
 * function itself is stateless (always runs fresh from whatever cubies it's
 * handed); FourByFourSolverEngine below is what caches its result across
 * presses so the (potentially expensive) computation doesn't repeat for
 * every single quarter turn. Can legitimately take up to a couple of
 * minutes to compute, for the edge pairing's tail search on a hard
 * scramble.
 *
 * A minority of scrambles reduce to a pattern only reachable via a genuine
 * 4x4x4 move (OLL and/or PLL parity), which the 3x3x3 solver can't resolve
 * on its own -- solveReduced itself handles retrying with verified parity-
 * fix algorithms (see fourByFourReduction.ts) before giving up, so this
 * only needs to check its final result.
 */
export async function computeFourByFourSolveMoves(scene: CustomCubeScene, onMoves?: (moves: readonly Move[]) => void): Promise<FourByFourSolvePlan> {
  const cubies = cloneCubies(scene.getCubies());
  const moves: Move[] = [];
  const emit = (chunk: readonly Move[]) => {
    for (const m of chunk) moves.push(m);
    for (const [axis, layer, sign] of chunk) applyRawQuarterTurn(cubies, axis, layer, sign);
    onMoves?.(chunk);
  };

  // Edges first: pairing doesn't care about center state, but its tail
  // phase can disturb centers (see fourByFourEdges.ts) -- so solving
  // centers first would just get undone. Centers only once, after, since
  // nothing downstream of it (the reduction solve's single-outer-layer
  // turns) ever touches centers again.
  // Edge pairing and center solving are long uninterrupted computations: they run in a worker (see
  // fourByFourWorker.ts) and arrive phase by phase, so `onMoves` can hand the edge moves to the player before
  // the centers are even done.
  let edgesSolved = false;
  let centersSolved = false;
  await solveEdgesAndCentersStreaming(cubies, (chunk) => {
    emit(chunk.moves);
    if (chunk.phase === "edges") edgesSolved = chunk.solved;
    else centersSolved = chunk.solved;
  });
  if (!edgesSolved || !centersSolved) return { solved: false, moves };

  const reductionResult = await solveReduced(cubies, scene.gridSize);
  emit(reductionResult.moves);
  return { solved: reductionResult.solved, moves };
}

export interface FourByFourHint {
  hasMove: boolean;
  movesRemaining: number;
  solved: boolean;
}

interface FourByFourPlan {
  moveQueue: Move[];
  currentMove: number;
  solved: boolean;
}

/**
 * Plan-once/consume-many cache for the 4x4x4 solve hint, mirroring
 * FiveByFiveEdgeSolverEngine's own architecture (see fiveByFiveEdgeSolverEngine.ts's
 * header comment) -- both exist for the same reason, and both share the same
 * cursor-validation logic (see planCursor.ts). computeFourByFourSolveMoves's
 * plan is built from a library of multi-move algorithms that only pair/place
 * pieces once applied in FULL; an earlier version of this file recomputed the
 * whole plan from scratch every press and committed only its first quarter
 * turn, discarding the rest -- since the next press's fresh (differently
 * randomized) plan rarely continues the same algorithm, no single algorithm
 * ever actually finished, so the cube could wander for hundreds of presses
 * without making real progress even though every individual press
 * legitimately computed a complete, valid solution from wherever the cube
 * actually stood (that's also why the "couldn't fully solve" warning never
 * fired -- a freshly recomputed plan almost always claims solved:true, since
 * it's a real solution to *some* state, just one the live cube never actually
 * reached). Caching the plan and stepping through its SAME move queue one
 * press at a time -- rebuilding only when the live cube no longer matches
 * where the cached plan expects it (scramble, reset, undo, or an off-plan
 * move) -- is what actually lets those algorithms complete.
 */
class FourByFourSolverEngine {
  private plan: FourByFourPlan | null = null;
  private planStartCubies: Cubie[] | null = null;

  // The plan arrives phase by phase (edges, centers, reduction), appended to `moveQueue` as each finishes.
  // `computing` stays true until the last phase has been delivered; `generation` makes the leftovers of a
  // superseded solve (new scramble, reset, undo) harmless.
  private computing = false;
  private generation = 0;
  private waiters: (() => void)[] = [];

  private notify(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  /** True while more moves may still be appended to the current plan. */
  isComputing(): boolean {
    return this.computing;
  }

  /** Resolves at the next delivered chunk or when the computation ends (immediately if it already has). */
  waitForProgress(): Promise<void> {
    return this.computing ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }

  /** Starts a solve for the scene's current state; resolves once the first moves are available (or the solve ended). */
  solve(scene: CustomCubeScene): Promise<void> {
    const generation = ++this.generation;
    const plan: FourByFourPlan = { moveQueue: [], currentMove: 0, solved: false };
    this.plan = plan;
    this.planStartCubies = cloneCubies(scene.getCubies());
    this.computing = true;
    const startedAt = performance.now();
    let firstMoveMs: number | null = null;
    return new Promise<void>((resolveFirst) => {
      computeFourByFourSolveMoves(scene, (chunk) => {
        if (generation !== this.generation) return;
        for (const m of chunk) plan.moveQueue.push(m);
        if (chunk.length > 0) {
          if (firstMoveMs === null) firstMoveMs = performance.now() - startedAt;
          resolveFirst();
        }
        this.notify();
      })
        .then((result) => {
          if (generation !== this.generation) return;
          plan.solved = result.solved;
        })
        .catch((err) => console.error("4x4 solve failed:", err))
        .then(() => {
          if (generation === this.generation) {
            this.computing = false;
            // Same idea as the [royal]/[master-tetra]/[gigaminx] diagnostics: a slow outlier (most likely on a slower device) explains itself.
            const totalMs = performance.now() - startedAt;
            if ((firstMoveMs ?? totalMs) > 3000) console.warn(`[cube4] slow first move: ${Math.round(firstMoveMs ?? totalMs)}ms`, { totalMs: Math.round(totalMs), moves: plan.moveQueue.length });
          }
          resolveFirst();
          this.notify();
        });
    });
  }

  invalidatePlan(): void {
    this.generation++;
    this.plan = null;
    this.planStartCubies = null;
    this.computing = false;
    this.notify();
  }

  /** True only if a plan exists AND the live cube matches exactly where the
   * plan's own move queue should have taken it by now. True even once the
   * queue is fully consumed ("valid AND exhausted" is a distinct case from
   * "invalid" -- see syncAndPeekNextMove). */
  hasValidPlan(liveCubies: readonly Cubie[]): boolean {
    if (!this.plan || !this.planStartCubies) return false;
    return isCubiesStateAt(this.planStartCubies, this.plan.moveQueue.slice(0, this.plan.currentMove), liveCubies, computeFourByFourStateHash);
  }

  /**
   * Returns the next move from the cached plan, via the shared 3-way check
   * (see planCursor.ts's decideNextPlanMove for exactly what it does).
   * Returns null (without invalidating) when the plan is still valid but its
   * queue is simply exhausted -- callers distinguish that from a genuinely
   * stale plan via hasValidPlan.
   */
  syncAndPeekNextMove(liveCubies: readonly Cubie[]): Move | null {
    if (!this.plan || !this.planStartCubies) return null;
    const decision = decideNextPlanMove(this.planStartCubies, this.plan.moveQueue, this.plan.currentMove, liveCubies, computeFourByFourStateHash);
    if (decision.kind === "stale") {
      this.invalidatePlan();
      return null;
    }
    this.plan.currentMove = decision.currentMove;
    return decision.move;
  }

  /** The cached plan's own verdict: whether its full move queue, once
   * entirely applied, actually reaches a solved cube. Only meaningful once
   * the queue is exhausted. */
  isSolved(): boolean {
    return this.plan?.solved ?? false;
  }

  remainingMoves(): number {
    return this.plan ? this.plan.moveQueue.length - this.plan.currentMove : 0;
  }
}

const fourByFourEngine = new FourByFourSolverEngine();

/**
 * Fire-and-forget background prewarm for the 4x4x4 hint: starts
 * computeFourByFourSolveMoves right away (meant to be called right after a
 * scramble), so applyNextFourByFourMove's own `hasValidPlan` check usually
 * finds a ready plan by the time the player actually presses "솔브". Errors
 * are swallowed -- a failed prewarm just means the real press recomputes,
 * same as if this were never called.
 */
export function prewarmFourByFourSolve(scene: CustomCubeScene): void {
  if (fourByFourEngine.hasValidPlan(scene.getCubies())) return;
  fourByFourEngine.solve(scene).catch(() => {});
}

/**
 * Solves for the scene's current actual state and plays the next move of a
 * CACHED plan for real: turns the layer and commits it, exactly as if the
 * player had swiped it themselves. The expensive full recompute
 * (computeFourByFourSolveMoves, up to a couple of minutes) only happens when
 * no valid cached plan remains for the live cube -- the first press after a
 * scramble/reset/undo/off-plan move -- every other press just steps to the
 * next move already sitting in that plan's queue (see FourByFourSolverEngine
 * above for why stepping through the SAME plan, rather than recomputing a
 * fresh one every press, is required for this correctly).
 */
export async function applyNextFourByFourMove(scene: CustomCubeScene): Promise<FourByFourHint> {
  const liveCubies = scene.getCubies();
  let move = fourByFourEngine.syncAndPeekNextMove(liveCubies);

  // Everything delivered so far has been played but later phases are still being computed: wait for more.
  while (!move && fourByFourEngine.isComputing() && fourByFourEngine.hasValidPlan(liveCubies)) {
    await fourByFourEngine.waitForProgress();
    move = fourByFourEngine.syncAndPeekNextMove(liveCubies);
  }

  if (!move && fourByFourEngine.hasValidPlan(liveCubies)) {
    // Plan is still valid (nothing diverged) but its queue is exhausted --
    // this genuinely is the end of the solve, whatever it did or didn't
    // achieve. Report its own verdict rather than recomputing (which would
    // just find the exact same thing again).
    const solved = fourByFourEngine.isSolved();
    fourByFourEngine.invalidatePlan();
    return { hasMove: false, movesRemaining: 0, solved };
  }

  if (!move) {
    // No plan yet, or the live cube diverged from the cached one
    // (scramble/reset/undo/a stray manual move) -- (re)build one fresh, from
    // the actual current state.
    await fourByFourEngine.solve(scene);
    move = fourByFourEngine.syncAndPeekNextMove(liveCubies);
    while (!move && fourByFourEngine.isComputing()) {
      await fourByFourEngine.waitForProgress();
      move = fourByFourEngine.syncAndPeekNextMove(liveCubies);
    }
    if (!move) {
      const solved = fourByFourEngine.isSolved();
      fourByFourEngine.invalidatePlan();
      return { hasMove: false, movesRemaining: 0, solved };
    }
  }

  const [axis, layer, sign] = move;
  // If something else already owns the scene's turn (most likely: the user
  // started dragging the cube themselves while a plan was computing), skip
  // this press rather than fight or steal it -- the cursor hasn't advanced,
  // so the next press will offer this same move again.
  if (scene.beginTurn(axis, layer)) {
    await animateProgress(scene, 0, sign, MOVE_ANIMATION_MS);
    scene.endTurn(sign);
  }

  // Suppress the "couldn't fully solve" warning while the queue still has
  // moves left -- that verdict only means something once it's exhausted
  // (see the two early returns above).
  return { hasMove: true, movesRemaining: fourByFourEngine.remainingMoves(), solved: true };
}

export interface FiveByFiveHint {
  hasMove: boolean;
  movesRemaining: number;
  solved: boolean;
}

// Centers (true-center positions + X/T-center colors) and reduction are
// unchanged from the older single-shot design -- neither is part of the
// Edge Solver Architecture Spec v2.0 redesign (that spec is scoped to
// wing-pairing specifically, see fiveByFiveEdgeSolverTypes.ts), and both are
// already fast (a handful of seconds at most), so recomputing them fresh on
// every press is fine, same as before.
//
// Wing pairing itself now goes through fiveByFiveEdgeSolverEngine's
// plan-once/consume-many model instead: one FiveByFiveEdgeSolverEngine
// instance persists across presses (module-level, since only one 5x5x5
// CubeView is ever mounted at a time), building a fresh SolvePlan only when
// none exists yet or the live cube no longer matches where the cached one
// expects it to be (scramble, reset, undo, or an off-plan move -- see
// syncAndPeekNextMove's own comment). A single press's plan is capped at
// ~1 second (see PLAN_TIME_BUDGET_MS) by explicit user choice, tighter than
// solveEdgePairingHumanStyle's old 45s budget -- this session's own
// measurements established some scrambles need that much search just to
// make partial progress, so a hard scramble will now often need SEVERAL
// presses (each producing a plan that continues from wherever the last one
// left off) rather than fully pairing in one shot the way the old,
// much-slower solver sometimes could.
const edgeSolverEngine = new FiveByFiveEdgeSolverEngine();
let edgeLibrariesWarmed = false;

/**
 * Plan-once/consume-many cache for the true-center + human-style-center
 * phase, same shape as FourByFourSolverEngine above (and the SAME
 * decideNextPlanMove/isCubiesStateAt machinery FiveByFiveEdgeSolverEngine
 * already uses -- see planCursor.ts). This replaces an earlier version that
 * recomputed the whole phase from scratch on EVERY press just to extract
 * ONE move (commitFirstMove only ever applies moves[0]) -- confirmed the
 * hard way: solveCentersHumanStyle alone commonly spends its full 15s
 * budget on EVERY press until centers are fully solved, not just the first
 * one, since a fresh state-hash-only cache misses the instant a single move
 * gets committed to the live scene. Stepping through ONE cached plan's own
 * move queue (rebuilding only on scramble/reset/undo/an off-plan move)
 * is what actually fixes that, matching how the wing-pairing phase
 * (FiveByFiveEdgeSolverEngine) and the 4x4x4 hint already work.
 */
/**
 * X/T-center moves for `cubies` (true centers already in place; mutated to the solved-centers
 * state, like solveCentersHumanStyle did). The commutator solver takes milliseconds; the old
 * search (up to its 15s budget) stays only as a fallback if that ever throws or fails to verify.
 */
function solveCenterMoves(cubies: Cubie[]): Move[] {
  try {
    const moves = solveCentersByCommutator5(cubies);
    const check = cloneCubies(cubies);
    for (const [axis, layer, sign] of moves) applyRawQuarterTurn(check, axis, layer, sign);
    if (wrongCenterCount5(check) === 0) {
      for (const [axis, layer, sign] of moves) applyRawQuarterTurn(cubies, axis, layer, sign);
      return [...moves];
    }
  } catch (err) {
    console.error("5x5 commutator centers solver failed (non-fatal, using the slower search):", err);
  }
  return solveCentersHumanStyle(cubies, 15000).moves;
}

class CenterPhaseEngine {
  private plan: Move[] | null = null;
  private cursor = 0;
  private planStartCubies: Cubie[] | null = null;
  // The 3x3x3-style reduction moves are computed right after the pairing plan (cubing's solver is async) and
  // APPENDED to the same plan, so the whole solve is one cached plan stepped through by the cursor. Replanning
  // the reduction on every press instead let two equally good solutions alternate forever (z2- then z2+ ...).
  private tailPending = false;
  private tailSolved = false;
  private generation = 0;
  private tailWaiters: (() => void)[] = [];

  hasValidPlan(liveCubies: readonly Cubie[]): boolean {
    if (!this.plan || !this.planStartCubies) return false;
    return isCubiesStateAt(this.planStartCubies, this.plan.slice(0, this.cursor), liveCubies, computeEdgeSolverStateHash);
  }

  /** `cubies` must be a clone the caller owns -- solveTrueCenterPositions5/solveCentersHumanStyle mutate it in place as they search. */
  solve(cubies: Cubie[]): void {
    const startCubies = cloneCubies(cubies);
    // Preferred: one constructive plan for true centers, X/T-centers and wing pairing (milliseconds). It
    // leaves nothing for the old wing search below, which stays only as the fallback.
    let pairing: Move[] | null = null;
    const planningStartedAt = performance.now();
    try {
      pairing = planPairing5(cubies);
    } catch (err) {
      console.error("5x5 pairing planner failed (non-fatal, using the older search):", err);
    }
    const planningMs = performance.now() - planningStartedAt;
    if (planningMs > 1500 || !pairing) console.warn(`[cube5] slow or failed pairing plan: ${Math.round(planningMs)}ms`, { planned: !!pairing, moves: pairing?.length });
    if (pairing) {
      this.plan = pairing;
      this.startReductionTail(startCubies, pairing);
    } else {
      const trueCenterResult = solveTrueCenterPositions5(cubies);
      const centerMoves = solveCenterMoves(cubies);
      this.plan = [...trueCenterResult.moves, ...centerMoves];
    }
    this.cursor = 0;
    this.planStartCubies = startCubies;
  }

  /** Computes the reduction of the paired cube asynchronously and appends it to the plan when ready. */
  private startReductionTail(startCubies: Cubie[], pairing: readonly Move[]): void {
    const generation = ++this.generation;
    const plan = this.plan!;
    const end = cloneCubies(startCubies);
    for (const [axis, layer, sign] of pairing) applyRawQuarterTurn(end, axis, layer, sign);
    this.tailPending = true;
    this.tailSolved = false;
    const finish = () => {
      if (generation !== this.generation) return;
      this.tailPending = false;
      const waiters = this.tailWaiters;
      this.tailWaiters = [];
      for (const w of waiters) w();
    };
    solveReduced5(end, 5)
      .then((result) => {
        if (generation !== this.generation) return;
        for (const m of result.moves) plan.push(m);
        this.tailSolved = result.solved;
      })
      .catch((err) => console.error("5x5 reduction planning failed (non-fatal):", err))
      .then(finish);
  }

  /** True while the reduction moves are still being computed (more moves may yet be appended). */
  isTailPending(): boolean {
    return this.tailPending;
  }

  waitForTail(): Promise<void> {
    return this.tailPending ? new Promise((resolve) => this.tailWaiters.push(resolve)) : Promise.resolve();
  }

  /** Whether the finished plan (pairing + reduction) ends at a solved cube. */
  planSolves(): boolean {
    return this.tailSolved;
  }

  invalidate(): void {
    this.generation++;
    this.plan = null;
    this.cursor = 0;
    this.planStartCubies = null;
    this.tailPending = false;
    const waiters = this.tailWaiters;
    this.tailWaiters = [];
    for (const w of waiters) w();
  }

  syncAndPeekNextMove(liveCubies: readonly Cubie[]): Move | null {
    if (!this.plan || !this.planStartCubies) return null;
    const decision = decideNextPlanMove(this.planStartCubies, this.plan, this.cursor, liveCubies, computeEdgeSolverStateHash);
    if (decision.kind === "stale") {
      this.invalidate();
      return null;
    }
    this.cursor = decision.currentMove;
    return decision.move;
  }

  remainingMoves(): number {
    return this.plan ? this.plan.length - this.cursor : 0;
  }
}

const centerPhaseEngine = new CenterPhaseEngine();

/**
 * Fire-and-forget background prewarm for the 5x5x5 hint's centers phase
 * (see CenterPhaseEngine's own comment for why that phase specifically).
 * Meant to be called right after a scramble so the plan is usually already
 * cached by the time the player actually presses "솔브" -- every press
 * through the centers phase, not just the first, since the SAME plan now
 * gets stepped through rather than rebuilt.
 */
export function prewarmFiveByFiveSolve(scene: CustomCubeScene): void {
  const liveCubies = scene.getCubies();
  if (centerPhaseEngine.hasValidPlan(liveCubies)) return;
  // Synchronous and long-running (up to 15s, same as a real "솔브" press
  // today) -- this project's solve searches have no async/worker variant
  // for this phase, so there's no way to make the computation itself
  // non-blocking here. The caller (CubeView's own scramble handler) is
  // responsible for scheduling this via setTimeout(…, 0) rather than
  // calling it inline, so the scramble's own UI update gets to paint
  // BEFORE this long synchronous block starts (calling it inline from
  // inside a click handler would freeze the page before the scramble
  // itself ever became visible).
  centerPhaseEngine.solve(cloneCubies(liveCubies));
}

async function commitFirstMove(scene: CustomCubeScene, moves: readonly Move[]): Promise<void> {
  const [axis, layer, sign] = moves[0];
  // See the matching check in applyNextFourByFourMove -- if the scene's
  // turn is already owned (e.g. a live user drag), just skip this press
  // instead of stealing or fighting it.
  if (!scene.beginTurn(axis, layer)) return;
  await animateProgress(scene, 0, sign, MOVE_ANIMATION_MS);
  scene.endTurn(sign);
}

/**
 * Solves for the scene's current actual state and plays just the next move
 * for real (same contract as applyNextFourByFourMove -- turns the layer and
 * commits it, as if the player had swiped it themselves). Phase order:
 * true-center positions -> X/T-center colors -> wing pairing (new engine) ->
 * 3x3x3-style reduction, matching the dependency order the solver files
 * themselves require (see fiveByFiveCenters.ts/fiveByFiveReduction.ts's own
 * comments).
 */
export async function applyNextFiveByFiveMove(scene: CustomCubeScene): Promise<FiveByFiveHint> {
  const liveCubies = scene.getCubies();
  let centerMove = centerPhaseEngine.syncAndPeekNextMove(liveCubies);
  if (!centerMove && !centerPhaseEngine.hasValidPlan(liveCubies)) {
    centerPhaseEngine.solve(cloneCubies(liveCubies));
    centerMove = centerPhaseEngine.syncAndPeekNextMove(liveCubies);
  }
  // Played everything computed so far but the reduction tail is still on its way: wait for it.
  while (!centerMove && centerPhaseEngine.isTailPending()) {
    await centerPhaseEngine.waitForTail();
    centerMove = centerPhaseEngine.syncAndPeekNextMove(liveCubies);
  }
  if (centerMove) {
    await commitFirstMove(scene, [centerMove]);
    return { hasMove: true, movesRemaining: centerPhaseEngine.remainingMoves(), solved: centerPhaseEngine.planSolves() };
  }

  const cubies = cloneCubies(scene.getCubies());
  if (wrongWingCount5(cubies) > 0) {
    // Only reached if the constructive pairing plan failed: the older wing search needs its libraries
    // (~1.7s to build), so they are built here instead of eagerly on every scramble.
    if (!edgeLibrariesWarmed) {
      warmupFiveByFiveEdgeLibraries();
      edgeLibrariesWarmed = true;
    }
    let move = edgeSolverEngine.syncAndPeekNextMove(cubies);
    if (!move && !edgeSolverEngine.hasValidPlan(cubies)) {
      edgeSolverEngine.solve(cubies);
      move = edgeSolverEngine.syncAndPeekNextMove(cubies);
    }
    if (move) {
      await commitFirstMove(scene, [move]);
      const plan = edgeSolverEngine.currentPlan();
      const remaining = plan ? plan.moveQueue.length - plan.currentMove : 0;
      return { hasMove: true, movesRemaining: remaining, solved: false };
    }
    // This plan's queue is exhausted (or the budget ran out before it found
    // anything) but pairing still isn't done -- invalidate so the NEXT
    // press builds a fresh plan continuing from here, instead of silently
    // returning nothing forever.
    edgeSolverEngine.invalidatePlan();
    return { hasMove: false, movesRemaining: 0, solved: false };
  }

  const reductionResult = await solveReduced5(cubies, scene.gridSize);
  if (reductionResult.moves.length === 0) return { hasMove: false, movesRemaining: 0, solved: reductionResult.solved };
  await commitFirstMove(scene, reductionResult.moves);
  return { hasMove: true, movesRemaining: reductionResult.moves.length - 1, solved: reductionResult.solved };
}
