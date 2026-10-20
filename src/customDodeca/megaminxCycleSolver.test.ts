import { describe, expect, it } from "vitest";
import { mulberry32 } from "./dodecaState";
import { applyKilominxMove, applyKilominxScramble, isKilominxSolved, randomKilominxScramble, solvedKilominxState } from "./kilominxState";
import { applyMasterKilominxMove, applyMasterKilominxScramble, randomMasterKilominxScramble, solvedMasterKilominxState } from "./masterKilominxState";
import { applyMegaminxMove, applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { solveKilominxByCycles, solveMegaminxByCycles } from "./megaminxCycleSolver";

const isMegaminxSolved = (s: MegaminxState) => s.cornerPerm.every((p, i) => p === i) && s.cornerOrient.every((o) => o === 0) && s.edgePerm.every((p, i) => p === i) && s.edgeOrient.every((o) => o === 0);

describe("macro solvers for the Kilominx family", () => {
  it("Megaminx: solves completely in far fewer moves than the layer-by-layer solver", () => {
    const lens: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const start = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(25, mulberry32(seed * 131)));
      const turns = solveMegaminxByCycles(start);
      let s = start;
      for (const t of turns) s = applyMegaminxMove(s, t.face as never, t.sign);
      expect(isMegaminxSolved(s), `seed ${seed}`).toBe(true);
      lens.push(turns.length);
    }
    expect(lens.reduce((a, b) => a + b, 0) / lens.length).toBeLessThan(450);
  }, 120_000);

  it("Master Kilominx: same piece model, solves completely", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const start = applyMasterKilominxScramble(solvedMasterKilominxState(), randomMasterKilominxScramble(25, mulberry32(seed * 977)));
      const turns = solveMegaminxByCycles(start);
      let s = start;
      for (const t of turns) s = applyMasterKilominxMove(s, t.face as never, t.sign);
      expect(isMegaminxSolved(s as never), `seed ${seed}`).toBe(true);
    }
  }, 120_000);

  it("Kilominx: corners only, solves completely", () => {
    const lens: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const start = applyKilominxScramble(solvedKilominxState(), randomKilominxScramble(25, mulberry32(seed * 313)));
      const turns = solveKilominxByCycles(start);
      let s = start;
      for (const t of turns) s = applyKilominxMove(s, t.face as never, t.sign);
      expect(isKilominxSolved(s), `seed ${seed}`).toBe(true);
      lens.push(turns.length);
    }
    expect(lens.reduce((a, b) => a + b, 0) / lens.length).toBeLessThan(200);
  }, 120_000);
});
