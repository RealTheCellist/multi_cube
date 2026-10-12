import { describe, it, expect } from "vitest";
import { buildSolvedDodeca, applyRawFifthTurn, isSolved as isDodecaSolved, generateRandomFifthTurns } from "./dodecaState";
import { dodecaStateToMegaminxState, megaminxTurnToRawTurn } from "./megaminxState";
import { solveMegaminx } from "./megaminxSolver";
import { dodecaStateToMasterKilominxState, masterKilominxTurnToRawTurn } from "./masterKilominxState";
import { solveMasterKilominx } from "./masterKilominxSolver";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("N=3/N=4 state-scene bridge round-trip (depth=1-only scrambles)", () => {
  it(
    "N=3 Megaminx: 5 independent scrambles solve through the real scene",
    () => {
      for (let seed = 1; seed <= 5; seed++) {
        const rng = mulberry32(seed);
        const scene = buildSolvedDodeca(3);
        for (const t of generateRandomFifthTurns(3, 25, rng)) applyRawFifthTurn(scene, t.faceIndex, t.depth, t.sign);
        const solverState = dodecaStateToMegaminxState(scene);
        const solution = solveMegaminx(solverState);
        for (const turn of solution) {
          const raw = megaminxTurnToRawTurn(turn);
          applyRawFifthTurn(scene, raw.faceIndex, raw.depth, raw.sign);
        }
        expect(isDodecaSolved(scene), `N=3 seed=${seed} not solved`).toBe(true);
      }
    },
    60_000,
  );

  it(
    "N=4 Master Kilominx: 5 independent scrambles solve through the real scene",
    () => {
      for (let seed = 1; seed <= 5; seed++) {
        const rng = mulberry32(seed);
        const scene = buildSolvedDodeca(4);
        for (const t of generateRandomFifthTurns(4, 25, rng)) applyRawFifthTurn(scene, t.faceIndex, t.depth, t.sign);
        const solverState = dodecaStateToMasterKilominxState(scene);
        const solution = solveMasterKilominx(solverState);
        for (const turn of solution) {
          const raw = masterKilominxTurnToRawTurn(turn);
          applyRawFifthTurn(scene, raw.faceIndex, raw.depth, raw.sign);
        }
        expect(isDodecaSolved(scene), `N=4 seed=${seed} not solved`).toBe(true);
      }
    },
    60_000,
  );
});
