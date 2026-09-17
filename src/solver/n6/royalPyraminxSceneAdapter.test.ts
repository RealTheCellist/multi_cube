import { describe, expect, it } from "vitest";
import { applyRawThirdTurn, buildSolvedTetra, generateRandomThirdTurns, isSolved, mulberry32 } from "../../customTetra/tetraState";
import { royalMoveNamesToTetraMoves, sceneStateToRoyalState } from "./royalPyraminxSceneAdapter";
import { isSolvedRoyal } from "./royalPyraminxState";
import { solveRoyalPyraminx } from "./royalPyraminxSolver";

describe("sceneStateToRoyalState", () => {
  it("maps the solved scene to the solved RoyalPyraminxState", () => {
    const scene = buildSolvedTetra(6);
    const royal = sceneStateToRoyalState(scene);
    expect(isSolvedRoyal(royal)).toBe(true);
  });
});

describe("scene <-> solver round trip", () => {
  it(
    "solves scrambled scenes end-to-end: raw turns -> RoyalPyraminxState -> solveRoyalPyraminx -> TetraMoves -> raw turns -> isSolved",
    async () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const rng = mulberry32(seed);
        const scene = buildSolvedTetra(6);
        for (const t of generateRandomThirdTurns(6, 12, rng)) applyRawThirdTurn(scene, t.vertexIndex, t.depth, t.sign);

        const royal = sceneStateToRoyalState(scene);
        const moveNames = await solveRoyalPyraminx(royal, 8, 4_000_000);
        const tetraMoves = royalMoveNamesToTetraMoves(moveNames);
        for (const m of tetraMoves) applyRawThirdTurn(scene, m.vertexIndex, m.depth, m.sign);

        expect(isSolved(scene), `seed ${seed}`).toBe(true);
      }
    },
    60_000,
  );
});
