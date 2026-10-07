// GIGAMINX_S12_PATHOLOGICAL_TRAJECTORY_DIAGNOSTIC -- short, targeted probe.
// Zero production changes beyond the __dev export addition the user
// explicitly approved (cornerCommutators/tryExactFinishCorners/
// tryCompoundFinishCorners/findSafeCornerApplication/cornerStateSignature --
// pure read-only exposure, no behavior change, mirrors the existing export
// pattern already used for every other orbit).
//
// Question: for the two S11 outliers (seed=1: corners took 22.7s; seed=28:
// edgeBridge needed 118 rounds vs the normal ~55-70), is this a legitimate
// "just a hard scramble needing many regression steps" or a structural
// pathology (state revisited, same candidate repeated, deterministic-ish
// cycling)? Compare each against a normal seed with the same round-level
// instrumentation (branch, per-tier ms, wrongBefore/After, state signature).
import { describe, it } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveWings, solveInnerCorners, __dev } from "./gigaminxSolver";

const {
  cornerCommutators,
  tryExactFinishCorners,
  tryCompoundFinishCorners,
  findSafeCornerApplication,
  cornerStateSignature,
  edgeBridgeCommutators,
  findSafeEdgeBridgeApplication,
  tryExactFinishEdgeBridges,
  tryCompoundFinishEdgeBridges,
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

type Branch = "exact" | "strict" | "lateral" | "compound" | "regressive" | "stuck";
interface RoundTrace {
  round: number;
  wrongBefore: number;
  wrongAfter: number;
  branch: Branch;
  moveLen: number;
  exactMs: number;
  strictMs: number;
  lateralMs: number;
  compoundMs: number;
  regressiveMs: number;
  totalMs: number;
  sig: string;
}

// Instrumented reimplementation of solveCorners' round loop (mirrors
// gigaminxSolver.ts lines ~563-666 exactly), using the newly-exported
// corner internals, with per-round branch/timing/state-signature capture.
function runCornersTraced(state: GigaminxState, maxAttempts = 400): { succeeded: boolean; rounds: RoundTrace[] } {
  const commutators = cornerCommutators();
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: 20 }, (_, i) => i);
  let current = state;
  const fixed = new Set<number>();
  let attempts = 0;
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([cornerStateSignature(current)]);
  const rounds: RoundTrace[] = [];
  try {
    while (targetPositions.some((p) => current.cornerPerm[p] !== p || current.cornerOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error("exceeded maxAttempts");
      const wrongPositions = targetPositions.filter((p) => current.cornerPerm[p] !== p || current.cornerOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      let exactMs = 0,
        strictMs = 0,
        lateralMs = 0,
        compoundMs = 0,
        regressiveMs = 0;
      let found: any = null;
      let branch: Branch = "stuck";
      {
        const tA = Date.now();
        if (wrongBefore >= 2 && wrongBefore <= 6) found = tryExactFinishCorners(commutators, current, fixed, wrongPositions.map((p) => current.cornerPerm[p]));
        exactMs = Date.now() - tA;
      }
      if (found) {
        branch = "exact";
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: any = null;
        {
          const tA = Date.now();
          for (let i = 0; i < tries; i++) {
            const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
            const target = current.cornerPerm[pos];
            strictFound = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited);
            if (strictFound) break;
          }
          strictMs = Date.now() - tA;
        }
        if (strictFound) {
          found = strictFound;
          branch = "strict";
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: any = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            const tA = Date.now();
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.cornerPerm[pos];
              lateralFound = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited);
              if (lateralFound) break;
            }
            lateralMs = Date.now() - tA;
          }
          if (lateralFound) {
            found = lateralFound;
            branch = "lateral";
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            let compoundFound: any = null;
            {
              const tA = Date.now();
              if (wrongBefore >= 2 && wrongBefore <= 5) compoundFound = tryCompoundFinishCorners(commutators, current, fixed, wrongPositions.map((p) => current.cornerPerm[p]));
              compoundMs = Date.now() - tA;
            }
            if (compoundFound) {
              found = compoundFound;
              branch = "compound";
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: any = null;
              {
                const tA = Date.now();
                outerRegress: for (const step of REGRESSION_LADDER) {
                  for (let i = 0; i < tries; i++) {
                    const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                    const target = current.cornerPerm[pos];
                    regressiveFound = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited);
                    if (regressiveFound) break outerRegress;
                  }
                }
                regressiveMs = Date.now() - tA;
              }
              if (!regressiveFound) throw new Error("stuck");
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error("exhausted regression budget");
              found = regressiveFound;
              branch = "regressive";
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }
      current = found.state;
      visited.add(cornerStateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (current.cornerPerm[p] === p && current.cornerOrient[p] === 0) fixed.add(p);
      const wrongAfter = targetPositions.filter((p) => current.cornerPerm[p] !== p || current.cornerOrient[p] !== 0).length;
      rounds.push({ round: attempts, wrongBefore, wrongAfter, branch, moveLen: found.seq.length, exactMs, strictMs, lateralMs, compoundMs, regressiveMs, totalMs: exactMs + strictMs + lateralMs + compoundMs + regressiveMs, sig: cornerStateSignature(current) });
    }
    return { succeeded: true, rounds };
  } catch {
    return { succeeded: false, rounds };
  }
}

