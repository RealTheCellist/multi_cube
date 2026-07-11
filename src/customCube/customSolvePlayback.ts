import { Alg } from "cubing/alg";
import type { KPuzzle } from "cubing/kpuzzle";
import { cube3x3x3 } from "cubing/puzzles";
import { computeSolveHint, type SolveHint } from "../solvePlayback";
import type { CustomCubeScene } from "./CustomCubeScene";
import { FACE_TURNS, type Face } from "./cubeState";

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

let kpuzzlePromise: Promise<KPuzzle> | null = null;
function getKpuzzle(): Promise<KPuzzle> {
  if (!kpuzzlePromise) kpuzzlePromise = cube3x3x3.kpuzzle();
  return kpuzzlePromise;
}

/**
 * Replays the scene's own move history onto a fresh cubing/kpuzzle pattern
 * to get a KPattern for the solver -- this custom renderer never talks to
 * cubing.js's piece/orientation encoding directly, so reproducing the exact
 * same state via the move list (rather than reading it out of the scene) is
 * the simplest way to hand off to the shared solver.
 */
async function currentPatternFor(scene: CustomCubeScene) {
  const kpuzzle = await getKpuzzle();
  const historyAlg = Alg.fromString(scene.getMoveHistory().join(" "));
  return kpuzzle.defaultPattern().applyAlg(historyAlg);
}

/**
 * Solves for the scene's current pattern and previews just its first move:
 * turns the layer forward, holds briefly, then turns it back and reverts --
 * a pure preview that leaves the actual cube state (and move history)
 * untouched, mirroring computeAndPlayNextSolveMove for the PG3D player.
 */
export async function previewNextSolveMove(scene: CustomCubeScene): Promise<SolveHint> {
  // The solver (and the move-history letter notation it reads) only exists
  // for the 3x3x3 -- see cubeState.ts. The UI already disables the solver
  // button for other sizes; this is just a defensive backstop.
  if (scene.gridSize !== 3) return { move: null, movesRemaining: 0 };
  const pattern = await currentPatternFor(scene);
  const hint = await computeSolveHint(pattern);
  if (!hint.move) return hint;

  const token = hint.move;
  const face = token[0] as Face;
  const suffix = token.slice(1);
  const { axis, layer, sign: canonicalSign } = FACE_TURNS[face];
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
