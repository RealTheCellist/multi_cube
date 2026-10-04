import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { areCornersSolved, solveCorners } from "./gigaminxSolver";

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

describe("gigaminxSolver Phase 1: corners", () => {
  it.each([1, 2, 3, 4, 5])("seed %i: corners solve, replay-verified", (seed) => {
    const rng = mulberry32(seed * 13 + 7);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

    const t0 = Date.now();
    const { moves, trace } = solveCorners(scrambled);
    const elapsedMs = Date.now() - t0;

    expect(trace.succeeded, `corners failed: ${trace.error}`).toBe(true);
    const replayed = applySeq(scrambled, moves);
    expect(areCornersSolved(replayed)).toBe(true);
    console.log(`seed ${seed}: ${elapsedMs}ms, rounds=${trace.rounds}, moves=${moves.length}`);
  }, 300_000);
});
