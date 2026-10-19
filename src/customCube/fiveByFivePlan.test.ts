import { describe, expect, it } from "vitest";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, mulberry32, randomLayerScramble } from "./cubeState";
import { wrongCenterCount } from "./fiveByFiveCenters";
import { wrongWingCount5 } from "./fiveByFiveEdges";
import { planPairing5 } from "./fiveByFivePlan";

describe("planPairing5", () => {
  it("leaves every center solved and every wing paired, for both wing-parity cases", () => {
    let needsParityFix = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const cubies = buildSolvedCube(5);
      randomLayerScramble(cubies, 5, 25, mulberry32(seed * 7919));
      const plan = planPairing5(cubies);
      expect(plan, `seed ${seed}`).not.toBeNull();
      const work = cloneCubies(cubies);
      for (const [axis, layer, sign] of plan!) applyRawQuarterTurn(work, axis, layer, sign);
      expect(wrongCenterCount(work), `seed ${seed} centers`).toBe(0);
      expect(wrongWingCount5(work), `seed ${seed} wings`).toBe(0);
      if (plan!.length > 0) needsParityFix++;
    }
    expect(needsParityFix).toBeGreaterThan(0);
  }, 120_000);

  it("returns an empty plan for an already-reduced cube", () => {
    expect(planPairing5(buildSolvedCube(5))).toEqual([]);
  });
});
