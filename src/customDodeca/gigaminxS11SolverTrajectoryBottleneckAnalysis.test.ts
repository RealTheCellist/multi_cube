// GIGAMINX_S11_SOLVER_TRAJECTORY_BOTTLENECK_ANALYSIS_V1 -- pure measurement,
// zero production changes, zero architecture testing, no DEAD verdict.
// Goal: characterize the REAL wall-clock variance across full solver
// trajectories (corners -> wing -> innerCorner -> edgeBridge -> centerBridge,
// matching solveFullGigaminx's own phase order exactly) to answer Q1-Q5 about
// what drives slow (5-15s) solves vs fast ones, and surface 2-3 architecture
// candidates for a FUTURE screening sprint -- this Sprint only gathers the
// evidence.
//
// Methodology note: earlier S9.x probes paid a large, UNNECESSARY one-time
// cost rebuilding all 5 commutator libraries from scratch inside each test
// process (cornerCommutators' own comment notes a ~170s one-time build cost;
// wing/edgeBridge/centerBridge compound that further since each depends on
// the previous orbit's library). This file is intended to be run with the
// GIGA_*_LIB_CACHE env vars pointing at the disk caches already produced by
// earlier sprints, so measured time reflects real per-solve variance, not
// library-build noise.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveInnerCorners, solveFullGigaminx, areWingsSolved, areEdgeBridgesSolved, areCenterBridgesSolved, __dev } from "./gigaminxSolver";

const {
  wingCommutators,
  findSafeWingApplication,
  tryExactFinishWings,
  tryCompoundFinishWings,
  edgeBridgeCommutators,
  findSafeEdgeBridgeApplication,
  tryExactFinishEdgeBridges,
  tryCompoundFinishEdgeBridges,
  centerBridgeCommutators,
  findSafeCenterBridgeApplication,
  tryExactFinishCenterBridges,
  tryCompoundFinishCenterBridges,
  positionSetupTables,
} = __dev as any;

const DBG_PATH = process.env.GIGA_S11_DEBUG;
function dbg(msg: string) {
  if (!DBG_PATH) return;
  require("node:fs").appendFileSync(DBG_PATH, `[${Date.now()}] ${msg}\n`);
}

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

type Orbit = "wing" | "edgeBridge" | "centerBridge";
interface Adapter {
  name: Orbit;
  size: number;
  perm: (s: GigaminxState) => Int8Array;
  isPieceSolved: (s: GigaminxState, pos: number) => boolean;
  stateSignature: (s: GigaminxState) => string;
  commutators: () => { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[];
  findSafeApplication: (...args: any[]) => any;
  tryExactFinish: (...args: any[]) => any;
  tryCompoundFinish: (...args: any[]) => any;
}
const WING: Adapter = {
  name: "wing",
  size: 60,
  perm: (s) => s.wingPerm,
  isPieceSolved: (s, p) => s.wingPerm[p] === p && s.wingOrient[p] === 0,
  stateSignature: (s) => `${s.wingPerm.join(",")}|${s.wingOrient.join(",")}`,
  commutators: wingCommutators,
  findSafeApplication: findSafeWingApplication,
  tryExactFinish: tryExactFinishWings,
  tryCompoundFinish: tryCompoundFinishWings,
};
const EDGE_BRIDGE: Adapter = {
  name: "edgeBridge",
  size: 60,
  perm: (s) => s.edgeBridgePerm,
  isPieceSolved: (s, p) => s.edgeBridgePerm[p] === p,
  stateSignature: (s) => s.edgeBridgePerm.join(","),
  commutators: edgeBridgeCommutators,
  findSafeApplication: findSafeEdgeBridgeApplication,
  tryExactFinish: tryExactFinishEdgeBridges,
  tryCompoundFinish: tryCompoundFinishEdgeBridges,
};
const CENTER_BRIDGE: Adapter = {
  name: "centerBridge",
  size: 60,
  perm: (s) => s.centerBridgePerm,
  isPieceSolved: (s, p) => s.centerBridgePerm[p] === p,
  stateSignature: (s) => s.centerBridgePerm.join(","),
  commutators: centerBridgeCommutators,
  findSafeApplication: findSafeCenterBridgeApplication,
  tryExactFinish: tryExactFinishCenterBridges,
  tryCompoundFinish: tryCompoundFinishCenterBridges,
};

type Branch = "exact" | "strict" | "lateral" | "compound" | "regressive" | "stuck";
interface RoundTrace {
  round: number;
  wrongBefore: number;
  wrongAfter: number;
  branch: Branch;
  exactMs: number;
  strictMs: number;
  lateralMs: number;
  compoundMs: number;
  regressiveMs: number;
  totalMs: number;
}
// Mirrors solveWings/solveEdgeBridges/solveCenterBridges' REAL round logic
// exactly (same tiers, same thresholds, same visited-signature handling --
// the same reference implementation pattern validated across S9/S9.1/S9.2/
// S9.3), but records a timing+branch breakdown per round instead of just
// driving the trajectory forward. No architecture overlay (unlike S9.x) --
// this Sprint measures reality only.
function runOrbitTraced(adapter: Adapter, state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; totalMs: number; rounds: RoundTrace[] } {
  const t0 = Date.now();
  const commutators = adapter.commutators();
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: adapter.size }, (_, i) => i);
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
  const visited = new Set<string>([adapter.stateSignature(current)]);
  const rounds: RoundTrace[] = [];

  try {
    while (targetPositions.some((p) => !adapter.isPieceSolved(current, p))) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
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
        if (wrongBefore >= 2 && wrongBefore <= 16) {
          found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
        }
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
            strictFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
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
              lateralFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
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
              if (wrongBefore >= 2 && wrongBefore <= 15) {
                const wrongPieceIds = wrongPositions.map((p) => adapter.perm(current)[p]);
                compoundFound = adapter.tryCompoundFinish(commutators, current, fixed, wrongPieceIds);
              }
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
                    regressiveFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited, undefined, undefined, undefined, true);
                    if (regressiveFound) break outerRegress;
                  }
                }
                regressiveMs = Date.now() - tA;
              }
              if (!regressiveFound) throw new Error(`stuck (${wrongBefore} ${adapter.name} wrong)`);
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error(`exhausted ${maxConsecutiveRegressive}-round regression budget`);
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
      solution.push(...found.seq);
      visited.add(adapter.stateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (adapter.isPieceSolved(current, p)) fixed.add(p);
      const wrongAfter = targetPositions.filter((p) => !adapter.isPieceSolved(current, p)).length;
      const totalMs = exactMs + strictMs + lateralMs + compoundMs + regressiveMs;
      rounds.push({ round: attempts, wrongBefore, wrongAfter, branch, exactMs, strictMs, lateralMs, compoundMs, regressiveMs, totalMs });
    }
    return { moves: solution, succeeded: true, totalMs: Date.now() - t0, rounds };
  } catch {
    return { moves: solution, succeeded: false, totalMs: Date.now() - t0, rounds };
  }
}

