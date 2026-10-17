import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { solveAxialLargeOrbits, setRoyalOrbitWasm } from "./royalPyraminxCommutators";
import { installRoyalOrbitWasmFromBytes } from "./royalPyraminxSolver";
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


// Regression + equivalence for the Rust/wasm port of the axial fallback's
// orbit2+5 meet-in-the-middle search (wasm-orbit/): same algorithm and
// expansion order as the JS version, so it must return the same moves.
describe("royalOrbitSolver.wasm vs the plain-JS orbit2+5 search", () => {
  const bytes = readFileSync(new URL("../../../public/royalOrbitSolver.wasm", import.meta.url));

  it("returns identical moves and a correct state on scrambles of several lengths", () => {
    const cases = [{ seed: 36, len: 20 }, { seed: 8, len: 20 }, { seed: 3, len: 20 }, { seed: 12, len: 15 }, { seed: 5, len: 10 }, { seed: 9, len: 6 }, { seed: 77, len: 25 }];
    for (const c of cases) {
      const st = scrambledState(c.seed * 7 + 1, c.len);
      setRoyalOrbitWasm(null);
      const js = solveAxialLargeOrbits(st);
      installRoyalOrbitWasmFromBytes(bytes);
      const wasm = solveAxialLargeOrbits(st);
      setRoyalOrbitWasm(null);
      expect(wasm.moves, `seed ${c.seed} len ${c.len}`).toEqual(js.moves);
      // replaying the wasm moves from the scramble must reach the state it reports
      expect(applyAll(st, wasm.moves).axial, `seed ${c.seed}`).toEqual(wasm.state.axial);
    }
  }, 300_000);
});
