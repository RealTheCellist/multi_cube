import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { solveFirstLayer, isFirstLayerSolved, solveFirstLayerCorners } from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";
import { FACE_VERTEX_INDICES } from "./dodecaMath";

// See megaminxSolverCross.test.ts's own dev notes on why each phase now
// lives in its own file.
function faceZeroCornersCorrect(state: MegaminxState): boolean {
  return FACE_VERTEX_INDICES[0].every((pos) => state.cornerPerm[pos] === pos && state.cornerOrient[pos] === 0);
}

describe("solveFirstLayer (Phase 1: cross then corners)", () => {
  it("fully solves the first layer for 10 different scrambles, verified by replaying the found solution", () => {
    let solvedCount = 0;
    const failures: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const turns = randomMegaminxScramble(40, mulberry32(seed));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      try {
        const solution = solveFirstLayer(scrambled);
        let s = scrambled;
        for (const t of solution) s = applyMegaminxMove(s, t.face, t.sign);
        if (isFirstLayerSolved(s) && faceZeroCornersCorrect(s)) solvedCount++;
        else failures.push(seed);
      } catch {
        failures.push(seed);
      }
    }
    console.log("solveFirstLayer: solved", solvedCount, "/ 10, failed seeds:", failures);
    expect(solvedCount).toBe(10);
  }, 600000);

  it("returns an empty corner solution when the first layer is already solved", () => {
    expect(solveFirstLayerCorners(solvedMegaminxState())).toEqual([]);
  });
});
