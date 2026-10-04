import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { areCornersSolved, areWingsSolved, solveCornersAndWings } from "./gigaminxSolver";

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

describe("gigaminxSolver Phase 1+2: corners and wings", () => {
  it.each(seeds)("seed %i: corners+wings solve, replay-verified", (seed) => {
    const rng = mulberry32(seed * 13 + 7);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

    const t0 = Date.now();
    const { moves, cornersTrace, wingsTrace } = solveCornersAndWings(scrambled);
    const elapsedMs = Date.now() - t0;

    expect(cornersTrace.succeeded, `corners failed: ${cornersTrace.error}`).toBe(true);
    expect(wingsTrace.succeeded, `wings failed: ${wingsTrace.error}`).toBe(true);
    const replayed = applySeq(scrambled, moves);
    expect(areCornersSolved(replayed)).toBe(true);
    expect(areWingsSolved(replayed)).toBe(true);
    console.log(`seed ${seed}: ${elapsedMs}ms, cornerMoves=${cornersTrace.movesEmitted} wingMoves=${wingsTrace.movesEmitted}`);
  }, 7_000_000);
});
