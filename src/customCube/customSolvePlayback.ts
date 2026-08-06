import { Alg } from "cubing/alg";
import type { KPattern, KPuzzle } from "cubing/kpuzzle";
import { cube2x2x2, cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve2x2x2 } from "cubing/search";
import { computeSolveHint, type SolveHint } from "../solvePlayback";
import type { Axis } from "./cubeMath";
import type { CustomCubeScene } from "./CustomCubeScene";
import { cloneCubies, FACE_TURNS, outerLayerCoordinate, type Face } from "./cubeState";
import { solveCenters } from "./fourByFourCenters";
import { solveEdgePairing } from "./fourByFourEdges";
import { solveReduced } from "./fourByFourReduction";
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

export interface FourByFourSolvePlan {
  solved: boolean;
  moves: Move[];
}

/**
 * Computes the full 4x4x4 solve plan -- edges, then centers, then reduction
 * (same order as a real solve, see the comment inside) -- entirely on a
 * clone of the scene's cubies, so the live scene isn't touched at all.
 * Always run fresh from the scene's actual current state (see
 * applyNextFourByFourMove below), never cached across calls. Can
 * legitimately take up to a couple of minutes to compute, for the edge
 * pairing's tail search on a hard scramble.
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

/**
 * Solves for the scene's current actual state and plays the first move of
 * the plan for real: turns the layer and commits it, exactly as if the
 * player had swiped it themselves. Recomputes the whole plan from scratch
 * every call rather than caching/stepping through one precomputed sequence
 * -- an earlier version did cache and auto-commit each move, but that goes
 * stale the moment the user's own swipes diverge from the plan (there's no
 * letter-notation move history to replay against and re-solve from, unlike
 * the 2x2x2/3x3x3, so a cached plan can't be validated against what
 * actually happened). Recomputing fresh is what the 2x2x2/3x3x3 hint
 * already does (see currentPatternFor/computeSolveHint), so this just
 * extends the same approach to the 4x4x4's own solve pipeline instead of
 * cubing/search (which doesn't ship a 4x4x4 solver at all).
 */
export async function applyNextFourByFourMove(scene: CustomCubeScene): Promise<FourByFourHint> {
  const plan = await computeFourByFourSolveMoves(scene);
  if (plan.moves.length === 0) return { hasMove: false, movesRemaining: 0, solved: plan.solved };

  const [axis, layer, sign] = plan.moves[0];
  // If something else already owns the scene's turn (most likely: the user
  // started dragging the cube themselves while this plan was computing --
  // computeFourByFourSolveMoves can take a while), skip this press rather
  // than fight or steal it. The plan itself was computed against a clone,
  // so the live cube is untouched either way -- only this press's move is
  // lost, and the next press recomputes fresh against whatever the user did.
  if (scene.beginTurn(axis, layer)) {
    await animateProgress(scene, 0, sign, MOVE_ANIMATION_MS);
    scene.endTurn(sign);
  }

  return { hasMove: true, movesRemaining: plan.moves.length - 1, solved: plan.solved };
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
