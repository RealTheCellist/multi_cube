import { Alg } from "cubing/alg";
import type { KPattern, KPuzzle } from "cubing/kpuzzle";
import { cube2x2x2, cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve2x2x2 } from "cubing/search";
import { computeSolveHint, type SolveHint } from "../solvePlayback";
import type { Axis } from "./cubeMath";
import type { CustomCubeScene } from "./CustomCubeScene";
import { applyRawQuarterTurn, cloneCubies, FACE_TURNS, outerLayerCoordinate, type Cubie, type Face } from "./cubeState";
import { solveCenters } from "./fourByFourCenters";
import { solveEdgePairing, warmupFourByFourEdgeLibrary } from "./fourByFourEdges";
import { solveReduced, warmupFourByFourReductionSolver } from "./fourByFourReduction";
import { computeFourByFourStateHash } from "./fourByFourStateHash";
import { solveTrueCenterPositions5 } from "./fiveByFiveCenters";
import { wrongWingCount5 } from "./fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
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
  warmupFourByFourEdgeLibrary();
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
export async function computeFourByFourSolveMoves(scene: CustomCubeScene): Promise<FourByFourSolvePlan> {
  const cubies = cloneCubies(scene.getCubies());
  const moves: Move[] = [];

  // Edges first: pairing doesn't care about center state, but its tail
  // phase can disturb centers (see fourByFourEdges.ts) -- so solving
  // centers first would just get undone. Centers only once, after, since
  // nothing downstream of it (the reduction solve's single-outer-layer
  // turns) ever touches centers again.
  const edgeResult = await solveEdgePairing(cubies, 150000);
  moves.push(...edgeResult.moves);
  if (!edgeResult.solved) return { solved: false, moves };

  const centerResult = solveCenters(cubies, 15000);
  moves.push(...centerResult.moves);
  if (!centerResult.solved) return { solved: false, moves };

  const reductionResult = await solveReduced(cubies, scene.gridSize);
  moves.push(...reductionResult.moves);
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

function applyMoveSeq(cubies: Cubie[], moves: readonly Move[]): void {
  for (const [axis, layer, sign] of moves) applyRawQuarterTurn(cubies, axis, layer, sign);
}

/**
 * Plan-once/consume-many cache for the 4x4x4 solve hint, mirroring
 * FiveByFiveEdgeSolverEngine's own architecture (see fiveByFiveEdgeSolverEngine.ts's
 * header comment) -- both exist for the same reason. computeFourByFourSolveMoves's
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

  async solve(scene: CustomCubeScene): Promise<void> {
    const startCubies = cloneCubies(scene.getCubies());
    const result = await computeFourByFourSolveMoves(scene);
    this.plan = { moveQueue: result.moves, currentMove: 0, solved: result.solved };
    this.planStartCubies = startCubies;
  }

  invalidatePlan(): void {
    this.plan = null;
    this.planStartCubies = null;
  }

  /** True only if a plan exists AND the live cube matches exactly where the
   * plan's own move queue should have taken it by now. True even once the
   * queue is fully consumed ("valid AND exhausted" is a distinct case from
   * "invalid" -- see syncAndPeekNextMove). */
  hasValidPlan(liveCubies: readonly Cubie[]): boolean {
    if (!this.plan || !this.planStartCubies) return false;
    const expected = cloneCubies(this.planStartCubies);
    applyMoveSeq(expected, this.plan.moveQueue.slice(0, this.plan.currentMove));
    return computeFourByFourStateHash(liveCubies) === computeFourByFourStateHash(expected);
  }

  /**
   * Returns the next move from the cached plan, after a 3-way check against
   * the live cube (mirrors FiveByFiveEdgeSolverEngine.syncAndPeekNextMove):
   * 1. Live cube matches "plan replayed through move N+1" (this engine's own
   *    previous press committed the previously-returned move) -> advance the
   *    cursor, return the move after that.
   * 2. Live cube matches "plan replayed through move N" (nothing changed
   *    since the last call) -> re-return move N, no advancement.
   * 3. Neither (an off-plan move, scramble, reset, undo) -> invalidate and
   *    return null so the caller knows to build a fresh plan instead.
   * Returns null (without invalidating) when the plan is still valid but its
   * queue is simply exhausted -- callers distinguish that from case 3 via
   * hasValidPlan.
   */
  syncAndPeekNextMove(liveCubies: readonly Cubie[]): Move | null {
    if (!this.plan || !this.planStartCubies) return null;
    const liveHash = computeFourByFourStateHash(liveCubies);

    const atCurrent = cloneCubies(this.planStartCubies);
    applyMoveSeq(atCurrent, this.plan.moveQueue.slice(0, this.plan.currentMove));
    if (computeFourByFourStateHash(atCurrent) === liveHash) {
      return this.plan.currentMove < this.plan.moveQueue.length ? this.plan.moveQueue[this.plan.currentMove] : null;
    }

    if (this.plan.currentMove < this.plan.moveQueue.length) {
      const atNext = cloneCubies(atCurrent);
      applyMoveSeq(atNext, [this.plan.moveQueue[this.plan.currentMove]]);
      if (computeFourByFourStateHash(atNext) === liveHash) {
        this.plan.currentMove += 1;
        return this.plan.currentMove < this.plan.moveQueue.length ? this.plan.moveQueue[this.plan.currentMove] : null;
      }
    }

    this.invalidatePlan();
    return null;
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
  if (!edgeLibrariesWarmed) {
    warmupFiveByFiveEdgeLibraries();
    edgeLibrariesWarmed = true;
  }
  const cubies = cloneCubies(scene.getCubies());

  const trueCenterResult = solveTrueCenterPositions5(cubies);
  const centerResult = solveCentersHumanStyle(cubies, 15000);
  const centerMoves = [...trueCenterResult.moves, ...centerResult.moves];
  if (centerMoves.length > 0) {
    await commitFirstMove(scene, centerMoves);
    return { hasMove: true, movesRemaining: centerMoves.length - 1, solved: false };
  }

  if (wrongWingCount5(cubies) > 0) {
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
