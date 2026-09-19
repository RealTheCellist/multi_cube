import { describe, expect, it } from "vitest";
import { applyMegaminxMove, isMegaminxSolved, MOVE_TABLE, randomMegaminxScramble, solvedMegaminxState, EDGES } from "./megaminxState";
import { applyRawFifthTurn, buildSolvedDodeca, isSolved, mulberry32 } from "./dodecaState";
import { FACE_INDICES } from "./dodecaMath";

describe("megaminxState geometry", () => {
  it("has exactly 30 unique edges", () => {
    expect(EDGES.length).toBe(30);
    const seen = new Set(EDGES.map(([a, b]) => `${a},${b}`));
    expect(seen.size).toBe(30);
  });
});

describe("megaminxState move table self-consistency", () => {
  it("every move is a proper permutation on both corners and edges", () => {
    for (const face of FACE_INDICES) {
      for (const table of MOVE_TABLE[face]) {
        expect(new Set(table.cornerPerm).size).toBe(20);
        expect(new Set(table.edgePerm).size).toBe(30);
      }
    }
  });

  it("5 applications of the same move returns to solved (pentagon order-5 symmetry)", () => {
    for (const face of FACE_INDICES) {
      for (const sign of [1, -1] as const) {
        let s = solvedMegaminxState();
        for (let i = 0; i < 5; i++) s = applyMegaminxMove(s, face, sign);
        expect(isMegaminxSolved(s), `face=${face} sign=${sign}`).toBe(true);
      }
    }
  });

  it("move then its inverse returns to solved", () => {
    for (const face of FACE_INDICES) {
      let s = solvedMegaminxState();
      s = applyMegaminxMove(s, face, 1);
      s = applyMegaminxMove(s, face, -1);
      expect(isMegaminxSolved(s), `face=${face}`).toBe(true);
    }
  });

  it("a scramble leaves the puzzle unsolved (sanity: moves actually move pieces)", () => {
    let s = solvedMegaminxState();
    const turns = randomMegaminxScramble(15, mulberry32(1));
    for (const t of turns) s = applyMegaminxMove(s, t.face, t.sign);
    expect(isMegaminxSolved(s)).toBe(false);
  });
});

describe("megaminxState matches the real geometric engine", () => {
  it("applying the same random sequence of moves keeps the abstract model and the live geometric engine in sync (solved <=> solved) across many scrambles", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      const geo = buildSolvedDodeca(3);
      let abs = solvedMegaminxState();
      const turns = randomMegaminxScramble(12, rng);
      for (const t of turns) {
        applyRawFifthTurn(geo, t.face, 1, t.sign);
        abs = applyMegaminxMove(abs, t.face, t.sign);
      }
      expect(isSolved(geo), `seed=${seed}`).toBe(isMegaminxSolved(abs));
    }
  });

  it("a scramble immediately undone (played backwards, inverted) is solved in both models", () => {
    const rng = mulberry32(7);
    const geo = buildSolvedDodeca(3);
    let abs = solvedMegaminxState();
    const turns = randomMegaminxScramble(15, rng);
    for (const t of turns) {
      applyRawFifthTurn(geo, t.face, 1, t.sign);
      abs = applyMegaminxMove(abs, t.face, t.sign);
    }
    for (const t of [...turns].reverse()) {
      applyRawFifthTurn(geo, t.face, 1, t.sign === 1 ? -1 : 1);
      abs = applyMegaminxMove(abs, t.face, t.sign === 1 ? -1 : 1);
    }
    expect(isSolved(geo)).toBe(true);
    expect(isMegaminxSolved(abs)).toBe(true);
  });
});
