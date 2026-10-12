import { describe, it, expect } from "vitest";
import {
  solvedMasterKilominxState,
  applyMasterKilominxScramble,
  applyMasterKilominxMove,
  randomMasterKilominxScramble,
} from "./masterKilominxState";
import { solveMasterKilominx, isMasterKilominxFullySolved } from "./masterKilominxSolver";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("masterKilominxSolver", () => {
  it(
    "fully solves 10 independent scrambles, verified by replaying the found solution",
    () => {
      for (let seed = 1; seed <= 10; seed++) {
        const rng = mulberry32(seed);
        const scramble = randomMasterKilominxScramble(40, rng);
        const scrambled = applyMasterKilominxScramble(solvedMasterKilominxState(), scramble);
        const solution = solveMasterKilominx(scrambled);
        const result = solution.reduce((s, t) => applyMasterKilominxMove(s, t.face, t.sign), scrambled);
        expect(isMasterKilominxFullySolved(result), `seed=${seed} not solved after ${solution.length} moves`).toBe(true);
      }
    },
    120_000,
  );

  it("already-solved state needs zero moves", () => {
    const solution = solveMasterKilominx(solvedMasterKilominxState());
    expect(solution.length).toBe(0);
  });
});
