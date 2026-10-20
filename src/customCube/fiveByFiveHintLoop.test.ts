import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyRawQuarterTurn, buildSolvedCube, isSolved, mulberry32, randomLayerScramble } from "./cubeState";
import { applyNextFiveByFiveMove } from "./customSolvePlayback";

// Presses the 5x5x5 solve hint until the cube is solved, against a stand-in for the scene (the real one needs WebGL).
// The seeds include ones where the 3x3x3 reduction used to be replanned on every press and ping-pong forever.
describe("5x5x5 solve hint, pressed repeatedly", () => {
  const original = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  beforeAll(() => {
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(performance.now() + 1e6), 0);
  });
  afterAll(() => {
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = original;
  });

  it.each([1, 2, 3, 13, 14, 18, 19, 20, 28])("seed %i ends solved", async (seed) => {
    const cubies = buildSolvedCube(5);
    randomLayerScramble(cubies, 5, 25, mulberry32(seed * 7919));
    let active: [Parameters<typeof applyRawQuarterTurn>[1], number] | null = null;
    const scene = {
      gridSize: 5,
      getCubies: () => cubies,
      beginTurn: (axis: Parameters<typeof applyRawQuarterTurn>[1], layer: number) => {
        active = [axis, layer];
        return true;
      },
      setTurnProgress: () => {},
      endTurn: (sign: 1 | -1) => {
        applyRawQuarterTurn(cubies, active![0], active![1], sign);
        active = null;
      },
    };
    let presses = 0;
    while (presses < 1500 && !isSolved(cubies)) {
      const hint = await applyNextFiveByFiveMove(scene as never);
      presses++;
      if (!hint.hasMove) break;
    }
    expect(isSolved(cubies)).toBe(true);
    expect(presses).toBeLessThan(1000);
  }, 120_000);
});
