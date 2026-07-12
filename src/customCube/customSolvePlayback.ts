import { Alg } from "cubing/alg";
import type { KPattern, KPuzzle } from "cubing/kpuzzle";
import { cube2x2x2, cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve2x2x2 } from "cubing/search";
import { computeSolveHint, type SolveHint } from "../solvePlayback";
import type { CustomCubeScene } from "./CustomCubeScene";
import { FACE_TURNS, outerLayerCoordinate, type Face } from "./cubeState";
import { solveCenters } from "./fourByFourCenters";
import { solveEdgePairing } from "./fourByFourEdges";
import { PARITY_NUDGE_COUNT, applyParityNudge, solveReduced } from "./fourByFourReduction";

const MOVE_ANIMATION_MS = 350;
const HOLD_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Solves for the scene's current pattern and previews just its first move:
 * turns the layer forward, holds briefly, then turns it back and reverts --
 * a pure preview that leaves the actual cube state (and move history)
 * untouched, mirroring computeAndPlayNextSolveMove for the PG3D player.
 * Only the 2x2x2 and 3x3x3 have a solver available -- see cubeState.ts for
 * why a 4x4x4 doesn't have a single well-defined letter scheme to solve
 * toward, and cubing/search doesn't ship a 4x4x4 solver at all.
 */
export async function previewNextSolveMove(scene: CustomCubeScene): Promise<SolveHint> {
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
  const target = canonicalSign * dirSign * magnitude;

  scene.beginTurn(axis, layer);
  await animateProgress(scene, 0, target, MOVE_ANIMATION_MS);
  await sleep(HOLD_MS);
  await animateProgress(scene, target, 0, MOVE_ANIMATION_MS);
  scene.endTurn(null);

  return hint;
}

export interface FourByFourSolveResult {
  solved: boolean;
}

/**
 * Fully solves a 4x4x4 in place (unlike previewNextSolveMove for the
 * 2x2x2/3x3x3, which only previews one move and reverts -- there's no
 * letter-notation move history to hint against for a 4x4x4, see
 * cubeState.ts, so this commits the whole solve directly instead). Runs
 * centers, then edge pairing, then reduces to a 3x3x3 solve, each phase
 * mutating the scene's cubies array directly and re-syncing meshes
 * afterward. Can legitimately take up to a couple of minutes for the edge
 * pairing's tail search on a hard scramble.
 *
 * About half of scrambles reduce to a pattern only reachable via a genuine
 * 4x4x4 move (OLL/PLL parity), which the 3x3x3 solver alone can't resolve
 * -- when that happens, this nudges the parity with a small 4x4-only move
 * and re-runs edge pairing + centers to clean up what it disturbs, then
 * retries, cycling through a few nudge variants (see
 * fourByFourReduction.ts). If every variant still fails -- or edge pairing
 * itself never converges in the first place -- that's reported honestly
 * via `solved: false` rather than pretending to have finished.
 */
export async function autoSolveFourByFour(scene: CustomCubeScene): Promise<FourByFourSolveResult> {
  const cubies = scene.getCubies();

  // Edges first: pairing doesn't care about center state, but its tail
  // phase can disturb centers (see fourByFourEdges.ts) -- so solving
  // centers first would just get undone. Centers only once, after, since
  // nothing downstream of it (the reduction solve's single-outer-layer
  // turns) ever touches centers again.
  const edgeResult = await solveEdgePairing(cubies, 100000);
  scene.syncAllMeshes();
  if (!edgeResult.solved) return { solved: false };

  const centerResult = solveCenters(cubies, 15000);
  scene.syncAllMeshes();
  if (!centerResult.solved) return { solved: false };

  for (let attempt = 0; attempt <= PARITY_NUDGE_COUNT; attempt++) {
    const reductionResult = await solveReduced(cubies, scene.gridSize);
    scene.syncAllMeshes();
    if (reductionResult.solved) return { solved: true };
    if (attempt === PARITY_NUDGE_COUNT) break;

    applyParityNudge(cubies, attempt);
    scene.syncAllMeshes();
    const repairEdges = await solveEdgePairing(cubies, 60000);
    scene.syncAllMeshes();
    if (!repairEdges.solved) continue;
    const repairCenters = solveCenters(cubies, 15000);
    scene.syncAllMeshes();
    if (!repairCenters.solved) continue;
  }
  return { solved: false };
}
