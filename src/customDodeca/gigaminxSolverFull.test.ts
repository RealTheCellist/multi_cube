import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { areCornersSolved, areWingsSolved, areInnerCornersSolved, areEdgeBridgesSolved, areCenterBridgesSolved, solveFullGigaminx } from "./gigaminxSolver";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function applySeq(state: GigaminxState, seq: readonly GigaminxTurn[]): GigaminxState {
  let s = state;
  for (const t of seq) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
  return s;
}

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1];

describe("gigaminxSolver Phase 1-5: full solve (corners, wings, inner corners, edge bridges, center bridges)", () => {
  it.each(seeds)("seed %i: full gigaminx solve, replay-verified", (seed) => {
    const rng = mulberry32(seed * 13 + 7);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

    const t0 = Date.now();
    const { moves, cornersTrace, wingsTrace, innerCornersTrace, edgeBridgesTrace, centerBridgesTrace } = solveFullGigaminx(scrambled);
    const elapsedMs = Date.now() - t0;

    expect(cornersTrace.succeeded, `corners failed: ${cornersTrace.error}`).toBe(true);
    expect(wingsTrace.succeeded, `wings failed: ${wingsTrace.error}`).toBe(true);
    expect(innerCornersTrace.succeeded, `innerCorners failed: ${innerCornersTrace.error}`).toBe(true);
    expect(edgeBridgesTrace.succeeded, `edgeBridges failed: ${edgeBridgesTrace.error}`).toBe(true);
    expect(centerBridgesTrace.succeeded, `centerBridges failed: ${centerBridgesTrace.error}`).toBe(true);
    const replayed = applySeq(scrambled, moves);
    expect(areCornersSolved(replayed)).toBe(true);
    expect(areWingsSolved(replayed)).toBe(true);
    expect(areInnerCornersSolved(replayed)).toBe(true);
    expect(areEdgeBridgesSolved(replayed)).toBe(true);
    expect(areCenterBridgesSolved(replayed)).toBe(true);
    console.log(
      `seed ${seed}: ${elapsedMs}ms, cornerMoves=${cornersTrace.movesEmitted} wingMoves=${wingsTrace.movesEmitted} innerCornerMoves=${innerCornersTrace.movesEmitted} edgeBridgeMoves=${edgeBridgesTrace.movesEmitted} centerBridgeMoves=${centerBridgesTrace.movesEmitted}`,
    );
  }, 7_000_000);
});

// solveFullGigaminxStaged is the solve the app runs: corners and wings by the nested-commutator search, then the
// inner corners, edge bridges and center bridges by short 3-cycles. It must solve the whole puzzle, deliver its phases
// as chunks whose concatenation is the returned plan, and be far shorter than the all-nested solveFullGigaminx.
describe("solveFullGigaminxStaged", () => {
  it("solves completely, delivers phase chunks, and stays under 4,000 moves", async () => {
    const { solveFullGigaminxStaged } = await import("./gigaminxSolver");
    const { applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, applyGigaminxMove } = await import("./gigaminxState");
    let seed = 4242;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 4; i++) {
      const state = applyGigaminxScramble(solvedGigaminxState(), randomGigaminxScramble(20, rng));
      const chunks: unknown[][] = [];
      const plan = solveFullGigaminxStaged(state, (c) => chunks.push(c));
      expect(chunks.length).toBe(5);
      expect(chunks.flat()).toEqual(plan);
      let s = state;
      for (const t of plan) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
      expect(areCornersSolved(s) && areWingsSolved(s) && areInnerCornersSolved(s) && areEdgeBridgesSolved(s) && areCenterBridgesSolved(s)).toBe(true);
      expect(plan.length).toBeLessThan(4000);
    }
  }, 120_000);
});
