import { describe, expect, it } from "vitest";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import {
  solveCross,
  isCrossSolved,
  solveFirstLayerCorners,
  solveFirstLayer,
  isFirstLayerSolved,
  solveUpperEdges,
  isUpperEdgesSolved,
  solveMiddleLayer,
  isMiddleCornersSolved,
  isEquatorialEdgesSolved,
  solveLowerLowerEdges,
  isLowerLowerEdgesSolved,
  solveLastLayer,
  solveMegaminx,
  isMegaminxFullySolved,
} from "./megaminxSolver";
import { mulberry32 } from "./dodecaState";
import { FACE_VERTEX_INDICES } from "./dodecaMath";

// Independent re-check of "face 0's 5 corners are solved", against
// perm/orient directly rather than reusing isFirstLayerSolved's own
// internal key-building logic.
function faceZeroCornersCorrect(state: MegaminxState): boolean {
  return FACE_VERTEX_INDICES[0].every((pos) => state.cornerPerm[pos] === pos && state.cornerOrient[pos] === 0);
}

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

describe("solveLastLayer (Phase 3b+3c: bottom corners + bottom edges)", () => {
  // Same alternating technique as solveMiddleLayer, for the same reason:
  // exhaustively confirmed there is NO commutator at this module's search
  // depth whose support avoids all 20 corners while touching only the
  // last layer's own edges, so the edge step must run with the bottom
  // corners temporarily unfixed, then the corner step re-run to restore
  // them, ping-ponging until both hold at once. Full 10-seed, all-phases
  // coverage of this exact code path lives in solveMegaminx's own test
  // below (its public entry point runs through this phase last), so this
  // describe block only covers solveLastLayer's own edge case.
  it("returns an empty solution when the last layer is already solved", () => {
    expect(solveLastLayer(solvedMegaminxState())).toEqual([]);
  });
});

describe("solveMegaminx (full 7-phase pipeline)", () => {
  it("fully solves the entire megaminx for 10 different scrambles via the single combined entry point, verified by replaying the found solution", () => {
    let solvedCount = 0;
    const failures: number[] = [];
    const lengths: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
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
    console.log("solveMegaminx: solved", solvedCount, "/ 10, failed seeds:", failures, "solution lengths:", lengths);
    expect(solvedCount).toBe(10);
  }, 5400000);

  it("returns an empty solution when the megaminx is already solved", () => {
    expect(solveMegaminx(solvedMegaminxState())).toEqual([]);
  });

  it("isMegaminxFullySolved correctly identifies the solved state", () => {
    expect(isMegaminxFullySolved(solvedMegaminxState())).toBe(true);
  });
});