interface EdgeAdapter {
  size: number;
  perm: (s: GigaminxState) => Int8Array;
  isPieceSolved: (s: GigaminxState, pos: number) => boolean;
  stateSignature: (s: GigaminxState) => string;
}
const EDGE_BRIDGE: EdgeAdapter = {
  size: 60,
  perm: (s) => s.edgeBridgePerm,
  isPieceSolved: (s, p) => s.edgeBridgePerm[p] === p,
  stateSignature: (s) => s.edgeBridgePerm.join(","),
};
function runEdgeBridgeTraced(state: GigaminxState, maxAttempts = 400): { succeeded: boolean; rounds: RoundTrace[] } {
  const adapter = EDGE_BRIDGE;
  const commutators = edgeBridgeCommutators();
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: adapter.size }, (_, i) => i);
  let current = state;
  const fixed = new Set<number>();
  let attempts = 0;
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([adapter.stateSignature(current)]);
  const rounds: RoundTrace[] = [];
  try {
    while (targetPositions.some((p) => !adapter.isPieceSolved(current, p))) {
      attempts++;
      if (attempts > maxAttempts) throw new Error("exceeded maxAttempts");
      const wrongPositions = targetPositions.filter((p) => !adapter.isPieceSolved(current, p));
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      let exactMs = 0,
        strictMs = 0,
        lateralMs = 0,
        compoundMs = 0,
        regressiveMs = 0;
      let found: any = null;
      let branch: Branch = "stuck";
      {
        const tA = Date.now();
        if (wrongBefore >= 2 && wrongBefore <= 16) found = tryExactFinishEdgeBridges(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
        exactMs = Date.now() - tA;
      }
      if (found) {
        branch = "exact";
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: any = null;
        {
          const tA = Date.now();
          for (let i = 0; i < tries; i++) {
            const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
            const target = adapter.perm(current)[pos];
            strictFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
            if (strictFound) break;
          }
          strictMs = Date.now() - tA;
        }
        if (strictFound) {
          found = strictFound;
          branch = "strict";
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: any = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            const tA = Date.now();
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = adapter.perm(current)[pos];
              lateralFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
              if (lateralFound) break;
            }
            lateralMs = Date.now() - tA;
          }
          if (lateralFound) {
            found = lateralFound;
            branch = "lateral";
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            let compoundFound: any = null;
            {
              const tA = Date.now();
              if (wrongBefore >= 2 && wrongBefore <= 15) compoundFound = tryCompoundFinishEdgeBridges(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
              compoundMs = Date.now() - tA;
            }
            if (compoundFound) {
              found = compoundFound;
              branch = "compound";
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: any = null;
              {
                const tA = Date.now();
                outerRegress: for (const step of REGRESSION_LADDER) {
                  for (let i = 0; i < tries; i++) {
                    const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                    const target = adapter.perm(current)[pos];
                    regressiveFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited, undefined, undefined, undefined, true);
                    if (regressiveFound) break outerRegress;
                  }
                }
                regressiveMs = Date.now() - tA;
              }
              if (!regressiveFound) throw new Error("stuck");
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error("exhausted regression budget");
              found = regressiveFound;
              branch = "regressive";
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }
      current = found.state;
      visited.add(adapter.stateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (adapter.isPieceSolved(current, p)) fixed.add(p);
      const wrongAfter = targetPositions.filter((p) => !adapter.isPieceSolved(current, p)).length;
      rounds.push({ round: attempts, wrongBefore, wrongAfter, branch, moveLen: found.seq.length, exactMs, strictMs, lateralMs, compoundMs, regressiveMs, totalMs: exactMs + strictMs + lateralMs + compoundMs + regressiveMs, sig: adapter.stateSignature(current) });
    }
    return { succeeded: true, rounds };
  } catch {
    return { succeeded: false, rounds };
  }
}

function analyzeRounds(label: string, rounds: RoundTrace[]) {
  const sigCounts = new Map<string, number[]>();
  rounds.forEach((r, i) => {
    if (!sigCounts.has(r.sig)) sigCounts.set(r.sig, []);
    sigCounts.get(r.sig)!.push(i);
  });
  const repeated = [...sigCounts.entries()].filter(([, idxs]) => idxs.length > 1);
  const branchCounts: Record<string, number> = {};
  for (const r of rounds) branchCounts[r.branch] = (branchCounts[r.branch] ?? 0) + 1;
  const totalMs = rounds.reduce((a, r) => a + r.totalMs, 0);
  console.log(`S12_SUMMARY label=${label} rounds=${rounds.length} totalMs=${totalMs} branchCounts=${JSON.stringify(branchCounts)} repeatedStateSignatures=${repeated.length}`);
  if (repeated.length > 0) {
    console.log(`S12_REPEATED_STATES label=${label} ${JSON.stringify(repeated.slice(0, 10).map(([sig, idxs]) => ({ sigPrefix: sig.slice(0, 40), rounds: idxs.map((i) => rounds[i].round), wrongBeforeAtEach: idxs.map((i) => rounds[i].wrongBefore) })))}`);
  }
  // wrongBefore trajectory (coarse, every 5th round) to see oscillation shape
  const traj = rounds.filter((_, i) => i % 5 === 0).map((r) => r.wrongBefore);
  console.log(`S12_WRONGBEFORE_TRAJECTORY label=${label} ${JSON.stringify(traj)}`);
  // dump full round detail for rounds beyond a length threshold typical of "normal" runs, to see where it diverges
  console.log(`S12_ROUNDS_JSON label=${label} ${JSON.stringify(rounds)}`);
}

describe("GIGAMINX_S12_PATHOLOGICAL_TRAJECTORY_DIAGNOSTIC", () => {
  it(
    "diagnoses seed=1 (corners outlier) and seed=28 (edgeBridge outlier) vs a normal seed",
    () => {
      // ----- seed=1 corners (pathological) vs seed=2 corners (normal) -----
      for (const seed of [1, 2]) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const result = runCornersTraced(scrambled);
        analyzeRounds(`corners_seed${seed}`, result.rounds);
      }

      // ----- seed=28 edgeBridge (pathological) vs seed=2 edgeBridge (normal) -----
      // Drive corners -> wing -> innerCorner via REAL production (black box,
      // not the focus of this diagnostic) to reach the exact same input
      // edgeBridge saw in S11, then run the instrumented edgeBridge loop.
      for (const seed of [28, 2]) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        if (!cornerResult.trace.succeeded) {
          console.log(`S12_SKIP seed=${seed} corners failed`);
          continue;
        }
        const afterCorners = applySeq(scrambled, cornerResult.moves);
        const wingResult = solveWings(afterCorners);
        if (!wingResult.trace.succeeded) {
          console.log(`S12_SKIP seed=${seed} wing failed`);
          continue;
        }
        const afterWings = applySeq(afterCorners, wingResult.moves);
        const innerResult = solveInnerCorners(afterWings);
        if (!innerResult.trace.succeeded) {
          console.log(`S12_SKIP seed=${seed} innerCorners failed`);
          continue;
        }
        const afterInner = applySeq(afterWings, innerResult.moves);
        const result = runEdgeBridgeTraced(afterInner);
        analyzeRounds(`edgeBridge_seed${seed}`, result.rounds);
      }
    },
    1_200_000,
  );
});
