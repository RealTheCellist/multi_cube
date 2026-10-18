import { describe, expect, it } from "vitest";
import { solveRoyalPyraminxOffThread } from "./royalSolveWorkerClient";
import { ALL_ROYAL_MOVE_NAMES, applyRoyalMove } from "./royalPyraminxMoves";
import { createSolvedRoyalState, isSolvedRoyal, type RoyalPyraminxState } from "./royalPyraminxState";
import { solveRoyalAxialOnly, solveRoyalAxialOnlyFast, solveRoyalAxialOnlyWasm, solveRoyalBaseline, solveRoyalPyraminx } from "./royalPyraminxSolver";

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function randomScramble(len: number, rng: () => number): string[] {
  const moves: string[] = [];
  let last = "";
  for (let i = 0; i < len; i++) {
    let m: string;
    do {
      m = ALL_ROYAL_MOVE_NAMES[Math.floor(rng() * ALL_ROYAL_MOVE_NAMES.length)];
    } while (m === last);
    last = m;
    moves.push(m);
  }
  return moves;
}

function scrambledState(seed: number, len: number): RoyalPyraminxState {
  const rng = mulberry32(seed);
  let state = createSolvedRoyalState();
  for (const m of randomScramble(len, rng)) state = applyRoyalMove(state, m);
  return state;
}

function applyAll(state: RoyalPyraminxState, moves: readonly string[]): RoyalPyraminxState {
  let cur = state;
  for (const m of moves) cur = applyRoyalMove(cur, m);
  return cur;
}


// Vitest/Node has no Worker, so this exercises the client's documented
// fallback (same solveRoyalPyraminx, on the calling thread). The real Worker
// path is covered by the live-browser check noted in the commit message.
describe("solveRoyalPyraminxOffThread without a Worker", () => {
  it("falls back to the main thread and returns a solving sequence", async () => {
    expect(typeof Worker).toBe("undefined");
    for (const seed of [1, 2]) {
      const state = scrambledState(seed, 8);
      const moves = await solveRoyalPyraminxOffThread(state, 8, 500_000);
      expect(isSolvedRoyal(applyAll(state, moves)), `seed ${seed}`).toBe(true);
    }
  }, 120_000);
});
