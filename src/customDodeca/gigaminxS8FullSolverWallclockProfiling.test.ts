// GIGAMINX_S8_FULL_SOLVER_WALLCLOCK_PROFILING_V1 -- pure profiling, zero
// production changes. Reimplements the CURRENT production control flow
// (usePrefilter=true for Wing/EdgeBridge/CenterBridge, matching the S5/S7
// defaults already shipped) with the existing opt-in instrumentation hooks
// added in S3/S4/S6 (onEval/onGenerate/usePrefilter on
// findSafeWingApplication/findSafeEdgeBridgeApplication/
// findSafeCenterBridgeApplication) -- no new hooks, no gigaminxSolver.ts
// changes at all this sprint. Corner/InnerCorner have no such hooks (never
// added), so they're measured at wall-clock granularity only, consistent
// with their much smaller share of total time.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveInnerCorners, areCornersSolved, areWingsSolved, areInnerCornersSolved, areEdgeBridgesSolved, areCenterBridgesSolved, __dev } from "./gigaminxSolver";

const {
  wingKeyFor,
  wingCommutators,
  tryExactFinishWings,
  tryCompoundFinishWings,
  findSafeWingApplication,
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
function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
function stats(xs: readonly number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return { mean: mean(xs), median: quantile(s, 0.5), p90: quantile(s, 0.9), p95: quantile(s, 0.95), max: s[s.length - 1] ?? 0, min: s[0] ?? 0 };
}

interface TierStat {
  attempts: number;
  totalMs: number;
}
function newTier(): TierStat {
  return { attempts: 0, totalMs: 0 };
}
interface FinishStat {
  attempts: number;
  successes: number;
  totalMs: number;
}
function newFinish(): FinishStat {
  return { attempts: 0, successes: 0, totalMs: 0 };
}
interface Funnel {
  generated: number;
  evaluated: number;
  composeExecuted: number;
  composeSkipped: number;
  fixedReject: number;
  improvementReject: number;
  visitedReject: number;
  accepted: number;
}
function newFunnel(): Funnel {
  return { generated: 0, evaluated: 0, composeExecuted: 0, composeSkipped: 0, fixedReject: 0, improvementReject: 0, visitedReject: 0, accepted: 0 };
}

interface OrbitRunStats {
  totalMs: number;
  rounds: number;
  funnel: Funnel;
  strict: TierStat;
  lateral: TierStat;
  regressionStages: TierStat[];
  exactFinish: FinishStat;
  compoundFinish: FinishStat;
  lookupMsTotal: number;
  composeMsTotal: number;
  checkMsTotal: number;
  bookkeepingMs: number;
}

// --- Wing (has fine-grained lookup/compose/check timing via onEval) ---
function runWingInstrumented(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; stats: OrbitRunStats } {
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
  const visited = new Set<string>([`${current.wingPerm.join(",")}|${current.wingOrient.join(",")}`]);

  const funnel = newFunnel();
  const strict = newTier();
  const lateral = newTier();
  const regressionStages = REGRESSION_LADDER.map(() => newTier());
  const exactFinish = newFinish();
  const compoundFinish = newFinish();
  const wingT0 = Date.now();

  function onEval(info: { outcome: string; lookupMs: number; composeMs: number; checkMs: number; composeSkipped: boolean }) {
    funnel.evaluated++;
    (funnel as any).lookupMs = ((funnel as any).lookupMs ?? 0) + info.lookupMs;
    (funnel as any).composeMs = ((funnel as any).composeMs ?? 0) + info.composeMs;
    (funnel as any).checkMs = ((funnel as any).checkMs ?? 0) + info.checkMs;
    if (info.composeSkipped) funnel.composeSkipped++;
    else funnel.composeExecuted++;
    if (info.outcome === "fixedReject") funnel.fixedReject++;
    else if (info.outcome === "improvementReject") funnel.improvementReject++;
    else if (info.outcome === "visitedReject") funnel.visitedReject++;
    else funnel.accepted++;
  }
  function onGenerate() {
    funnel.generated++;
  }
  function callFind(tier: TierStat, target: number, wrongAfterThreshold: number, enforceFixedFlag: boolean) {
    tier.attempts++;
    const t0 = Date.now();
    const found = findSafeWingApplication(commutators, current, fixed, target, wrongAfterThreshold, targetPositions, setupTables, enforceFixedFlag, visited, undefined, onEval, onGenerate, true);
    tier.totalMs += Date.now() - t0;
    return found;
  }

  try {
    while (targetPositions.some((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        exactFinish.attempts++;
        const t0 = Date.now();
        found = tryExactFinishWings(commutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
        exactFinish.totalMs += Date.now() - t0;
        if (found) exactFinish.successes++;
      }
      if (!found) {
        let strictFound: any = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.wingPerm[pos];
          strictFound = callFind(strict, target, wrongBefore - 1, true);
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
              const target = current.wingPerm[pos];
              lateralFound = callFind(lateral, target, wrongBefore, true);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            compoundFinish.attempts++;
            const t0 = Date.now();
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? tryCompoundFinishWings(commutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p])) : null;
            compoundFinish.totalMs += Date.now() - t0;
            if (compoundFound) {
              compoundFinish.successes++;
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: any = null;
              outerRegress: for (let stageIdx = 0; stageIdx < REGRESSION_LADDER.length; stageIdx++) {
                const step = REGRESSION_LADDER[stageIdx];
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.wingPerm[pos];
                  regressiveFound = callFind(regressionStages[stageIdx], target, wrongBefore + step, false);
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
      current = (found as any).state;
      solution.push(...(found as any).seq);
      visited.add(`${current.wingPerm.join(",")}|${current.wingOrient.join(",")}`);
      fixed.clear();
      for (const p of targetPositions) if (current.wingPerm[p] === p && current.wingOrient[p] === 0) fixed.add(p);
    }
    const wingTotalMs = Date.now() - wingT0;
    const sumTierMs = strict.totalMs + lateral.totalMs + regressionStages.reduce((a, s) => a + s.totalMs, 0) + exactFinish.totalMs + compoundFinish.totalMs;
    return {
      moves: solution,
      succeeded: true,
      stats: { totalMs: wingTotalMs, rounds: attempts, funnel, strict, lateral, regressionStages, exactFinish, compoundFinish, lookupMsTotal: (funnel as any).lookupMs ?? 0, composeMsTotal: (funnel as any).composeMs ?? 0, checkMsTotal: (funnel as any).checkMs ?? 0, bookkeepingMs: wingTotalMs - sumTierMs },
    };
  } catch {
    const wingTotalMs = Date.now() - wingT0;
    const sumTierMs = strict.totalMs + lateral.totalMs + regressionStages.reduce((a, s) => a + s.totalMs, 0) + exactFinish.totalMs + compoundFinish.totalMs;
    return {
      moves: solution,
      succeeded: false,
      stats: { totalMs: wingTotalMs, rounds: attempts, funnel, strict, lateral, regressionStages, exactFinish, compoundFinish, lookupMsTotal: (funnel as any).lookupMs ?? 0, composeMsTotal: (funnel as any).composeMs ?? 0, checkMsTotal: (funnel as any).checkMs ?? 0, bookkeepingMs: wingTotalMs - sumTierMs },
    };
  }
}

// --- EdgeBridge/CenterBridge (no fine-grained sub-step timing, but full funnel + tier timing) ---
type Orbit = "edgeBridge" | "centerBridge";
interface Adapter {
  name: Orbit;
  perm: (s: GigaminxState) => Int8Array;
  commutators: () => any[];
  tryExactFinish: (commutators: any, current: GigaminxState, fixed: Set<number>, pieces: number[]) => any;
  tryCompoundFinish: (commutators: any, current: GigaminxState, fixed: Set<number>, pieces: number[]) => any;
  findSafeApplication: (...args: any[]) => any;
}
const EDGE_BRIDGE: Adapter = { name: "edgeBridge", perm: (s) => s.edgeBridgePerm, commutators: edgeBridgeCommutators, tryExactFinish: tryExactFinishEdgeBridges, tryCompoundFinish: tryCompoundFinishEdgeBridges, findSafeApplication: findSafeEdgeBridgeApplication };
const CENTER_BRIDGE: Adapter = { name: "centerBridge", perm: (s) => s.centerBridgePerm, commutators: centerBridgeCommutators, tryExactFinish: tryExactFinishCenterBridges, tryCompoundFinish: tryCompoundFinishCenterBridges, findSafeApplication: findSafeCenterBridgeApplication };

function runOrbitInstrumented(adapter: Adapter, state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; stats: OrbitRunStats } {
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
  const visited = new Set<string>([current.edgeBridgePerm ? adapter.perm(current).join(",") : ""]);

  const funnel = newFunnel();
  const strict = newTier();
  const lateral = newTier();
  const regressionStages = REGRESSION_LADDER.map(() => newTier());
  const exactFinish = newFinish();
  const compoundFinish = newFinish();
  const orbitT0 = Date.now();

  function onEval(info: { outcome: string; composeSkipped: boolean }) {
    funnel.evaluated++;
    if (info.composeSkipped) funnel.composeSkipped++;
    else funnel.composeExecuted++;
    if (info.outcome === "fixedReject") funnel.fixedReject++;
    else if (info.outcome === "improvementReject") funnel.improvementReject++;
    else if (info.outcome === "visitedReject") funnel.visitedReject++;
    else funnel.accepted++;
  }
  function onGenerate() {
    funnel.generated++;
  }
  function callFind(tier: TierStat, target: number, wrongAfterThreshold: number, enforceFixedFlag: boolean) {
    tier.attempts++;
    const t0 = Date.now();
    const found = adapter.findSafeApplication(commutators, current, fixed, target, wrongAfterThreshold, targetPositions, setupTables, enforceFixedFlag, visited, onEval, onGenerate, true);
    tier.totalMs += Date.now() - t0;
    return found;
  }

  try {
    while (targetPositions.some((p) => adapter.perm(current)[p] !== p)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => adapter.perm(current)[p] !== p);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: any = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        exactFinish.attempts++;
        const t0 = Date.now();
        found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
        exactFinish.totalMs += Date.now() - t0;
        if (found) exactFinish.successes++;
      }
      if (!found) {
        let strictFound: any = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = adapter.perm(current)[pos];
          strictFound = callFind(strict, target, wrongBefore - 1, true);
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
              lateralFound = callFind(lateral, target, wrongBefore, true);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            compoundFinish.attempts++;
            const t0 = Date.now();
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? adapter.tryCompoundFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p])) : null;
            compoundFinish.totalMs += Date.now() - t0;
            if (compoundFound) {
              compoundFinish.successes++;
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: any = null;
              outerRegress: for (let stageIdx = 0; stageIdx < REGRESSION_LADDER.length; stageIdx++) {
                const step = REGRESSION_LADDER[stageIdx];
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = adapter.perm(current)[pos];
                  regressiveFound = callFind(regressionStages[stageIdx], target, wrongBefore + step, false);
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
      visited.add(adapter.perm(current).join(","));
      fixed.clear();
      for (const p of targetPositions) if (adapter.perm(current)[p] === p) fixed.add(p);
    }
    const totalMs = Date.now() - orbitT0;
    const sumTierMs = strict.totalMs + lateral.totalMs + regressionStages.reduce((a, s) => a + s.totalMs, 0) + exactFinish.totalMs + compoundFinish.totalMs;
    return { moves: solution, succeeded: true, stats: { totalMs, rounds: attempts, funnel, strict, lateral, regressionStages, exactFinish, compoundFinish, lookupMsTotal: 0, composeMsTotal: 0, checkMsTotal: 0, bookkeepingMs: totalMs - sumTierMs } };
  } catch {
    const totalMs = Date.now() - orbitT0;
    const sumTierMs = strict.totalMs + lateral.totalMs + regressionStages.reduce((a, s) => a + s.totalMs, 0) + exactFinish.totalMs + compoundFinish.totalMs;
    return { moves: solution, succeeded: false, stats: { totalMs, rounds: attempts, funnel, strict, lateral, regressionStages, exactFinish, compoundFinish, lookupMsTotal: 0, composeMsTotal: 0, checkMsTotal: 0, bookkeepingMs: totalMs - sumTierMs } };
  }
}

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1); // seeds 1..10
const RUNS_PER_SEED = 2;

describe("GIGAMINX_S8_FULL_SOLVER_WALLCLOCK_PROFILING_V1", () => {
  it(
    "profiles current production solver (prefilter ON) across 10 seeds x 2 runs",
    () => {
      const rows: any[] = [];
      for (const seed of SEEDS) {
        for (let run = 0; run < RUNS_PER_SEED; run++) {
          const rng = mulberry32(seed * 13 + 7 + run * 1000003);
          const scramble = randomGigaminxScramble(30, rng);
          const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

          const t0 = Date.now();
          const cornerResult = solveCorners(scrambled);
          const cornerMs = Date.now() - t0;
          expect(cornerResult.trace.succeeded, `seed ${seed} run ${run}: corners failed`).toBe(true);
          const afterCorners = applySeq(scrambled, cornerResult.moves);

          const wingRes = runWingInstrumented(afterCorners);
          expect(wingRes.succeeded, `seed ${seed} run ${run}: wings failed`).toBe(true);
          const afterWings = applySeq(afterCorners, wingRes.moves);

          const t2 = Date.now();
          const innerResult = solveInnerCorners(afterWings);
          const innerMs = Date.now() - t2;
          expect(innerResult.trace.succeeded, `seed ${seed} run ${run}: innerCorners failed`).toBe(true);
          const afterInner = applySeq(afterWings, innerResult.moves);

          const edgeRes = runOrbitInstrumented(EDGE_BRIDGE, afterInner);
          expect(edgeRes.succeeded, `seed ${seed} run ${run}: edgeBridges failed`).toBe(true);
          const afterEdge = applySeq(afterInner, edgeRes.moves);

          const centerRes = runOrbitInstrumented(CENTER_BRIDGE, afterEdge);
          expect(centerRes.succeeded, `seed ${seed} run ${run}: centerBridges failed`).toBe(true);
          const afterCenter = applySeq(afterEdge, centerRes.moves);

          const totalMs = cornerMs + wingRes.stats.totalMs + innerMs + edgeRes.stats.totalMs + centerRes.stats.totalMs;

          expect(areCornersSolved(afterCenter)).toBe(true);
          expect(areWingsSolved(afterCenter)).toBe(true);
          expect(areInnerCornersSolved(afterCenter)).toBe(true);
          expect(areEdgeBridgesSolved(afterCenter)).toBe(true);
          expect(areCenterBridgesSolved(afterCenter)).toBe(true);

          rows.push({ seed, run, totalMs, cornerMs, wingMs: wingRes.stats.totalMs, innerMs, edgeMs: edgeRes.stats.totalMs, centerMs: centerRes.stats.totalMs, wing: wingRes.stats, edge: edgeRes.stats, center: centerRes.stats });
          console.log(
            `S8 seed=${seed} run=${run} totalMs=${totalMs} corner=${cornerMs} wing=${wingRes.stats.totalMs} inner=${innerMs} edge=${edgeRes.stats.totalMs} center=${centerRes.stats.totalMs} ` +
              `wingRounds=${wingRes.stats.rounds} wingGen=${wingRes.stats.funnel.generated} wingEval=${wingRes.stats.funnel.evaluated} wingComposeExec=${wingRes.stats.funnel.composeExecuted} wingComposeSkip=${wingRes.stats.funnel.composeSkipped} ` +
              `wingLookupMs=${wingRes.stats.lookupMsTotal.toFixed(1)} wingComposeMs=${wingRes.stats.composeMsTotal.toFixed(1)} wingCheckMs=${wingRes.stats.checkMsTotal.toFixed(1)} wingBookkeepMs=${wingRes.stats.bookkeepingMs} ` +
              `wingStrict=${wingRes.stats.strict.totalMs} wingLateral=${wingRes.stats.lateral.totalMs} wingExact=${wingRes.stats.exactFinish.totalMs}/${wingRes.stats.exactFinish.successes}of${wingRes.stats.exactFinish.attempts} wingCompound=${wingRes.stats.compoundFinish.totalMs}/${wingRes.stats.compoundFinish.successes}of${wingRes.stats.compoundFinish.attempts} ` +
              `edgeStrict=${edgeRes.stats.strict.totalMs} edgeLateral=${edgeRes.stats.lateral.totalMs} edgeComposeExec=${edgeRes.stats.funnel.composeExecuted} edgeComposeSkip=${edgeRes.stats.funnel.composeSkipped} ` +
              `centerStrict=${centerRes.stats.strict.totalMs} centerLateral=${centerRes.stats.lateral.totalMs} centerComposeExec=${centerRes.stats.funnel.composeExecuted} centerComposeSkip=${centerRes.stats.funnel.composeSkipped}`,
          );
        }
      }

      const totals = rows.map((r) => r.totalMs);
      const corners = rows.map((r) => r.cornerMs);
      const wings = rows.map((r) => r.wingMs);
      const inners = rows.map((r) => r.innerMs);
      const edges = rows.map((r) => r.edgeMs);
      const centers = rows.map((r) => r.centerMs);

      console.log("S8_PHASE_STATS=" + JSON.stringify({ total: stats(totals), corner: stats(corners), wing: stats(wings), inner: stats(inners), edge: stats(edges), center: stats(centers) }));
      console.log(`S8_LE3S_COUNT=${totals.filter((t) => t <= 3000).length}/${totals.length}`);

      const sumMs = (f: (r: any) => number) => rows.reduce((a, r) => a + f(r), 0);
      const wingStrictMs = sumMs((r) => r.wing.strict.totalMs);
      const wingLateralMs = sumMs((r) => r.wing.lateral.totalMs);
      const wingRegressionMs = sumMs((r) => r.wing.regressionStages.reduce((a: number, s: any) => a + s.totalMs, 0));
      const wingExactMs = sumMs((r) => r.wing.exactFinish.totalMs);
      const wingCompoundMs = sumMs((r) => r.wing.compoundFinish.totalMs);
      const wingBookkeepMs = sumMs((r) => r.wing.bookkeepingMs);
      const wingTotalAll = sumMs((r) => r.wingMs);
      console.log(
        `S8_WING_INTERNAL strict=${wingStrictMs}(${((wingStrictMs / wingTotalAll) * 100).toFixed(1)}%) lateral=${wingLateralMs}(${((wingLateralMs / wingTotalAll) * 100).toFixed(1)}%) ` +
          `regression=${wingRegressionMs}(${((wingRegressionMs / wingTotalAll) * 100).toFixed(1)}%) exact=${wingExactMs}(${((wingExactMs / wingTotalAll) * 100).toFixed(1)}%) ` +
          `compound=${wingCompoundMs}(${((wingCompoundMs / wingTotalAll) * 100).toFixed(1)}%) bookkeeping=${wingBookkeepMs}(${((wingBookkeepMs / wingTotalAll) * 100).toFixed(1)}%)`,
      );
      const wingLookupMs = sumMs((r) => r.wing.lookupMsTotal);
      const wingComposeMs = sumMs((r) => r.wing.composeMsTotal);
      const wingCheckMs = sumMs((r) => r.wing.checkMsTotal);
      console.log(`S8_WING_SUBSTEP lookup=${wingLookupMs.toFixed(1)} compose=${wingComposeMs.toFixed(1)} check=${wingCheckMs.toFixed(1)}`);

      const wingGen = sumMs((r) => r.wing.funnel.generated);
      const wingEval = sumMs((r) => r.wing.funnel.evaluated);
      const wingComposeExec = sumMs((r) => r.wing.funnel.composeExecuted);
      const wingComposeSkip = sumMs((r) => r.wing.funnel.composeSkipped);
      const wingFixedRej = sumMs((r) => r.wing.funnel.fixedReject);
      const wingImproveRej = sumMs((r) => r.wing.funnel.improvementReject);
      const wingAccepted = sumMs((r) => r.wing.funnel.accepted);
      console.log(`S8_WING_FUNNEL gen=${wingGen} eval=${wingEval} composeExec=${wingComposeExec} composeSkip=${wingComposeSkip} fixedRej=${wingFixedRej} improveRej=${wingImproveRej} accepted=${wingAccepted}`);

      const edgeExactMs = sumMs((r) => r.edge.exactFinish.totalMs);
      const edgeExactAtt = sumMs((r) => r.edge.exactFinish.attempts);
      const edgeExactSucc = sumMs((r) => r.edge.exactFinish.successes);
      const edgeCompoundMs = sumMs((r) => r.edge.compoundFinish.totalMs);
      const edgeCompoundAtt = sumMs((r) => r.edge.compoundFinish.attempts);
      const edgeCompoundSucc = sumMs((r) => r.edge.compoundFinish.successes);
      const centerExactMs = sumMs((r) => r.center.exactFinish.totalMs);
      const centerExactAtt = sumMs((r) => r.center.exactFinish.attempts);
      const centerExactSucc = sumMs((r) => r.center.exactFinish.successes);
      const centerCompoundMs = sumMs((r) => r.center.compoundFinish.totalMs);
      const centerCompoundAtt = sumMs((r) => r.center.compoundFinish.attempts);
      const centerCompoundSucc = sumMs((r) => r.center.compoundFinish.successes);
      const wingExactAtt = sumMs((r) => r.wing.exactFinish.attempts);
      const wingExactSucc = sumMs((r) => r.wing.exactFinish.successes);
      const wingCompoundAtt = sumMs((r) => r.wing.compoundFinish.attempts);
      const wingCompoundSucc = sumMs((r) => r.wing.compoundFinish.successes);
      console.log(
        `S8_FINISH wingExact=${wingExactMs}ms(${wingExactSucc}/${wingExactAtt}) wingCompound=${wingCompoundMs}ms(${wingCompoundSucc}/${wingCompoundAtt}) ` +
          `edgeExact=${edgeExactMs}ms(${edgeExactSucc}/${edgeExactAtt}) edgeCompound=${edgeCompoundMs}ms(${edgeCompoundSucc}/${edgeCompoundAtt}) ` +
          `centerExact=${centerExactMs}ms(${centerExactSucc}/${centerExactAtt}) centerCompound=${centerCompoundMs}ms(${centerCompoundSucc}/${centerCompoundAtt})`,
      );

      console.log("S8_ROWS_JSON=" + JSON.stringify(rows.map((r) => ({ seed: r.seed, run: r.run, totalMs: r.totalMs, cornerMs: r.cornerMs, wingMs: r.wingMs, innerMs: r.innerMs, edgeMs: r.edgeMs, centerMs: r.centerMs }))));
    },
    7_000_000,
  );
});
