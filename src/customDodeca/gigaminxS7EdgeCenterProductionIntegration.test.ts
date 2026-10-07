// GIGAMINX_S7_EDGE_CENTER_SUPPORT_PREFILTER_PRODUCTION_INTEGRATION_V1 --
// validation of the ACTUAL production solveEdgeBridges/solveCenterBridges
// (gigaminxSolver.ts now sets EDGE_USE_PREFILTER/CENTER_USE_PREFILTER =
// true and wires them into all 6 findSafe*Application call sites across
// the two solvers' strict/lateral/regression tiers). Wiring-only, per the
// S7 instructions -- no library/ordering/selection/support/S1/tier/
// termination/other-phase changes. commit/push: none this sprint.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import {
  solveCorners,
  solveWings,
  solveInnerCorners,
  solveEdgeBridges,
  solveCenterBridges,
  areCornersSolved,
  areWingsSolved,
  areInnerCornersSolved,
  areEdgeBridgesSolved,
  areCenterBridgesSolved,
  __dev,
} from "./gigaminxSolver";

const {
  edgeBridgeCommutators,
  tryExactFinishEdgeBridges,
  tryCompoundFinishEdgeBridges,
  findSafeEdgeBridgeApplication,
  centerBridgeCommutators,
  tryExactFinishCenterBridges,
  tryCompoundFinishCenterBridges,
  findSafeCenterBridgeApplication,
  positionSetupTables,
} = __dev as any;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function applySeq(state: GigaminxState, seq: readonly GigaminxTurn[]): GigaminxState {
  let s = state;
  for (const t of seq) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
  return s;
}

type Orbit = "edgeBridge" | "centerBridge";
interface Adapter {
  name: Orbit;
  perm: (s: GigaminxState) => Int8Array;
  solved: (s: GigaminxState) => boolean;
  commutators: () => any[];
  tryExactFinish: (commutators: any, current: GigaminxState, fixed: Set<number>, pieces: number[]) => any;
  tryCompoundFinish: (commutators: any, current: GigaminxState, fixed: Set<number>, pieces: number[]) => any;
  findSafeApplication: (...args: any[]) => any;
}
const EDGE_BRIDGE: Adapter = {
  name: "edgeBridge",
  perm: (s) => s.edgeBridgePerm,
  solved: areEdgeBridgesSolved,
  commutators: edgeBridgeCommutators,
  tryExactFinish: tryExactFinishEdgeBridges,
  tryCompoundFinish: tryCompoundFinishEdgeBridges,
  findSafeApplication: findSafeEdgeBridgeApplication,
};
const CENTER_BRIDGE: Adapter = {
  name: "centerBridge",
  perm: (s) => s.centerBridgePerm,
  solved: areCenterBridgesSolved,
  commutators: centerBridgeCommutators,
  tryExactFinish: tryExactFinishCenterBridges,
  tryCompoundFinish: tryCompoundFinishCenterBridges,
  findSafeApplication: findSafeCenterBridgeApplication,
};
function stateSig(perm: Int8Array): string {
  return perm.join(",");
}

// Legacy reference: the SAME control flow as production solve{EdgeBridges,
// CenterBridges}, but with usePrefilter hardcoded false (pre-S7 behavior).
function runOrbitSolveLegacyReference(adapter: Adapter, state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; rounds: number } {
  const commutators = adapter.commutators();
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: 60 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([stateSig(adapter.perm(current))]);

  function callFind(target: number, wrongAfterThreshold: number, enforceFixedFlag: boolean) {
    return adapter.findSafeApplication(commutators, current, fixed, target, wrongAfterThreshold, targetPositions, setupTables, enforceFixedFlag, visited, undefined, undefined, false);
  }

  try {
    while (targetPositions.some((p) => adapter.perm(current)[p] !== p)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => adapter.perm(current)[p] !== p);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: any = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
      if (!found) {
        let strictFound: any = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = adapter.perm(current)[pos];
          strictFound = callFind(target, wrongBefore - 1, true);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: any = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = adapter.perm(current)[pos];
              lateralFound = callFind(target, wrongBefore, true);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? adapter.tryCompoundFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: any = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = adapter.perm(current)[pos];
                  regressiveFound = callFind(target, wrongBefore + step, false);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) throw new Error(`stuck (${wrongBefore} ${adapter.name} wrong)`);
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error(`exhausted ${maxConsecutiveRegressive}-round regression budget`);
              found = regressiveFound;
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      } else {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      }
      current = found.state;
      solution.push(...found.seq);
      visited.add(stateSig(adapter.perm(current)));
      fixed.clear();
      for (const p of targetPositions) if (adapter.perm(current)[p] === p) fixed.add(p);
    }
    return { moves: solution, succeeded: true, rounds: attempts };
  } catch {
    return { moves: solution, succeeded: false, rounds: attempts };
  }
}

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1, 2, 3];

