// GIGAMINX_S5_WING_SUPPORT_PREFILTER_PRODUCTION_INTEGRATION_V1 -- validation
// of the ACTUAL production `solveWings` (gigaminxSolver.ts now sets
// `WING_USE_PREFILTER = true` and passes it to all 3 findSafeWingApplication
// call sites in solveWings' strict/lateral/regression tiers).
//
// IMPORTANT terminology correction vs. this sprint's own instructions (§10
// C/D): those read "overlap -> compose executes, no-overlap -> compose
// skips", which is the OPPOSITE of what S4 built, measured, and the user
// approved (S4: compose is skipped when overlap EXISTS -- that's the common
// case, ~99.75% of candidates, and skipping it is exactly what produced the
// 2.63x speedup; "no overlap" is the RARE case (~0.25%) where
// fixedPreserved is algebraically GUARANTEED true, so it still needs the
// full compose for the OTHER checks (wrongAfter), not for fixed-safety).
// This file tests the actual shipped mechanism (skip-on-overlap), which is
// the one with the 2,844,216-candidate zero-counterexample evidence behind
// it; see the S4 report for the full derivation. Stage 5 (A-D) below is
// phrased to match the real mechanism, not the inverted prose.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveWings, areCornersSolved, areWingsSolved, __dev } from "./gigaminxSolver";

const { wingCommutators, tryExactFinishWings, tryCompoundFinishWings, findSafeWingApplication, positionSetupTables, wingSupportOverlapsFixed } = __dev as any;

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
function wingStateSig(state: GigaminxState): string {
  return `${state.wingPerm.join(",")}|${state.wingOrient.join(",")}`;
}

// Stage 6 reference path: the SAME control flow as production solveWings,
// but with usePrefilter hardcoded false -- i.e. the pre-S5 legacy behavior,
// for direct comparison against the now-modified real solveWings.
function runWingSolveLegacyReference(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; rounds: number } {
  const commutators = wingCommutators();
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
  const visited = new Set<string>([wingStateSig(current)]);

  try {
    while (targetPositions.some((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) found = tryExactFinishWings(commutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
      if (!found) {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.wingPerm[pos];
          strictFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited, undefined, undefined, undefined, false);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.wingPerm[pos];
              lateralFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited, undefined, undefined, undefined, false);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? tryCompoundFinishWings(commutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.wingPerm[pos];
                  regressiveFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited, undefined, undefined, undefined, false);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) throw new Error(`stuck (${wrongBefore} wings wrong)`);
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
      current = (found as { state: GigaminxState; seq: GigaminxTurn[] }).state;
      solution.push(...(found as { state: GigaminxState; seq: GigaminxTurn[] }).seq);
      visited.add(wingStateSig(current));
      fixed.clear();
      for (const p of targetPositions) if (current.wingPerm[p] === p && current.wingOrient[p] === 0) fixed.add(p);
    }
    return { moves: solution, succeeded: true, rounds: attempts };
  } catch {
    return { moves: solution, succeeded: false, rounds: attempts };
  }
}

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1, 2, 3];

