import { describe, it, expect } from "vitest";
import { applyGigaminxMove, solvedGigaminxState, randomGigaminxScramble, applyGigaminxScramble, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { FACE_INDICES } from "./dodecaMath";

function isValidPerm(arr: ArrayLike<number>, n: number): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (v < 0 || v >= n || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function statesEqual(a: GigaminxState, b: GigaminxState): boolean {
  const keys: (keyof GigaminxState)[] = ["cornerPerm", "cornerOrient", "wingPerm", "wingOrient", "innerCornerPerm", "edgeBridgePerm", "centerBridgePerm"];
  return keys.every((k) => Array.from(a[k]).every((v, i) => v === (b[k] as any)[i]));
}

describe("gigaminxState", () => {
  it("every single move produces valid permutations on every orbit", () => {
    const solved = solvedGigaminxState();
    for (const face of FACE_INDICES) {
      for (const depth of [1, 2, 3, 4] as const) {
        for (const sign of [1, -1] as const) {
          const r = applyGigaminxMove(solved, face, sign, depth);
          expect(isValidPerm(r.cornerPerm, 20), `corner perm invalid for face=${face} depth=${depth} sign=${sign}`).toBe(true);
          expect(isValidPerm(r.wingPerm, 60), `wing perm invalid for face=${face} depth=${depth} sign=${sign}`).toBe(true);
          expect(isValidPerm(r.innerCornerPerm, 60), `innerCorner perm invalid for face=${face} depth=${depth} sign=${sign}`).toBe(true);
          expect(isValidPerm(r.edgeBridgePerm, 60), `edgeBridge perm invalid for face=${face} depth=${depth} sign=${sign}`).toBe(true);
          expect(isValidPerm(r.centerBridgePerm, 60), `centerBridge perm invalid for face=${face} depth=${depth} sign=${sign}`).toBe(true);
          // orientation ranges
          expect(Array.from(r.cornerOrient).every((o) => o >= 0 && o < 3)).toBe(true);
          expect(Array.from(r.wingOrient).every((o) => o >= 0 && o < 2)).toBe(true);
        }
      }
    }
  });

  it("applying a move 5 times (same face/depth/sign) returns to solved (72deg x5 = 360deg)", () => {
    const solved = solvedGigaminxState();
    for (const face of [0, 5, 11] as const) {
      for (const depth of [1, 2, 3, 4] as const) {
        let s = solved;
        for (let i = 0; i < 5; i++) s = applyGigaminxMove(s, face, 1, depth);
        expect(statesEqual(s, solved), `face=${face} depth=${depth} did not return to solved after 5 repeats`).toBe(true);
      }
    }
  });

  it("applying a move then its exact inverse (opposite sign) returns to solved", () => {
    const solved = solvedGigaminxState();
    for (const face of FACE_INDICES) {
      for (const depth of [1, 2, 3, 4] as const) {
        const s = applyGigaminxMove(applyGigaminxMove(solved, face, 1, depth), face, -1, depth);
        expect(statesEqual(s, solved), `face=${face} depth=${depth} forward+inverse did not return to solved`).toBe(true);
      }
    }
  });

  it("a long random scramble is reversible via the exact reverse move sequence", () => {
    const rng = mulberry32(12345);
    const scramble = randomGigaminxScramble(60, rng);
    const solved = solvedGigaminxState();
    const scrambled = applyGigaminxScramble(solved, scramble);
    const reverse: GigaminxTurn[] = [...scramble].reverse().map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1, depth: t.depth }));
    const back = applyGigaminxScramble(scrambled, reverse);
    expect(statesEqual(back, solved)).toBe(true);
  });

  it("a non-trivial scramble is NOT solved (sanity: moves actually do something)", () => {
    const rng = mulberry32(777);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
    const solved = solvedGigaminxState();
    expect(statesEqual(scrambled, solved)).toBe(false);
  });
});
