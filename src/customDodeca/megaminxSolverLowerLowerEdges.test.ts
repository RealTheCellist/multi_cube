import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState } from "./megaminxState";
import { solveFirstLayer, solveUpperEdges, solveMiddleLayer, isMiddleCornersSolved, isEquatorialEdgesSolved, solveLowerLowerEdges, isLowerLowerEdgesSolved } from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";

// See megaminxSolverCross.test.ts's own dev notes on why each phase now
// lives in its own file.
describe("solveLowerLowerEdges (Phase 3a)", () => {
  it("fully solves through the lower-lower edges for 3 different scrambles, verified by replaying the found solution", () => {
    let solvedCount = 0;
    const failures: number[] = [];
    for (let seed = 1; seed <= 3; seed++) {
      const turns = randomMegaminxScramble(40, mulberry32(seed));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      try {
        let s = scrambled;
        for (const solve of [solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges]) {
          const seq = solve(s);
          for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
        }
        if (isMiddleCornersSolved(s) && isEquatorialEdgesSolved(s) && isLowerLowerEdgesSolved(s)) solvedCount++;
        else failures.push(seed);
      } catch {
        failures.push(seed);
      }
    }
    console.log("solveLowerLowerEdges: solved", solvedCount, "/ 3, failed seeds:", failures);
    expect(solvedCount).toBe(3);
  }, 1800000);

  it("returns an empty solution when the lower-lower edges are already solved", () => {
    expect(solveLowerLowerEdges(solvedMegaminxState())).toEqual([]);
  });
});
