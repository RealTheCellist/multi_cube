import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState } from "./megaminxState";
import { solveMegaminx, isMegaminxFullySolved } from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";

/**
 * solveMegaminx's own 10-seed full-pipeline test was, by a wide margin,
 * the single most expensive block in this suite (~130-140s on its own,
 * dwarfing every other phase's file) -- splitting it into two 5-seed
 * files (this one and megaminxSolverMegaminxSeeds6to10.test.ts) lets
 * vitest's own worker pool run both halves on separate cores alongside
 * every other phase file, instead of one file's runtime setting the
 * whole suite's floor regardless of how many cores are free. See
 * megaminxSolverCross.test.ts's own dev notes for why every phase now
 * gets its own file for the same reason.
 */
describe("solveMegaminx (full 7-phase pipeline, seeds 1-5)", () => {
  it("fully solves the entire megaminx for 5 different scrambles via the single combined entry point, verified by replaying the found solution", () => {
    let solvedCount = 0;
    const failures: number[] = [];
    const lengths: number[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const turns = randomMegaminxScramble(40, mulberry32(seed));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      try {
        const solution = solveMegaminx(scrambled);
        lengths.push(solution.length);
        let s = scrambled;
        for (const t of solution) s = applyMegaminxMove(s, t.face, t.sign);
        if (isMegaminxFullySolved(s)) solvedCount++;
        else failures.push(seed);
      } catch {
        failures.push(seed);
      }
    }
    console.log("solveMegaminx (seeds 1-5): solved", solvedCount, "/ 5, failed seeds:", failures, "solution lengths:", lengths);
    expect(solvedCount).toBe(5);
  }, 5400000);

  it("returns an empty solution when the megaminx is already solved", () => {
    expect(solveMegaminx(solvedMegaminxState())).toEqual([]);
  });

  it("isMegaminxFullySolved correctly identifies the solved state", () => {
    expect(isMegaminxFullySolved(solvedMegaminxState())).toBe(true);
  });
});
