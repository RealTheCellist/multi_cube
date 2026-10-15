import { describe, expect, it } from "vitest";
import { computeMasterTetraSolveMoves } from "./masterTetraSolveAsync";
import { buildSolvedTetra, randomTetraScramble } from "./tetraState";

// Regression: N=4's center cleanup used to throw ("Cannot read properties of
// undefined") because it reused N=5's depth-4 commutator -- see
// masterTetraminxSolver.ts's N4_CENTER_DOUBLE_SWAPS for why N=4 needs a
// different (double-swap) cleanup.
describe("Master Pyraminx (N=4) full solve", () => {
  it("fully solves 20 different scrambles", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = seed * 7919;
      const rng = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      const state = buildSolvedTetra(4);
      randomTetraScramble(state, 25, rng);
      const result = computeMasterTetraSolveMoves(state);
      expect(result.solved, `seed=${seed}`).toBe(true);
    }
  }, 120_000);
});
