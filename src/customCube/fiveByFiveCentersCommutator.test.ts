import { describe, expect, it } from "vitest";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, mulberry32, randomLayerScramble } from "./cubeState";
import { solveTrueCenterPositions5, wrongCenterCount } from "./fiveByFiveCenters";
import { solveCentersByCommutator5 } from "./fiveByFiveCentersCommutator";

describe("solveCentersByCommutator5", () => {
  it("solves every X/T-center on many random scrambles, quickly", () => {
    const lens: number[] = [];
    let maxMs = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const cubies = buildSolvedCube(5);
      randomLayerScramble(cubies, 5, 25, mulberry32(seed * 7919));
      const work = cloneCubies(cubies);
      solveTrueCenterPositions5(work);
      const before = wrongCenterCount(work);
      const t = performance.now();
      const moves = solveCentersByCommutator5(work);
      maxMs = Math.max(maxMs, performance.now() - t);
      for (const [axis, layer, sign] of moves) applyRawQuarterTurn(work, axis, layer, sign);
      expect(wrongCenterCount(work), `seed ${seed} (was ${before} wrong)`).toBe(0);
      lens.push(moves.length);
    }
    console.log(`centers5: max ${maxMs.toFixed(0)}ms, moves min ${Math.min(...lens)} mean ${(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(0)} max ${Math.max(...lens)}`);
    expect(maxMs).toBeLessThan(3000);
  }, 120_000);

  it("returns no moves for already-solved centers", () => {
    expect(solveCentersByCommutator5(buildSolvedCube(5))).toEqual([]);
  });
});
