import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { solveFirstLayer, isFirstLayerSolved, solveUpperEdges, isUpperEdgesSolved } from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";
import { FACE_VERTEX_INDICES } from "./dodecaMath";

// See megaminxSolverCross.test.ts's own dev notes on why each phase now
// lives in its own file.
function faceZeroCornersCorrect(state: MegaminxState): boolean {
  return FACE_VERTEX_INDICES[0].every((pos) => state.cornerPerm[pos] === pos && state.cornerOrient[pos] === 0);
}

describe("solveUpperEdges (Phase 2a)", () => {
  // Uses a JOINT (2-condition) setup search, not a single-anchor one --
  // see this module's own dev notes on findSafeApplication for why a
  // single-anchor search is only ever coincidentally correct (a genuinely
  // misplaced edge left every one of 1440 tried (commutator, anchor)
  // pairs at exactly the same wrong count, never fewer, before this fix).
  it("fully solves the first layer + upper-upper edges for 10 different scrambles, verified by replaying the found solution", () => {
    let solvedCount = 0;
    const failures: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const turns = randomMegaminxScramble(40, mulberry32(seed));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      try {
        const layerSolution = solveFirstLayer(scrambled);
        let s = scrambled;
        for (const t of layerSolution) s = applyMegaminxMove(s, t.face, t.sign);
        const edgeSolution = solveUpperEdges(s);
        for (const t of edgeSolution) s = applyMegaminxMove(s, t.face, t.sign);
        if (isFirstLayerSolved(s) && faceZeroCornersCorrect(s) && isUpperEdgesSolved(s)) solvedCount++;
        else failures.push(seed);
      } catch {
        failures.push(seed);
      }
    }
    console.log("solveUpperEdges: solved", solvedCount, "/ 10, failed seeds:", failures);
    expect(solvedCount).toBe(10);
  }, 900000);

  it("returns an empty solution when the upper edges are already solved", () => {
    expect(solveUpperEdges(solvedMegaminxState())).toEqual([]);
  });
});
