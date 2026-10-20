import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyRawQuarterTurn, buildSolvedCube, isSolved, mulberry32, randomLayerScramble } from "./cubeState";
import { applyNextFourByFourMove } from "./customSolvePlayback";

// Presses the 4x4x4 solve hint until the cube is solved, against a stand-in for the scene (the real one needs
// WebGL). The plan streams in phase by phase (edges, centers, reduction), so this also covers the engine waiting
// for later phases once the earlier ones' moves have been played.
describe("4x4x4 solve hint, pressed repeatedly", () => {
  const original = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  beforeAll(() => {
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(performance.now() + 1e6), 0);
  });
  afterAll(() => {
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = original;
  });

  it.each([1, 2, 3, 4])("seed %i ends solved", async (seed) => {
    const cubies = buildSolvedCube(4);
    randomLayerScramble(cubies, 4, 25, mulberry32(seed * 313));
    let active: [Parameters<typeof applyRawQuarterTurn>[1], number] | null = null;
    const scene = {
      gridSize: 4,
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
      const hint = await applyNextFourByFourMove(scene as never);
      presses++;
      if (!hint.hasMove) break;
    }
    expect(isSolved(cubies)).toBe(true);
  }, 120_000);
});
