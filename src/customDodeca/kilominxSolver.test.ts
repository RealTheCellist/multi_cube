import { describe, expect, it } from "vitest";
import { applyKilominxScramble, randomKilominxScramble, solvedKilominxState, applyKilominxMove, type KilominxState } from "./kilominxState";
import { isFirstLayerSolved, solveFirstLayer, solveRemaining, isKilominxFullySolved } from "./kilominxSolver";
import { mulberry32 } from "./dodecaState";
import { FACE_VERTEX_INDICES } from "./dodecaMath";

// Independent re-check of "face 0's 5 corners are solved", implemented
// directly against perm/orient rather than re-using isFirstLayerSolved's
// own internal key-building logic, so this test isn't just checking the
// solver agrees with itself.
function faceZeroCornersCorrect(state: KilominxState): boolean {
  return FACE_VERTEX_INDICES[0].every((pos) => state.perm[pos] === pos && state.orient[pos] === 0);
}

describe("solveFirstLayer", () => {
  it("solves the first layer for 30 different scrambles, verified by replaying the found solution", () => {
    const depths: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed);
      const turns = randomKilominxScramble(20, rng);
      const scrambled = applyKilominxScramble(solvedKilominxState(), turns);
      const solution = solveFirstLayer(scrambled);
      depths.push(solution.length);
      let s = scrambled;
      for (const t of solution) s = applyKilominxMove(s, t.face, t.sign);
      expect(isFirstLayerSolved(s), `seed=${seed}`).toBe(true);
      expect(faceZeroCornersCorrect(s), `seed=${seed}`).toBe(true);
    }
    console.log("first-layer solution depths:", depths, "max:", Math.max(...depths));
  }, 60000);

  it("returns an empty solution when the first layer is already solved", () => {
    expect(solveFirstLayer(solvedKilominxState())).toEqual([]);
  });
});

describe("solveRemaining", () => {
  // A first (single-pass, all 15 non-face-0 positions at once) version
  // measured 27/30 (90%): 3 seeds always left behind a residual (as few
  // as 2-5 positions) that no library commutator could resolve, even
  // after substantially growing the library and trying every commutator's
  // inverse. Splitting into a proper Layer-by-Layer pass -- the 10
  // middle-layer positions first (face 0 fixed), then the 5 bottom-layer
  // positions (face 0 + middle fixed) -- fixed all 3 (see
  // solveRemaining's own dev notes for why: it changes what residual the
  // greedy search actually leaves behind, not just how it's cleaned up).
  it("fully solves 30 different scrambles, verified by replaying the found solution", () => {
    const failures: number[] = [];
    let solvedCount = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const turns = randomKilominxScramble(20, mulberry32(seed));
      const scrambled = applyKilominxScramble(solvedKilominxState(), turns);
      let s = scrambled;
      try {
        const layerSolution = solveFirstLayer(s);
        for (const t of layerSolution) s = applyKilominxMove(s, t.face, t.sign);
        const restSolution = solveRemaining(s);
        for (const t of restSolution) s = applyKilominxMove(s, t.face, t.sign);
        if (isKilominxFullySolved(s)) solvedCount++;
        else failures.push(seed);
      } catch {
        failures.push(seed);
      }
    }
    console.log("solveRemaining: solved", solvedCount, "/ 30, failed seeds:", failures);
    expect(solvedCount).toBe(30);
  }, 900000);
});