interface SolveRecord {
  seed: number;
  succeeded: boolean;
  totalMs: number;
  cornersMs: number;
  innerCornerMs: number;
  wingMs: number;
  edgeBridgeMs: number;
  centerBridgeMs: number;
  wing: RoundTrace[];
  edgeBridge: RoundTrace[];
  centerBridge: RoundTrace[];
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("GIGAMINX_S11_SOLVER_TRAJECTORY_BOTTLENECK_ANALYSIS_V1", () => {
  it(
    "collects full real-solve trajectories (40 seeds) with per-phase/per-tier timing breakdown",
    () => {
      const records: SolveRecord[] = [];
      for (const seed of SEEDS) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

        const tSolveStart = Date.now();
        const tC0 = Date.now();
        const cornerResult = solveCorners(scrambled);
        const cornersMs = Date.now() - tC0;
        if (!cornerResult.trace.succeeded) {
          dbg(`seed=${seed} corners FAILED, skipping`);
          continue;
        }
        const afterCorners = applySeq(scrambled, cornerResult.moves);

        const wingRun = runOrbitTraced(WING, afterCorners);
        if (!wingRun.succeeded || !areWingsSolved(applySeq(afterCorners, wingRun.moves))) {
          dbg(`seed=${seed} wing FAILED, skipping`);
          continue;
        }
        const afterWings = applySeq(afterCorners, wingRun.moves);

        const tIc0 = Date.now();
        const innerResult = solveInnerCorners(afterWings);
        const innerCornerMs = Date.now() - tIc0;
        if (!innerResult.trace.succeeded) {
          dbg(`seed=${seed} innerCorners FAILED, skipping`);
          continue;
        }
        const afterInner = applySeq(afterWings, innerResult.moves);

        const edgeRun = runOrbitTraced(EDGE_BRIDGE, afterInner);
        if (!edgeRun.succeeded || !areEdgeBridgesSolved(applySeq(afterInner, edgeRun.moves))) {
          dbg(`seed=${seed} edgeBridge FAILED, skipping`);
          continue;
        }
        const afterEdge = applySeq(afterInner, edgeRun.moves);

        const centerRun = runOrbitTraced(CENTER_BRIDGE, afterEdge);
        const succeeded = centerRun.succeeded && areCenterBridgesSolved(applySeq(afterEdge, centerRun.moves));

        const totalMs = Date.now() - tSolveStart;
        records.push({
          seed,
          succeeded,
          totalMs,
          cornersMs,
          innerCornerMs,
          wingMs: wingRun.totalMs,
          edgeBridgeMs: edgeRun.totalMs,
          centerBridgeMs: centerRun.totalMs,
          wing: wingRun.rounds,
          edgeBridge: edgeRun.rounds,
          centerBridge: centerRun.rounds,
        });
        dbg(`seed=${seed} succeeded=${succeeded} totalMs=${totalMs} corners=${cornersMs} inner=${innerCornerMs} wing=${wingRun.totalMs} edge=${edgeRun.totalMs} center=${centerRun.totalMs}`);
        console.log(`S11_SOLVE seed=${seed} succeeded=${succeeded} totalMs=${totalMs} cornersMs=${cornersMs} innerCornerMs=${innerCornerMs} wingMs=${wingRun.totalMs} edgeBridgeMs=${edgeRun.totalMs} centerBridgeMs=${centerRun.totalMs} wingRounds=${wingRun.rounds.length} edgeRounds=${edgeRun.rounds.length} centerRounds=${centerRun.rounds.length}`);
      }

      console.log(`S11_SOLVES_COLLECTED n=${records.length} attempted=${SEEDS.length}`);
      expect(records.length, "need a meaningful sample of completed full solves").toBeGreaterThanOrEqual(20);

      // ----- Summary stats: totalMs distribution, mean/median/p90/p95 -----
      function pct(sorted: number[], p: number): number {
        const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
        return sorted[idx];
      }
      const totals = records.map((r) => r.totalMs).sort((a, b) => a - b);
      const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
      console.log(
        `S11_TOTAL_STATS n=${totals.length} mean=${mean.toFixed(0)} median=${pct(totals, 50)} p90=${pct(totals, 90)} p95=${pct(totals, 95)} min=${totals[0]} max=${totals[totals.length - 1]}`,
      );

      // ----- Phase breakdown totals across all solves -----
      const phaseTotals = { corners: 0, innerCorner: 0, wing: 0, edgeBridge: 0, centerBridge: 0 };
      for (const r of records) {
        phaseTotals.corners += r.cornersMs;
        phaseTotals.innerCorner += r.innerCornerMs;
        phaseTotals.wing += r.wingMs;
        phaseTotals.edgeBridge += r.edgeBridgeMs;
        phaseTotals.centerBridge += r.centerBridgeMs;
      }
      console.log(`S11_PHASE_TOTALS ${JSON.stringify(phaseTotals)}`);

      // ----- Identify slow vs fast solves (top/bottom quartile by totalMs) -----
      const byTotal = [...records].sort((a, b) => a.totalMs - b.totalMs);
      const slowCount = Math.max(1, Math.floor(records.length * 0.25));
      const slow = byTotal.slice(-slowCount);
      const fast = byTotal.slice(0, slowCount);
      function avgPhase(rs: SolveRecord[], key: "cornersMs" | "innerCornerMs" | "wingMs" | "edgeBridgeMs" | "centerBridgeMs"): number {
        return rs.reduce((a, r) => a + r[key], 0) / rs.length;
      }
      console.log(
        `S11_SLOW_VS_FAST slowN=${slow.length} fastN=${fast.length} ` +
          `slowAvgTotal=${(slow.reduce((a, r) => a + r.totalMs, 0) / slow.length).toFixed(0)} fastAvgTotal=${(fast.reduce((a, r) => a + r.totalMs, 0) / fast.length).toFixed(0)} ` +
          `slowAvgCorners=${avgPhase(slow, "cornersMs").toFixed(0)} fastAvgCorners=${avgPhase(fast, "cornersMs").toFixed(0)} ` +
          `slowAvgInner=${avgPhase(slow, "innerCornerMs").toFixed(0)} fastAvgInner=${avgPhase(fast, "innerCornerMs").toFixed(0)} ` +
          `slowAvgWing=${avgPhase(slow, "wingMs").toFixed(0)} fastAvgWing=${avgPhase(fast, "wingMs").toFixed(0)} ` +
          `slowAvgEdge=${avgPhase(slow, "edgeBridgeMs").toFixed(0)} fastAvgEdge=${avgPhase(fast, "edgeBridgeMs").toFixed(0)} ` +
          `slowAvgCenter=${avgPhase(slow, "centerBridgeMs").toFixed(0)} fastAvgCenter=${avgPhase(fast, "centerBridgeMs").toFixed(0)}`,
      );

      // ----- Tier breakdown (exact/strict/lateral/compound/regressive) across wing/edgeBridge/centerBridge, slow vs fast -----
      function tierTotals(rs: SolveRecord[], orbitKey: "wing" | "edgeBridge" | "centerBridge") {
        const t = { exactMs: 0, strictMs: 0, lateralMs: 0, compoundMs: 0, regressiveMs: 0, rounds: 0, branchCounts: {} as Record<string, number> };
        for (const r of rs) {
          for (const round of r[orbitKey]) {
            t.exactMs += round.exactMs;
            t.strictMs += round.strictMs;
            t.lateralMs += round.lateralMs;
            t.compoundMs += round.compoundMs;
            t.regressiveMs += round.regressiveMs;
            t.rounds++;
            t.branchCounts[round.branch] = (t.branchCounts[round.branch] ?? 0) + 1;
          }
        }
        return t;
      }
      for (const orbitKey of ["wing", "edgeBridge", "centerBridge"] as const) {
        console.log(`S11_TIER_ALL orbit=${orbitKey} ${JSON.stringify(tierTotals(records, orbitKey))}`);
        console.log(`S11_TIER_SLOW orbit=${orbitKey} ${JSON.stringify(tierTotals(slow, orbitKey))}`);
        console.log(`S11_TIER_FAST orbit=${orbitKey} ${JSON.stringify(tierTotals(fast, orbitKey))}`);
      }

      // ----- Divergence point: for each slow solve, find the first round (across wing/edgeBridge/centerBridge, in trajectory order) whose single-round totalMs exceeds a fixed absolute threshold, and the first round that is NOT exact/strict. -----
      const DIVERGENCE_MS_THRESHOLD = 300;
      for (const r of slow) {
        let firstExpensiveRound: { orbit: string; round: number; wrongBefore: number; branch: Branch; ms: number } | null = null;
        let firstNonStrictRound: { orbit: string; round: number; wrongBefore: number; branch: Branch; ms: number } | null = null;
        for (const [orbitKey, rounds] of [
          ["wing", r.wing],
          ["edgeBridge", r.edgeBridge],
          ["centerBridge", r.centerBridge],
        ] as const) {
          for (const round of rounds) {
            if (!firstExpensiveRound && round.totalMs >= DIVERGENCE_MS_THRESHOLD) {
              firstExpensiveRound = { orbit: orbitKey, round: round.round, wrongBefore: round.wrongBefore, branch: round.branch, ms: round.totalMs };
            }
            if (!firstNonStrictRound && round.branch !== "exact" && round.branch !== "strict") {
              firstNonStrictRound = { orbit: orbitKey, round: round.round, wrongBefore: round.wrongBefore, branch: round.branch, ms: round.totalMs };
            }
          }
        }
        console.log(
          `S11_DIVERGENCE seed=${r.seed} totalMs=${r.totalMs} firstExpensiveRound=${JSON.stringify(firstExpensiveRound)} firstNonStrictRound=${JSON.stringify(firstNonStrictRound)}`,
        );
      }

      // ----- Also dump the single most expensive round across the entire dataset, per orbit -----
      for (const orbitKey of ["wing", "edgeBridge", "centerBridge"] as const) {
        let worst: RoundTrace | null = null;
        let worstSeed = -1;
        for (const r of records) {
          for (const round of r[orbitKey]) {
            if (!worst || round.totalMs > worst.totalMs) {
              worst = round;
              worstSeed = r.seed;
            }
          }
        }
        console.log(`S11_WORST_ROUND orbit=${orbitKey} seed=${worstSeed} ${JSON.stringify(worst)}`);
      }

      // ----- Cross-check: solveFullGigaminx's own trace (rounds/succeeded) on a couple of seeds, to confirm our reimplementation isn't silently diverging from production -----
      let crossCheckMismatches = 0;
      const crossCheckSeeds = [SEEDS[0], SEEDS[Math.floor(SEEDS.length / 2)], SEEDS[SEEDS.length - 1]];
      for (const seed of crossCheckSeeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const full = solveFullGigaminx(scrambled);
        const rec = records.find((r) => r.seed === seed);
        const ourWingRounds = rec ? rec.wing.length : null;
        const ourEdgeRounds = rec ? rec.edgeBridge.length : null;
        const ourCenterRounds = rec ? rec.centerBridge.length : null;
        const match = rec ? full.wingsTrace.rounds === ourWingRounds && full.edgeBridgesTrace.rounds === ourEdgeRounds && full.centerBridgesTrace.rounds === ourCenterRounds : "no-record(skipped-seed)";
        if (rec && match !== true) crossCheckMismatches++;
        console.log(
          `S11_CROSSCHECK seed=${seed} prodWingRounds=${full.wingsTrace.rounds} ourWingRounds=${ourWingRounds} prodEdgeRounds=${full.edgeBridgesTrace.rounds} ourEdgeRounds=${ourEdgeRounds} prodCenterRounds=${full.centerBridgesTrace.rounds} ourCenterRounds=${ourCenterRounds} match=${match}`,
        );
      }
      console.log(`S11_CROSSCHECK_SUMMARY mismatches=${crossCheckMismatches}/${crossCheckSeeds.length}`);
    },
    7_000_000,
  );
});
