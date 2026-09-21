import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { solveFirstLayer, isFirstLayerSolved, solveUpperEdges, isUpperEdgesSolved, solveMiddleLayer, isMiddleCornersSolved, isEquatorialEdgesSolved } from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";
import { FACE_VERTEX_INDICES } from "./dodecaMath";

// See megaminxSolverCross.test.ts's own dev notes on why each phase now
// lives in its own file.
function faceZeroCornersCorrect(state: MegaminxState): boolean {
  return FACE_VERTEX_INDICES[0].every((pos) => state.cornerPerm[pos] === pos && state.cornerOrient[pos] === 0);
}

describe("solveMiddleLayer (Phase 2b+2c: middle corners + equatorial edges)", () => {
  // Middle corners and equatorial edges are solved as ONE alternating
  // phase, not two strictly sequential ones: an equatorial-edge library
  // that also fixes all 10 middle corners tops out around 215 entries,
  // while freeing the middle corners more than triples that to ~720 --
  // measured directly (see this module's own dev notes on
  // equatorialEdgeLibrary) -- so the edge step must run with corners
  // temporarily unfixed, then the corner step re-run to restore them.
  it("fully solves the first layer + upper edges + middle layer for 3 different scrambles, verified by replaying the found solution", () => {
    let solvedCount = 0;
    const failures: number[] = [];
    for (let seed = 1; seed <= 3; seed++) {
      const turns = randomMegaminxScramble(40, mulberry32(seed));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      try {
        let s = scrambled;
        for (const solve of [solveFirstLayer, solveUpperEdges, solveMiddleLayer]) {
          const seq = solve(s);
          for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
        }
        if (isFirstLayerSolved(s) && faceZeroCornersCorrect(s) && isUpperEdgesSolved(s) && isMiddleCornersSolved(s) && isEquatorialEdgesSolved(s)) solvedCount++;
        else failures.push(seed);
      } catch {
        failures.push(seed);
      }
    }
    console.log("solveMiddleLayer: solved", solvedCount, "/ 3, failed seeds:", failures);
    expect(solvedCount).toBe(3);
  }, 1800000);

  it("returns an empty solution when the middle layer is already solved", () => {
    expect(solveMiddleLayer(solvedMegaminxState())).toEqual([]);
  });
});
