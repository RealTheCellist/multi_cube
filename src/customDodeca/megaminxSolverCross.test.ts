import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState } from "./megaminxState";
import { solveCross, isCrossSolved } from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";

// Split into its own file (see megaminxSolverMegaminxSeeds1to5.test.ts's own
// dev notes for why): vitest schedules whole FILES across its own worker
// pool, so a phase this cheap sits comfortably on a spare core alongside
// the heavier phases below instead of adding to one single file's own
// runtime the way one big megaminxSolver.test.ts used to.
describe("solveCross (Phase 1-A)", () => {
  it("solves face 0's 5 edges for 10 different scrambles, verified by replaying the found solution", () => {
    const depths: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const turns = randomMegaminxScramble(40, mulberry32(seed));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      const solution = solveCross(scrambled);
      depths.push(solution.length);
      let s = scrambled;
      for (const t of solution) s = applyMegaminxMove(s, t.face, t.sign);
      expect(isCrossSolved(s), `seed=${seed}`).toBe(true);
    }
    console.log("cross solution depths:", depths, "max:", Math.max(...depths));
  }, 120000);

  it("returns an empty solution when the cross is already solved", () => {
    expect(solveCross(solvedMegaminxState())).toEqual([]);
  });
});
