import { describe, it, expect } from "vitest";
import { buildSolvedDodeca, applyRawFifthTurn, isSolved as isDodecaSolved, generateRandomFifthTurns } from "./dodecaState";
import { dodecaStateToKilominxState, kilominxTurnToRawTurn } from "./kilominxState";
import { solveKilominx } from "./kilominxSolver";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// N=2 Kilominx: solveRemaining's bidirectional-search-per-piece architecture
// is much slower than N=3/4/5's commutator+WASM approach (~7-10s per
// scramble, confirmed by direct per-phase timing -- not a hang, just slow),
// so this gets a generous per-seed timeout, not the 60s shared budget the
// other sizes' 5-seed loops use.
describe("N=2 state-scene bridge round-trip (depth=1-only scrambles)", () => {
  for (let seed = 1; seed <= 5; seed++) {
    it(
      `seed=${seed}: solves through the real scene`,
      () => {
        const rng = mulberry32(seed);
        const scene = buildSolvedDodeca(2);
        for (const t of generateRandomFifthTurns(2, 20, rng)) applyRawFifthTurn(scene, t.faceIndex, t.depth, t.sign);
        const solverState = dodecaStateToKilominxState(scene);
        const solution = solveKilominx(solverState);
        for (const turn of solution) {
          const raw = kilominxTurnToRawTurn(turn);
          applyRawFifthTurn(scene, raw.faceIndex, raw.depth, raw.sign);
        }
        expect(isDodecaSolved(scene)).toBe(true);
      },
      30_000,
    );
  }
});
