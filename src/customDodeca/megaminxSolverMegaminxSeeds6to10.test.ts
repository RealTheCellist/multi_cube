import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState } from "./megaminxState";
import { solveMegaminx, isMegaminxFullySolved } from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";

// See megaminxSolverMegaminxSeeds1to5.test.ts's own dev notes for why
// solveMegaminx's own 10-seed test is split across two files.
describe("solveMegaminx (full 7-phase pipeline, seeds 6-10)", () => {
  it("fully solves the entire megaminx for 5 different scrambles via the single combined entry point, verified by replaying the found solution", () => {
    let solvedCount = 0;
    const failures: number[] = [];
    const lengths: number[] = [];
    for (let seed = 6; seed <= 10; seed++) {
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
    console.log("solveMegaminx (seeds 6-10): solved", solvedCount, "/ 5, failed seeds:", failures, "solution lengths:", lengths);
    expect(solvedCount).toBe(5);
  }, 5400000);
});
