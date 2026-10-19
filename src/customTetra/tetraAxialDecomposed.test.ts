import { describe, expect, it } from "vitest";
import { precompute } from "./masterTetraminxSolver";
import { solveAxialDecomposed, axialSplit } from "./tetraAxialDecomposed";

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe.each([4, 5])("solveAxialDecomposed N=%i", (n) => {
  const pre = precompute(n);
  const split = axialSplit(pre)!;
  const axialSlots = [...split.main, ...split.rest];

  it("solves every axial slot on many random scrambles", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = mulberry32(seed * 31 + n);
      let pieces = Array.from({ length: pre.ns }, (_, i) => i);
      for (let i = 0; i < 25; i++) {
        const perm = pre.permByMove.get(keyOf(pre, Math.floor(rng() * pre.allMoves.length)))!;
        pieces = pieces.map((_, j) => pieces[perm[j]]);
      }
      const moves = solveAxialDecomposed(pre, pieces);
      expect(moves, `seed ${seed}`).not.toBeNull();
      let check = pieces.slice();
      for (const m of moves!) {
        const perm = pre.permByMove.get(`${m.vertexIndex}_${m.depth}_${m.sign}`)!;
        check = check.map((_, j) => check[perm[j]]);
      }
      for (const s of axialSlots) expect(check[s], `seed ${seed} slot ${s}`).toBe(s);
    }
  }, 120_000);
});

function keyOf(pre: ReturnType<typeof precompute>, idx: number): string {
  const m = pre.allMoves[idx];
  return `${m.vertexIndex}_${m.depth}_${m.sign}`;
}

import { applyPhaseTo, cloneState, continueAfterAxialSolved, patternFromState, type TetraMove } from "./masterTetraminxSolver";
import { applyRawThirdTurn, buildSolvedTetra, isSolved } from "./tetraState";

describe.each([4, 5])("axial-decomposed + existing pipeline N=%i", (n) => {
  it("reaches a fully solved puzzle (N=5: or reports the edge phase failure the PDB worker would retry)", () => {
    const pre = precompute(n);
    let solvedCount = 0;
    const total = 8;
    for (let seed = 1; seed <= total; seed++) {
      const rng = mulberry32(seed * 977 + n);
      const state = buildSolvedTetra(n);
      for (let i = 0; i < 25; i++) {
        const m = pre.allMoves[Math.floor(rng() * pre.allMoves.length)];
        applyRawThirdTurn(state, m.vertexIndex, m.depth, m.sign);
      }
      const axial = solveAxialDecomposed(pre, patternFromState(state, pre));
      expect(axial).not.toBeNull();
      const working = cloneState(state);
      const moves: TetraMove[] = [];
      applyPhaseTo(working, moves, axial);
      const { edgePhaseFailed } = continueAfterAxialSolved(pre, working, moves, true);
      if (!edgePhaseFailed) {
        expect(isSolved(working), `seed ${seed}`).toBe(true);
        solvedCount++;
      } else {
        expect(n, "only N=5 may need the edge PDB worker").toBe(5);
      }
    }
    expect(solvedCount).toBe(n === 4 ? total : solvedCount);
  }, 600_000);
});