describe("GIGAMINX_S5_WING_SUPPORT_PREFILTER_PRODUCTION_INTEGRATION_V1", () => {
  it(
    "Stage 1/2/4/6: real production solveWings vs legacy reference path, correctness + performance + equivalence",
    () => {
      const rows: any[] = [];
      for (const seed of seeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        expect(cornerResult.trace.succeeded).toBe(true);
        const afterCorners = applySeq(scrambled, cornerResult.moves);

        // Stage 1+2+4: the REAL, now-modified production function.
        const t0 = Date.now();
        const prod = solveWings(afterCorners);
        const prodMs = Date.now() - t0;
        expect(prod.trace.succeeded, `seed ${seed}: production solveWings failed`).toBe(true);
        const prodReplayed = applySeq(afterCorners, prod.moves);
        expect(areCornersSolved(prodReplayed), `seed ${seed}: corners not preserved (production)`).toBe(true);
        expect(areWingsSolved(prodReplayed), `seed ${seed}: wings not solved (production)`).toBe(true);

        // Stage 6: legacy (usePrefilter=false) reference path, same input.
        const t1 = Date.now();
        const legacy = runWingSolveLegacyReference(afterCorners);
        const legacyMs = Date.now() - t1;
        expect(legacy.succeeded, `seed ${seed}: legacy reference failed`).toBe(true);
        const legacyReplayed = applySeq(afterCorners, legacy.moves);
        expect(areCornersSolved(legacyReplayed), `seed ${seed}: corners not preserved (legacy)`).toBe(true);
        expect(areWingsSolved(legacyReplayed), `seed ${seed}: wings not solved (legacy)`).toBe(true);

        // Equivalence: production (prefilter ON) must match the legacy
        // reference (prefilter OFF) exactly in trajectory shape.
        expect(prod.trace.rounds, `seed ${seed}: rounds diverged from legacy reference`).toBe(legacy.rounds);
        expect(prod.moves.length, `seed ${seed}: move length diverged from legacy reference`).toBe(legacy.moves.length);

        rows.push({ seed, prodMs, legacyMs, rounds: prod.trace.rounds, movesEmitted: prod.trace.movesEmitted, speedup: legacyMs / prodMs });
        console.log(`S5 seed=${seed} prodMs=${prodMs} legacyMs=${legacyMs} speedup=${(legacyMs / prodMs).toFixed(2)}x rounds=${prod.trace.rounds}(=${legacy.rounds}) moves=${prod.moves.length}(=${legacy.moves.length})`);
      }
      console.log("S5_RESULTS_JSON=" + JSON.stringify(rows));
    },
    7_000_000,
  );

  it("Stage 5: safety/fallback invariants (A-D, matching the actual skip-on-overlap mechanism)", () => {
    const commutators = wingCommutators();
    const setupTables = positionSetupTables();
    const targetPositions = Array.from({ length: 60 }, (_, i) => i);

    const rng = mulberry32(99);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
    const cornerResult = solveCorners(scrambled);
    expect(cornerResult.trace.succeeded).toBe(true);
    const current = applySeq(scrambled, cornerResult.moves);
    const wrongPositions = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0);
    const fixed = new Set<number>(targetPositions.filter((p) => current.wingPerm[p] === p && current.wingOrient[p] === 0));
    const visited = new Set<string>([wingStateSig(current)]);

    // A: enforceFixed=false -> usePrefilter must be inert (composeSkipped never true), regardless of overlap.
    {
      let sawSkip = false;
      let sawEval = false;
      const target = current.wingPerm[wrongPositions[0]];
      findSafeWingApplication(
        commutators,
        current,
        fixed,
        target,
        60, // very permissive threshold so many candidates get evaluated
        targetPositions,
        setupTables,
        false, // enforceFixed = false
        visited,
        undefined,
        (info: { composeSkipped: boolean }) => {
          sawEval = true;
          if (info.composeSkipped) sawSkip = true;
        },
        undefined,
        true, // usePrefilter = true
      );
      expect(sawEval, "Gate D-A probe: expected at least one evaluated candidate").toBe(true);
      expect(sawSkip, "Gate D-A: usePrefilter must be inert when enforceFixed=false").toBe(false);
    }

    // B: usePrefilter=false -> legacy path, composeSkipped never true even with enforceFixed=true.
    {
      let sawSkip = false;
      let sawEval = false;
      const target = current.wingPerm[wrongPositions[0]];
      findSafeWingApplication(
        commutators,
        current,
        fixed,
        target,
        wrongPositions.length,
        targetPositions,
        setupTables,
        true,
        visited,
        undefined,
        (info: { composeSkipped: boolean }) => {
          sawEval = true;
          if (info.composeSkipped) sawSkip = true;
        },
        undefined,
        false, // usePrefilter = false
      );
      expect(sawEval, "Gate D-B probe: expected at least one evaluated candidate").toBe(true);
      expect(sawSkip, "Gate D-B: usePrefilter=false must never skip compose").toBe(false);
    }

    // C: overlap exists (enforceFixed=true, usePrefilter=true) -> compose IS skipped for that candidate, outcome=fixedReject.
    // D: no overlap (same settings) -> compose IS executed (not skipped).
    {
      let overlapSeen = 0;
      let overlapSkipped = 0;
      let noOverlapSeen = 0;
      let noOverlapSkipped = 0;
      const target = current.wingPerm[wrongPositions[0]];
      // wrongAfterThreshold=-1 is unsatisfiable (wrongAfter is always >=0), so
      // nothing can ever be ACCEPTED -- this forces the function to walk the
      // WHOLE candidate list (instead of returning after the first accepted
      // hit) so Gate C/D can observe both overlap and no-overlap candidates.
      findSafeWingApplication(
        commutators,
        current,
        fixed,
        target,
        -1,
        targetPositions,
        setupTables,
        true,
        visited,
        undefined,
        (info: { prefilterOverlap: boolean; composeSkipped: boolean; outcome: string }) => {
          if (info.prefilterOverlap) {
            overlapSeen++;
            if (info.composeSkipped) overlapSkipped++;
            if (info.composeSkipped) expect(info.outcome, "Gate C: overlap+skip must resolve as fixedReject").toBe("fixedReject");
          } else {
            noOverlapSeen++;
            if (!info.composeSkipped) noOverlapSkipped++; // counts "not skipped" (i.e. compose ran) among no-overlap
          }
        },
        undefined,
        true,
      );
      console.log(`S5_GATE_CD overlapSeen=${overlapSeen} overlapSkipped=${overlapSkipped} noOverlapSeen=${noOverlapSeen} noOverlapComposeRan=${noOverlapSkipped}`);
      expect(overlapSeen, "Gate C probe: expected at least one overlap candidate in this scenario").toBeGreaterThan(0);
      expect(overlapSkipped, "Gate C: every overlap candidate must skip compose").toBe(overlapSeen);
      if (noOverlapSeen > 0) {
        expect(noOverlapSkipped, "Gate D: every no-overlap candidate must execute full compose (not skip)").toBe(noOverlapSeen);
      }
    }
  });
});
