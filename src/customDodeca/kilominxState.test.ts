import { describe, expect, it } from "vitest";
import { applyKilominxMove, isKilominxSolved, MOVE_TABLE, randomKilominxScramble, solvedKilominxState } from "./kilominxState";
import { applyRawFifthTurn, buildSolvedDodeca, isSolved, mulberry32 } from "./dodecaState";
import { FACE_INDICES } from "./dodecaMath";

describe("kilominxState move table self-consistency", () => {
  it("every move is a proper permutation (each position appears exactly once)", () => {
    for (const face of FACE_INDICES) {
      for (const table of MOVE_TABLE[face]) {
        const seen = new Set(table.perm);
        expect(seen.size).toBe(20);
      }
    }
  });

  it("5 applications of the same move returns to solved (pentagon order-5 symmetry)", () => {
    for (const face of FACE_INDICES) {
      for (const sign of [1, -1] as const) {
        let s = solvedKilominxState();
        for (let i = 0; i < 5; i++) s = applyKilominxMove(s, face, sign);
        expect(isKilominxSolved(s), `face=${face} sign=${sign}`).toBe(true);
      }
    }
  });

  it("move then its inverse returns to solved", () => {
    for (const face of FACE_INDICES) {
      let s = solvedKilominxState();
      s = applyKilominxMove(s, face, 1);
      s = applyKilominxMove(s, face, -1);
      expect(isKilominxSolved(s), `face=${face}`).toBe(true);
    }
  });

  it("a scramble leaves the puzzle unsolved (sanity: moves actually move pieces)", () => {
    let s = solvedKilominxState();
    const turns = randomKilominxScramble(15, mulberry32(1));
    for (const t of turns) s = applyKilominxMove(s, t.face, t.sign);
    expect(isKilominxSolved(s)).toBe(false);
  });
});

describe("kilominxState matches the real geometric engine", () => {
  it("applying the same random sequence of moves keeps the abstract model and the live geometric engine in sync (solved <=> solved) across many scrambles", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      const geo = buildSolvedDodeca(2);
      let abs = solvedKilominxState();
      const turns = randomKilominxScramble(12, rng);
      for (const t of turns) {
        applyRawFifthTurn(geo, t.face, 1, t.sign);
        abs = applyKilominxMove(abs, t.face, t.sign);
      }
      expect(isSolved(geo), `seed=${seed}`).toBe(isKilominxSolved(abs));
    }
  });

  it("a scramble immediately undone (played backwards, inverted) is solved in both models", () => {
    const rng = mulberry32(7);
    const geo = buildSolvedDodeca(2);
    let abs = solvedKilominxState();
    const turns = randomKilominxScramble(15, rng);
    for (const t of turns) {
      applyRawFifthTurn(geo, t.face, 1, t.sign);
      abs = applyKilominxMove(abs, t.face, t.sign);
    }
    for (const t of [...turns].reverse()) {
      applyRawFifthTurn(geo, t.face, 1, t.sign === 1 ? -1 : 1);
      abs = applyKilominxMove(abs, t.face, t.sign === 1 ? -1 : 1);
    }
    expect(isSolved(geo)).toBe(true);
    expect(isKilominxSolved(abs)).toBe(true);
  });
});
