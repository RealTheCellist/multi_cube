import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies } from "./cubeState";
import { unpairedWingCount } from "./fourByFourEdges";
import { solveWingsByCycles4 } from "./fourByFourWingsCycle";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe("4x4 wing pairing by 3-cycles", () => {
  it("pairs every wing on random scrambles", () => {
    const lens: number[] = [];
    let fail = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = rng(seed);
      const cubies = buildSolvedCube(4);
      for (let i = 0; i < 40; i++) {
        const axis = (["x", "y", "z"] as const)[Math.floor(r() * 3)];
        const layer = [-1.5, -0.5, 0.5, 1.5][Math.floor(r() * 4)];
        applyRawQuarterTurn(cubies, axis, layer, r() < 0.5 ? 1 : -1);
      }
      const t0 = Date.now();
      const moves = solveWingsByCycles4(cubies);
      const ms = Date.now() - t0;
      if (!moves) { fail++; appendFileSync("/tmp/w4.log", `seed ${seed} null\n`); continue; }
      const work = cloneCubies(cubies);
      for (const [a, l, s] of moves) applyRawQuarterTurn(work, a, l, s);
      expect(unpairedWingCount(work)).toBe(0);
      lens.push(moves.length);
      appendFileSync("/tmp/w4.log", `seed ${seed} len ${moves.length} ${ms}ms\n`);
    }
    appendFileSync("/tmp/w4.log", `fail ${fail} mean ${lens.reduce((a, b) => a + b, 0) / lens.length} max ${Math.max(...lens)}\n`);
    expect(fail).toBe(0);
  }, 120000);
});
