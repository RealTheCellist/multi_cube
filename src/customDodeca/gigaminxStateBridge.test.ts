// GIGAMINX_STATE_BRIDGE_AND_ROUNDTRIP_CORRECTNESS_V1 -- verifies the bridge
// between the real rendering/interaction scene's own model (dodecaState.ts's
// DodecaState) and the solver's abstract model (gigaminxState.ts's
// GigaminxState), per Gates B through H of that Sprint. No solver algorithm
// change; this file only reads gigaminxState.ts/dodecaState.ts/gigaminxSolver.ts
// exports.
import { describe, it, expect } from "vitest";
import { buildSolvedDodeca, applyRawFifthTurn, isSolved as isDodecaSolved, generateRandomFifthTurns } from "./dodecaState";
import { solvedGigaminxState, applyGigaminxMove, dodecaStateToGigaminxState, gigaminxTurnToRawTurn, rawTurnToGigaminxTurn, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveFullGigaminx } from "./gigaminxSolver";
import { FACE_INDICES } from "./dodecaMath";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gigaminxStatesEqual(a: GigaminxState, b: GigaminxState): boolean {
  const arrs: (keyof GigaminxState)[] = ["cornerPerm", "cornerOrient", "wingPerm", "wingOrient", "innerCornerPerm", "edgeBridgePerm", "centerBridgePerm"];
  return arrs.every((k) => a[k].length === b[k].length && a[k].every((v, i) => v === b[k][i]));
}

describe("GIGAMINX_STATE_BRIDGE_AND_ROUNDTRIP_CORRECTNESS_V1", () => {
  it("Gate B -- solved scene bridges to the exact solved GigaminxState", () => {
    const scene = buildSolvedDodeca(5);
    const bridged = dodecaStateToGigaminxState(scene);
    const expected = solvedGigaminxState();
    expect(gigaminxStatesEqual(bridged, expected)).toBe(true);

    // transition semantics: applying a move and its inverse to the bridged
    // solved state returns to solved, same as the real solver state.
    const m: GigaminxTurn = { face: 0, sign: 1, depth: 1 };
    const after = applyGigaminxMove(bridged, m.face, m.sign, m.depth);
    const back = applyGigaminxMove(after, m.face, -m.sign as 1 | -1, m.depth);
    expect(gigaminxStatesEqual(back, expected)).toBe(true);
  });

  it("Gate C -- every (face, depth, sign) raw turn transitions identically in both domains", () => {
    for (const face of FACE_INDICES) {
      for (const depth of [1, 2, 3, 4] as const) {
        for (const sign of [1, -1] as const) {
          const scene = buildSolvedDodeca(5);
          applyRawFifthTurn(scene, face, depth, sign);
          const fromScene = dodecaStateToGigaminxState(scene);

          const fromSolver = applyGigaminxMove(solvedGigaminxState(), face, sign, depth);

          expect(gigaminxStatesEqual(fromScene, fromSolver)).toBe(true);
        }
      }
    }
  });

  it("Gate D -- GigaminxTurn <-> RawDodecaTurn bidirectional mapping is stable", () => {
    for (const face of FACE_INDICES) {
      for (const depth of [1, 2, 3, 4] as const) {
        for (const sign of [1, -1] as const) {
          const turn: GigaminxTurn = { face, sign, depth };
          const raw = gigaminxTurnToRawTurn(turn);
          const back = rawTurnToGigaminxTurn(raw);
          expect(back).toEqual(turn);

          const raw2 = { faceIndex: face, depth, sign };
          const asGiga = rawTurnToGigaminxTurn(raw2);
          const raw3 = gigaminxTurnToRawTurn(asGiga);
          expect(raw3).toEqual(raw2);
        }
      }
    }
  });

  it("Gate E -- 5 independent scrambles: scene-derived state matches solver-derived state exactly", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = mulberry32(seed * 1000 + 7);
      const scene = buildSolvedDodeca(5);
      const turns = generateRandomFifthTurns(5, 30, rng);
      for (const t of turns) applyRawFifthTurn(scene, t.faceIndex, t.depth, t.sign);
      const fromScene = dodecaStateToGigaminxState(scene);

      let solverState = solvedGigaminxState();
      for (const t of turns) solverState = applyGigaminxMove(solverState, t.faceIndex, t.sign, rawTurnToGigaminxTurn(t).depth);

      expect(gigaminxStatesEqual(fromScene, solverState)).toBe(true);
    }
  });

  it("Gate F -- 5 independent scrambles: full solver round-trip through the scene ends solved", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = mulberry32(seed * 7919 + 3);
      const scene = buildSolvedDodeca(5);
      const turns = generateRandomFifthTurns(5, 30, rng);
      for (const t of turns) applyRawFifthTurn(scene, t.faceIndex, t.depth, t.sign);
      expect(isDodecaSolved(scene)).toBe(false);

      const solverState = dodecaStateToGigaminxState(scene);
      const result = solveFullGigaminx(solverState);
      expect(result.cornersTrace.succeeded).toBe(true);
      expect(result.wingsTrace.succeeded).toBe(true);
      expect(result.innerCornersTrace.succeeded).toBe(true);
      expect(result.edgeBridgesTrace.succeeded).toBe(true);
      expect(result.centerBridgesTrace.succeeded).toBe(true);
      expect(result.moves.length).toBeGreaterThan(0);

      for (const m of result.moves) {
        const raw = gigaminxTurnToRawTurn(m);
        applyRawFifthTurn(scene, raw.faceIndex, raw.depth, raw.sign);
      }

      expect(isDodecaSolved(scene)).toBe(true);
    }
  }, 60_000);

  it("Gate G -- sign/depth/direction mismatch check: a move then its exact inverse returns to solved, for every (face, depth)", () => {
    for (const face of FACE_INDICES) {
      for (const depth of [1, 2, 3, 4] as const) {
        const scene = buildSolvedDodeca(5);
        applyRawFifthTurn(scene, face, depth, 1);
        applyRawFifthTurn(scene, face, depth, -1);
        expect(isDodecaSolved(scene)).toBe(true);

        // Same check through the Gigaminx domain + bridge round-trip.
        let s = dodecaStateToGigaminxState(buildSolvedDodeca(5));
        s = applyGigaminxMove(s, face, 1, depth);
        s = applyGigaminxMove(s, face, -1, depth);
        expect(gigaminxStatesEqual(s, solvedGigaminxState())).toBe(true);
      }
    }
  });

  it("Gate H -- bridge addition does not change canonical solver behavior (identity scramble stays solved)", () => {
    const scene = buildSolvedDodeca(5);
    const bridged = dodecaStateToGigaminxState(scene);
    expect(gigaminxStatesEqual(bridged, solvedGigaminxState())).toBe(true);
    const result = solveFullGigaminx(bridged);
    expect(result.moves.length).toBe(0);
    expect(result.centerBridgesTrace.succeeded).toBe(true);
  });
});
