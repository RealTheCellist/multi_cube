import { describe, it, expect } from "vitest";
import {
  solvedMasterKilominxState,
  applyMasterKilominxMove,
  applyMasterKilominxScramble,
  randomMasterKilominxScramble,
  isMasterKilominxSolved,
  MOVE_TABLE,
} from "./masterKilominxState";
import { FACE_INDICES } from "./dodecaMath";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("masterKilominxState", () => {
  it("module loads without throwing (deriveMove succeeds for all 24 raw moves)", () => {
    expect(MOVE_TABLE.length).toBe(12);
  });

  it("solved state reports solved", () => {
    expect(isMasterKilominxSolved(solvedMasterKilominxState())).toBe(true);
  });

  it("every move followed by its own inverse (same face, opposite sign) returns to solved", () => {
    for (const face of FACE_INDICES) {
      const once = applyMasterKilominxMove(solvedMasterKilominxState(), face, 1);
      const back = applyMasterKilominxMove(once, face, -1);
      expect(isMasterKilominxSolved(back)).toBe(true);
    }
  });

  it("5 repetitions of the same move return to solved (each face turn is a real 1/5 rotation)", () => {
    for (const face of FACE_INDICES) {
      let s = solvedMasterKilominxState();
      for (let i = 0; i < 5; i++) s = applyMasterKilominxMove(s, face, 1);
      expect(isMasterKilominxSolved(s)).toBe(true);
    }
  });

  it("a random scramble, replayed with inverted/reversed moves, returns to solved (10 seeds)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = mulberry32(seed);
      const scramble = randomMasterKilominxScramble(30, rng);
      const scrambled = applyMasterKilominxScramble(solvedMasterKilominxState(), scramble);
      const inverse = [...scramble].reverse().map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1 }));
      const restored = applyMasterKilominxScramble(scrambled, inverse);
      expect(isMasterKilominxSolved(restored)).toBe(true);
    }
  });

  it("permutations are valid bijections and orientations stay in range after a scramble", () => {
    const rng = mulberry32(42);
    const scrambled = applyMasterKilominxScramble(solvedMasterKilominxState(), randomMasterKilominxScramble(50, rng));
    expect(new Set(scrambled.cornerPerm).size).toBe(20);
    expect(new Set(scrambled.edgePerm).size).toBe(30);
    expect([...scrambled.cornerOrient].every((o) => o >= 0 && o <= 2)).toBe(true);
    expect([...scrambled.edgeOrient].every((o) => o >= 0 && o <= 1)).toBe(true);
  });
});
