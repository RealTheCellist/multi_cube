import { Alg } from "cubing/alg";
import type { KPattern } from "cubing/kpuzzle";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";

export interface SolveHint {
  move: string | null;
  movesRemaining: number;
}

// An M/E/S middle-slice move changes which of the 6 CENTERS pieces sits in
// each slot — physically the same as doing an outer-layer move plus an
// implicit whole-cube rotation (e.g. M = R L' x'). cubing.js's built-in
// solver refuses to run unless centers are still in their original slots
// (see toReid333Struct in cubing/search), so once M/E/S has ever been used
// it throws instead of solving.
//
// The fix: reorient the pattern to one of the 24 possible cube orientations
// before solving (this is the same normalization cubing.js's own
// `experimentalIs3x3x3Solved({ ignorePuzzleOrientation: true })` uses
// internally, just reimplemented here against public APIs since that helper
// isn't exported). The solver's first move is then relative to that
// reoriented frame, not the cube as it actually sits — so instead of also
// surfacing the reorientation as an explicit "spin the whole cube" move
// (which the user has no swipe gesture for anyway), we brute-force which of
// the 18 ordinary single moves produces the same resulting pattern on the
// *real* current state, and hint that instead.
const ROTATION_ALGS = (() => {
  const bases = ["", "z", "x", "z'", "x'", "x2"];
  const ySteps = ["", "y", "y2", "y'"];
  const algs: Alg[] = [];
  for (const base of bases) {
    for (const step of ySteps) {
      algs.push(Alg.fromString(`${base} ${step}`.trim()));
    }
  }
  return algs;
})();

const SINGLE_MOVES = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"];

function orientationKey(pattern: KPattern): string {
  const centers = pattern.patternData["CENTERS"];
  return `${centers.pieces[0]},${centers.pieces[1]}`;
}

let orientationCache: Map<string, Alg> | null = null;

function getReorientAlg(pattern: KPattern): Alg {
  if (!orientationCache) {
    const cache = new Map<string, Alg>();
    const solved = pattern.kpuzzle.defaultPattern();
    for (const rotation of ROTATION_ALGS) {
      const key = orientationKey(solved.applyAlg(rotation));
      if (!cache.has(key)) cache.set(key, rotation.invert());
    }
    orientationCache = cache;
  }
  return orientationCache.get(orientationKey(pattern)) ?? Alg.fromString("");
}

// Finds the single ordinary move that's the real-frame equivalent of the
// solver's frame-shifted one: conjugate solverMove by reorientAlg (rotate,
// turn, rotate back) rather than just prepending the rotation, since a plain
// "rotate then turn" changes the pattern's own orientation too and would
// never match any single move applied directly to `pattern`.
function findEquivalentMove(pattern: KPattern, reorientAlg: Alg, solverMove: string): string {
  const target = pattern.applyAlg(reorientAlg).applyMove(solverMove).applyAlg(reorientAlg.invert());
  for (const candidate of SINGLE_MOVES) {
    if (pattern.applyMove(candidate).isIdentical(target)) return candidate;
  }
  return solverMove;
}

/**
 * Solves for the given pattern and returns just its first move (plus how
 * many moves remain after it).
 */
export async function computeSolveHint(currentPattern: KPattern): Promise<SolveHint> {
  const reorientAlg = getReorientAlg(currentPattern);
  const normalizedPattern = currentPattern.applyAlg(reorientAlg);
  const solutionAlg = await experimentalSolve3x3x3IgnoringCenters(normalizedPattern);
  const moves = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  if (moves.length === 0) return { move: null, movesRemaining: 0 };

  const move = findEquivalentMove(currentPattern, reorientAlg, moves[0]);
  return { move, movesRemaining: moves.length - 1 };
}
