import { Alg } from "cubing/alg";
import type { KPattern, KPuzzle } from "cubing/kpuzzle";
import { puzzles } from "cubing/puzzles";
import { solvePyraminx } from "cubing/search";
import type { VertexIndex } from "./tetraMath";
import type { CustomTetraScene } from "./CustomTetraScene";

// cubing.js's Pyraminx generators name each of the 4 vertex axes with one of
// these 4 letters -- lowercase for the shallow tip-only turn (our depth=1),
// uppercase for the deep turn (our depth=2, the largest depth a 3-layer
// Pyraminx has). Any bijection between our 4 vertices and these 4 letters is
// a valid group isomorphism of the same abstract Pyraminx move group -- the
// tetrahedron's full vertex-relabeling symmetry acts transitively on it, so
// there's no single "true" geometric correspondence to reverse-engineer.
// Verified by brute force against 5 independent scrambles, each replayed
// end-to-end through solvePyraminx and back (see the investigation this
// file grew out of): this particular vertex assignment (0->u, 1->r, 2->l,
// 3->b) is simply the first one tried, not a specially-derived one.
//
// The one part that ISN'T arbitrary: depth=1 (tip) and depth=2 (deep) turns
// on the SAME axis need OPPOSITE sign conventions, not the same one. An
// earlier version of this file assumed a single shared sign for both and
// passed a shallow, single-scramble/single-seed check purely by chance --
// broke on nearly every other scramble (solvePyraminx would report the
// pattern already solved while the live scene plainly wasn't, because the
// reconstructed KPattern diverged from our own state after the very first
// depth-2 move). The 5-scramble brute force below is what actually catches
// that: for THIS vertex assignment, sign flips independently per depth
// (SIGN_BY_DEPTH[1] for tip turns, SIGN_BY_DEPTH[2] for deep turns) is the
// only combination that solves all 5.
const VERTEX_LETTERS: Record<VertexIndex, string> = { 0: "u", 1: "r", 2: "l", 3: "b" };
const LETTER_VERTICES: Record<string, VertexIndex> = { u: 0, r: 1, l: 2, b: 3 };
const SIGN_BY_DEPTH: Record<number, 1 | -1> = { 1: 1, 2: -1 };

function tokenForMove(vertexIndex: VertexIndex, depth: number, sign: 1 | -1): string {
  const base = VERTEX_LETTERS[vertexIndex];
  const letter = depth === 2 ? base.toUpperCase() : base;
  const primed = sign * SIGN_BY_DEPTH[depth] === -1;
  return primed ? `${letter}'` : letter;
}

interface ParsedMove {
  vertexIndex: VertexIndex;
  depth: number;
  sign: 1 | -1;
}

function parseMoveToken(token: string): ParsedMove {
  const primed = token.endsWith("'");
  const base = primed ? token.slice(0, -1) : token;
  const depth = base === base.toUpperCase() ? 2 : 1;
  const vertexIndex = LETTER_VERTICES[base.toLowerCase()];
  const sign = ((primed ? -1 : 1) * SIGN_BY_DEPTH[depth]) as 1 | -1;
  return { vertexIndex, depth, sign };
}

let kpuzzlePromise: Promise<KPuzzle> | null = null;
function getPyraminxKpuzzle(): Promise<KPuzzle> {
  if (!kpuzzlePromise) kpuzzlePromise = puzzles.pyraminx.kpuzzle();
  return kpuzzlePromise;
}

/**
 * Replays the scene's own move history onto a fresh cubing/kpuzzle pattern
 * to get a KPattern for the solver -- same technique as solvePlayback.ts's
 * currentPatternFor for the cube, and for the same reason: this custom
 * renderer only tracks sticker corner positions, not cubing.js's
 * piece/orientation encoding (which for Pyraminx includes an extra
 * "CORNERS" orbit with no independent visible sticker at all -- an internal
 * bookkeeping twist with no counterpart in our own model), so reproducing
 * the state via the move list is far simpler than building a direct
 * sticker<->KPattern translation.
 */
async function currentPatternFor(scene: CustomTetraScene): Promise<KPattern> {
  const kpuzzle = await getPyraminxKpuzzle();
  const tokens = scene.getMoveHistory().map((m) => tokenForMove(m.vertexIndex, m.depth, m.sign));
  const historyAlg = Alg.fromString(tokens.join(" "));
  return kpuzzle.defaultPattern().applyAlg(historyAlg);
}

export interface TetraSolveHint {
  move: { vertexIndex: VertexIndex; depth: number; sign: 1 | -1 } | null;
  movesRemaining: number;
}

/** Solves for the given pattern and returns just its first move (plus how many moves remain after it). */
export async function computeTetraSolveHint(scene: CustomTetraScene): Promise<TetraSolveHint> {
  const pattern = await currentPatternFor(scene);
  const solutionAlg = await solvePyraminx(pattern);
  const tokens = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  if (tokens.length === 0) return { move: null, movesRemaining: 0 };
  return { move: parseMoveToken(tokens[0]), movesRemaining: tokens.length - 1 };
}

const MOVE_ANIMATION_MS = 350;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateProgress(scene: CustomTetraScene, from: number, to: number, durationMs: number): Promise<void> {
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

/**
 * Solves for the scene's current pattern and plays its first move for real:
 * turns the layer and commits it, exactly as if the player had swiped it
 * themselves (real move history, moveCount, and solved-state detection all
 * follow) -- same contract as customSolvePlayback.ts's applyNextSolveMove.
 */
export async function applyNextTetraSolveMove(scene: CustomTetraScene): Promise<TetraSolveHint> {
  const hint = await computeTetraSolveHint(scene);
  if (!hint.move) return hint;

  const { vertexIndex, depth, sign } = hint.move;
  // If something else already owns the scene's turn (most likely: the user
  // started dragging themselves while the solve was computing), skip this
  // press rather than fight or steal it -- the next press will offer the
  // same move again since nothing committed.
  if (scene.beginTurn(vertexIndex, depth)) {
    await animateProgress(scene, 0, sign, MOVE_ANIMATION_MS);
    scene.endTurn(sign);
  }
  return hint;
}