describe("GIGAMINX_S7_EDGE_CENTER_SUPPORT_PREFILTER_PRODUCTION_INTEGRATION_V1", () => {
  it(
    "Stage 1/2/4/6/7: full production chain correctness + Edge/Center production-vs-legacy performance+equivalence + 5-phase total",
    () => {
      const rows: any[] = [];
      for (const seed of seeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

        // Stage 7: full production 5-phase chain, timed phase-by-phase.
        const t0 = Date.now();
        const cornerResult = solveCorners(scrambled);
        const cornerMs = Date.now() - t0;
        expect(cornerResult.trace.succeeded, `seed ${seed}: corners failed`).toBe(true);
        const afterCorners = applySeq(scrambled, cornerResult.moves);

        const t1 = Date.now();
        const wingResult = solveWings(afterCorners);
        const wingMs = Date.now() - t1;
        expect(wingResult.trace.succeeded, `seed ${seed}: wings failed`).toBe(true);
        const afterWings = applySeq(afterCorners, wingResult.moves);

        const t2 = Date.now();
        const innerResult = solveInnerCorners(afterWings);
        const innerMs = Date.now() - t2;
        expect(innerResult.trace.succeeded, `seed ${seed}: innerCorners failed`).toBe(true);
        const afterInner = applySeq(afterWings, innerResult.moves);

        // Stage 1/2: real production solveEdgeBridges (prefilter ON internally).
        const t3 = Date.now();
        const edgeResult = solveEdgeBridges(afterInner);
        const edgeMs = Date.now() - t3;
        expect(edgeResult.trace.succeeded, `seed ${seed}: edgeBridges failed`).toBe(true);
        const afterEdge = applySeq(afterInner, edgeResult.moves);

        const t4 = Date.now();
        const centerResult = solveCenterBridges(afterEdge);
        const centerMs = Date.now() - t4;
        expect(centerResult.trace.succeeded, `seed ${seed}: centerBridges failed`).toBe(true);
        const afterCenter = applySeq(afterEdge, centerResult.moves);

        const totalMs = Date.now() - t0;

        // Stage 2: full correctness + replay on the whole chain's final state.
        expect(areCornersSolved(afterCenter), `seed ${seed}: corners not solved at end`).toBe(true);
        expect(areWingsSolved(afterCenter), `seed ${seed}: wings not solved at end`).toBe(true);
        expect(areInnerCornersSolved(afterCenter), `seed ${seed}: innerCorners not solved at end`).toBe(true);
        expect(areEdgeBridgesSolved(afterCenter), `seed ${seed}: edgeBridges not solved at end`).toBe(true);
        expect(areCenterBridgesSolved(afterCenter), `seed ${seed}: centerBridges not solved at end`).toBe(true);

        // Stage 4/6: Edge legacy reference (prefilter OFF) vs real production (prefilter ON), same input.
        const te0 = Date.now();
        const edgeLegacy = runOrbitSolveLegacyReference(EDGE_BRIDGE, afterInner);
        const edgeLegacyMs = Date.now() - te0;
        expect(edgeLegacy.succeeded, `seed ${seed}: edge legacy reference failed`).toBe(true);
        expect(edgeResult.trace.rounds, `seed ${seed}: edge rounds diverged from legacy`).toBe(edgeLegacy.rounds);
        expect(edgeResult.moves.length, `seed ${seed}: edge move length diverged from legacy`).toBe(edgeLegacy.moves.length);

        const tc0 = Date.now();
        const centerLegacy = runOrbitSolveLegacyReference(CENTER_BRIDGE, afterEdge);
        const centerLegacyMs = Date.now() - tc0;
        expect(centerLegacy.succeeded, `seed ${seed}: center legacy reference failed`).toBe(true);
        expect(centerResult.trace.rounds, `seed ${seed}: center rounds diverged from legacy`).toBe(centerLegacy.rounds);
        expect(centerResult.moves.length, `seed ${seed}: center move length diverged from legacy`).toBe(centerLegacy.moves.length);

        const row = {
          seed,
          cornerMs,
          wingMs,
          innerMs,
          edgeMs,
          edgeLegacyMs,
          edgeSpeedup: edgeLegacyMs / edgeMs,
          centerMs,
          centerLegacyMs,
          centerSpeedup: centerLegacyMs / centerMs,
          totalMs,
          edgeRounds: edgeResult.trace.rounds,
          centerRounds: centerResult.trace.rounds,
        };
        rows.push(row);
        console.log(
          `S7 seed=${seed} totalMs=${totalMs} corner=${cornerMs} wing=${wingMs} inner=${innerMs} ` +
            `edge(prod)=${edgeMs} edge(legacy)=${edgeLegacyMs} edgeSpeedup=${row.edgeSpeedup.toFixed(2)}x ` +
            `center(prod)=${centerMs} center(legacy)=${centerLegacyMs} centerSpeedup=${row.centerSpeedup.toFixed(2)}x ` +
            `edgeRounds=${row.edgeRounds} centerRounds=${row.centerRounds}`,
        );
      }
      console.log("S7_RESULTS_JSON=" + JSON.stringify(rows));
    },
    7_000_000,
  );

  it(
    "Stage 5: safety/fallback invariants (A-D) for EdgeBridge and CenterBridge",
    () => {
    for (const adapter of [EDGE_BRIDGE, CENTER_BRIDGE]) {
      const commutators = adapter.commutators();
      const setupTables = positionSetupTables();
      const targetPositions = Array.from({ length: 60 }, (_, i) => i);

      const rng = mulberry32(adapter.name === "edgeBridge" ? 99 : 100);
      const scramble = randomGigaminxScramble(30, rng);
      const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
      const cornerResult = solveCorners(scrambled);
      expect(cornerResult.trace.succeeded).toBe(true);
      const afterCorners = applySeq(scrambled, cornerResult.moves);
      const wingResult = solveWings(afterCorners);
      expect(wingResult.trace.succeeded).toBe(true);
      const afterWings = applySeq(afterCorners, wingResult.moves);
      const innerResult = solveInnerCorners(afterWings);
      expect(innerResult.trace.succeeded).toBe(true);
      let current = applySeq(afterWings, innerResult.moves);
      if (adapter.name === "centerBridge") {
        const edgeResult = solveEdgeBridges(current);
        expect(edgeResult.trace.succeeded).toBe(true);
        current = applySeq(current, edgeResult.moves);
      }

      const wrongPositions = targetPositions.filter((p) => adapter.perm(current)[p] !== p);
      const fixed = new Set<number>(targetPositions.filter((p) => adapter.perm(current)[p] === p));
      const visited = new Set<string>([stateSig(adapter.perm(current))]);
      const target = adapter.perm(current)[wrongPositions[0]];

      // A: enforceFixed=false -> usePrefilter must be inert.
      {
        let sawSkip = false;
        let sawEval = false;
        adapter.findSafeApplication(commutators, current, fixed, target, 60, targetPositions, setupTables, false, visited, (info: { composeSkipped: boolean }) => {
          sawEval = true;
          if (info.composeSkipped) sawSkip = true;
        }, undefined, true);
        expect(sawEval, `${adapter.name} Gate A probe: expected evaluated candidates`).toBe(true);
        expect(sawSkip, `${adapter.name} Gate A: usePrefilter must be inert when enforceFixed=false`).toBe(false);
      }
      // B: usePrefilter=false -> legacy path.
      {
        let sawSkip = false;
        let sawEval = false;
        adapter.findSafeApplication(commutators, current, fixed, target, -1, targetPositions, setupTables, true, visited, (info: { composeSkipped: boolean }) => {
          sawEval = true;
          if (info.composeSkipped) sawSkip = true;
        }, undefined, false);
        expect(sawEval, `${adapter.name} Gate B probe: expected evaluated candidates`).toBe(true);
        expect(sawSkip, `${adapter.name} Gate B: usePrefilter=false must never skip compose`).toBe(false);
      }
      // C/D: overlap -> skip+fixedReject; no-overlap -> compose executes. Force exhaustive scan with wrongAfterThreshold=-1.
      {
        let overlapSeen = 0;
        let overlapSkipped = 0;
        let noOverlapSeen = 0;
        let noOverlapComposeRan = 0;
        adapter.findSafeApplication(
          commutators,
          current,
          fixed,
          target,
          -1,
          targetPositions,
          setupTables,
          true,
          visited,
          (info: { prefilterOverlap: boolean; composeSkipped: boolean; outcome: string }) => {
            if (info.prefilterOverlap) {
              overlapSeen++;
              if (info.composeSkipped) overlapSkipped++;
              if (info.composeSkipped) expect(info.outcome, `${adapter.name} Gate C: overlap+skip must resolve as fixedReject`).toBe("fixedReject");
            } else {
              noOverlapSeen++;
              if (!info.composeSkipped) noOverlapComposeRan++;
            }
          },
          undefined,
          true,
        );
        console.log(`S7_GATE_CD orbit=${adapter.name} overlapSeen=${overlapSeen} overlapSkipped=${overlapSkipped} noOverlapSeen=${noOverlapSeen} noOverlapComposeRan=${noOverlapComposeRan}`);
        expect(overlapSeen, `${adapter.name} Gate C probe: expected at least one overlap candidate`).toBeGreaterThan(0);
        expect(overlapSkipped, `${adapter.name} Gate C: every overlap candidate must skip compose`).toBe(overlapSeen);
        if (noOverlapSeen > 0) {
          expect(noOverlapComposeRan, `${adapter.name} Gate D: every no-overlap candidate must execute full compose`).toBe(noOverlapSeen);
        }
      }
    }
    },
    7_000_000,
  );
});
