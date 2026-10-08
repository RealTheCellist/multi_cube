import { describe, it, expect, afterAll } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import {
  applyGigaminxMove,
  applyGigaminxScramble,
  randomGigaminxScramble,
  solvedGigaminxState,
  type GigaminxState,
  type GigaminxTurn,
} from "./gigaminxState";
import {
  areCornersSolved,
  areWingsSolved,
  areInnerCornersSolved,
  areEdgeBridgesSolved,
  areCenterBridgesSolved,
  solveCorners,
  solveWings,
  solveInnerCorners,
  solveEdgeBridges,
  solveCenterBridges,
} from "./gigaminxSolver";

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

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1];
const benchLogFile = process.env.GIGA_BENCH_LOG_FILE;
if (benchLogFile) writeFileSync(benchLogFile, "");

describe("gigaminx solve-speed benchmark (per-phase timing, libraries pre-cached)", () => {
  it.each(seeds)("seed %i: per-phase timing breakdown", (seed) => {
    (globalThis as any).__gigaS28Seed = seed;
    const rng = mulberry32(seed * 13 + 7);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

    const timings: Record<string, number> = {};
    const moves: Record<string, number> = {};
    let current = scrambled;
    let allMoves: GigaminxTurn[] = [];

    const t0 = Date.now();
    const corners = solveCorners(current);
    timings.corners = Date.now() - t0;
    expect(corners.trace.succeeded, `corners failed: ${corners.trace.error}`).toBe(true);
    moves.corners = corners.trace.movesEmitted;
    current = applySeq(current, corners.moves);
    allMoves = allMoves.concat(corners.moves);

    const t1 = Date.now();
    const wings = solveWings(current);
    timings.wings = Date.now() - t1;
    expect(wings.trace.succeeded, `wings failed: ${wings.trace.error}`).toBe(true);
    moves.wings = wings.trace.movesEmitted;
    current = applySeq(current, wings.moves);
    allMoves = allMoves.concat(wings.moves);

    const t2 = Date.now();
    const innerCorners = solveInnerCorners(current);
    timings.innerCorners = Date.now() - t2;
    expect(innerCorners.trace.succeeded, `innerCorners failed: ${innerCorners.trace.error}`).toBe(true);
    moves.innerCorners = innerCorners.trace.movesEmitted;
    current = applySeq(current, innerCorners.moves);
    allMoves = allMoves.concat(innerCorners.moves);

    const t3 = Date.now();
    const edgeBridges = solveEdgeBridges(current);
    timings.edgeBridges = Date.now() - t3;
    expect(edgeBridges.trace.succeeded, `edgeBridges failed: ${edgeBridges.trace.error}`).toBe(true);
    moves.edgeBridges = edgeBridges.trace.movesEmitted;
    current = applySeq(current, edgeBridges.moves);
    allMoves = allMoves.concat(edgeBridges.moves);

    const t4 = Date.now();
    const centerBridges = solveCenterBridges(current);
    timings.centerBridges = Date.now() - t4;
    expect(centerBridges.trace.succeeded, `centerBridges failed: ${centerBridges.trace.error}`).toBe(true);
    moves.centerBridges = centerBridges.trace.movesEmitted;
    current = applySeq(current, centerBridges.moves);
    allMoves = allMoves.concat(centerBridges.moves);

    const totalMs = Date.now() - t0;

    const replayed = applySeq(scrambled, allMoves);
    expect(areCornersSolved(replayed)).toBe(true);
    expect(areWingsSolved(replayed)).toBe(true);
    expect(areInnerCornersSolved(replayed)).toBe(true);
    expect(areEdgeBridgesSolved(replayed)).toBe(true);
    expect(areCenterBridgesSolved(replayed)).toBe(true);

    const line =
      `BENCH seed=${seed} totalMs=${totalMs} totalMoves=${allMoves.length} ` +
      `cornersMs=${timings.corners} cornersMoves=${moves.corners} ` +
      `wingsMs=${timings.wings} wingsMoves=${moves.wings} ` +
      `innerCornersMs=${timings.innerCorners} innerCornersMoves=${moves.innerCorners} ` +
      `edgeBridgesMs=${timings.edgeBridges} edgeBridgesMoves=${moves.edgeBridges} ` +
      `centerBridgesMs=${timings.centerBridges} centerBridgesMoves=${moves.centerBridges}`;
    console.log(line);
    if (benchLogFile) appendFileSync(benchLogFile, line + "\n");
  }, 7_000_000);

  afterAll(() => {
    const cacheLogFile = process.env.GIGA_S22_CACHE_LOG;
    if (cacheLogFile) writeFileSync(cacheLogFile, JSON.stringify((globalThis as any).__s22CacheStats ?? {}));
  });
});
