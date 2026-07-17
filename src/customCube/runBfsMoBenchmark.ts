// A/B benchmark: tryFixWing (existing, unmodified) vs tryFixWingMO
// (Multi-Objective BFS v1) across the SAME 100 scrambles, per spec's own
// success/failure criteria. Drives both through an identical "fix loop"
// (flip first, then per-wrong-wing fix in shuffled order, same shuffle
// order for both since a fresh RNG seed is drawn once per scramble and
// reused for both variants) -- the ONLY variable between the two runs is
// tryFixWing vs tryFixWingMO itself.
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, type Axis, type Cubie } from "./cubeState";
import {
  applySeq,
  buildFlipLibrary,
  buildWingLibrary,
  tryFixWing,
  tryFixWingMO,
  tryFlipWingsInPlace,
  wrongWingCount5,
  wrongWings5,
  type Move,
  type WingLibrary,
} from "./fiveByFiveEdges";
import { analyzeEdgeSlots } from "./fiveByFiveHumanEdges";

const AXES: Axis[] = ["x", "y", "z"];

function scramble5(cubies: Cubie[], moves = 60): void {
  for (let i = 0; i < moves; i++) {
    const axis = AXES[Math.floor(Math.random() * 3)];
    const layer = Math.floor(Math.random() * 5);
    const sign = Math.random() < 0.5 ? 1 : -1;
    applyRawQuarterTurn(cubies, axis, layer, sign as 1 | -1);
  }
}

function pairCount(cubies: Cubie[]): number {
  return analyzeEdgeSlots(cubies).filter((s) => s.pairedCount === 2).length;
}

function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deterministic per-scramble RNG so both variants see the exact same
// wrong-wing shuffle order at every iteration -- otherwise a lucky/unlucky
// shuffle order alone could account for a difference that has nothing to
// do with tryFixWing vs tryFixWingMO.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DriveResult {
  finalWrongWing: number;
  finalPairCount: number;
  totalMoves: number;
  solved: boolean;
  timeMs: number;
  pairDestructionEvents: number; // spec success criterion (4): destroyed-pair count over the whole run, not just the final snapshot
}

function driveFixLoop(
  cubies: Cubie[],
  lib: WingLibrary,
  flipLib: Map<string, Move[]>,
  deadline: number,
  fixFn: (cubies: Cubie[], w: Cubie, lib: WingLibrary, deadline: number) => Move[] | null,
  rand: () => number
): DriveResult {
  const t0 = Date.now();
  let totalMoves = 0;
  let pairDestructionEvents = 0;

  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline) {
    let progressed = false;
    const wrong = shuffle(wrongWings5(cubies), rand);
    for (const w of wrong) {
      if (Date.now() > deadline) break;
      const pairBefore = pairCount(cubies);
      const flipFix = tryFlipWingsInPlace(cubies, w, flipLib, wrongWingCount5(cubies));
      if (flipFix && flipFix.length > 0) {
        applySeq(cubies, flipFix);
        totalMoves += flipFix.length;
        if (pairCount(cubies) < pairBefore) pairDestructionEvents += pairBefore - pairCount(cubies);
        progressed = true;
        break;
      }
      const fix = fixFn(cubies, w, lib, deadline);
      if (fix && fix.length > 0) {
        applySeq(cubies, fix);
        totalMoves += fix.length;
        if (pairCount(cubies) < pairBefore) pairDestructionEvents += pairBefore - pairCount(cubies);
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
  }

  return {
    finalWrongWing: wrongWingCount5(cubies),
    finalPairCount: pairCount(cubies),
    totalMoves,
    solved: wrongWingCount5(cubies) === 0,
    timeMs: Date.now() - t0,
    pairDestructionEvents,
  };
}

const N = Number(process.argv[2] ?? 100);
const PER_SCRAMBLE_DEADLINE_MS = Number(process.argv[3] ?? 2000);

const lib = buildWingLibrary();
const flipLib = buildFlipLibrary();

const oldResults: DriveResult[] = [];
const newResults: DriveResult[] = [];

for (let i = 0; i < N; i++) {
  const seed = 1000 + i;
  const scrambleRand = mulberry32(seed);
  const base = buildSolvedCube(5);
  for (let m = 0; m < 60; m++) {
    const axis = AXES[Math.floor(scrambleRand() * 3)];
    const layer = Math.floor(scrambleRand() * 5);
    const sign = scrambleRand() < 0.5 ? 1 : -1;
    applyRawQuarterTurn(base, axis, layer, sign as 1 | -1);
  }

  const cubiesOld = cloneCubies(base);
  const oldRand = mulberry32(seed + 1);
  const oldResult = driveFixLoop(cubiesOld, lib, flipLib, Date.now() + PER_SCRAMBLE_DEADLINE_MS, tryFixWing, oldRand);
  oldResults.push(oldResult);

  const cubiesNew = cloneCubies(base);
  const newRand = mulberry32(seed + 1); // same seed as oldRand -- identical shuffle sequence
  const newResult = driveFixLoop(cubiesNew, lib, flipLib, Date.now() + PER_SCRAMBLE_DEADLINE_MS, tryFixWingMO, newRand);
  newResults.push(newResult);

  console.log(
    `#${i + 1}: OLD wrongWing=${oldResult.finalWrongWing} pair=${oldResult.finalPairCount} moves=${oldResult.totalMoves} solved=${oldResult.solved} time=${oldResult.timeMs}ms` +
      ` | NEW wrongWing=${newResult.finalWrongWing} pair=${newResult.finalPairCount} moves=${newResult.totalMoves} solved=${newResult.solved} time=${newResult.timeMs}ms`
  );
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const oldAvgWrong = avg(oldResults.map((r) => r.finalWrongWing));
const newAvgWrong = avg(newResults.map((r) => r.finalWrongWing));
const oldAvgPair = avg(oldResults.map((r) => r.finalPairCount));
const newAvgPair = avg(newResults.map((r) => r.finalPairCount));
const oldAvgMoves = avg(oldResults.map((r) => r.totalMoves));
const newAvgMoves = avg(newResults.map((r) => r.totalMoves));
const oldAvgTime = avg(oldResults.map((r) => r.timeMs));
const newAvgTime = avg(newResults.map((r) => r.timeMs));
const oldSuccessRate = (oldResults.filter((r) => r.solved).length / N) * 100;
const newSuccessRate = (newResults.filter((r) => r.solved).length / N) * 100;
const oldAvgDestroyed = avg(oldResults.map((r) => r.pairDestructionEvents));
const newAvgDestroyed = avg(newResults.map((r) => r.pairDestructionEvents));

console.log("\n=== Benchmark Summary (N=" + N + ") ===");
console.log(`Avg WrongWing:    OLD=${oldAvgWrong.toFixed(2)}  NEW=${newAvgWrong.toFixed(2)}  (${(((oldAvgWrong - newAvgWrong) / oldAvgWrong) * 100).toFixed(1)}% reduction)`);
console.log(`Avg Pair:         OLD=${oldAvgPair.toFixed(2)}  NEW=${newAvgPair.toFixed(2)}`);
console.log(`Avg Moves:        OLD=${oldAvgMoves.toFixed(1)}  NEW=${newAvgMoves.toFixed(1)}`);
console.log(`Avg Time (ms):    OLD=${oldAvgTime.toFixed(0)}  NEW=${newAvgTime.toFixed(0)}  (${(((newAvgTime - oldAvgTime) / oldAvgTime) * 100).toFixed(1)}% change)`);
console.log(`Success Rate:     OLD=${oldSuccessRate.toFixed(1)}%  NEW=${newSuccessRate.toFixed(1)}%`);
console.log(`Avg Pair Destroy: OLD=${oldAvgDestroyed.toFixed(2)}  NEW=${newAvgDestroyed.toFixed(2)}`);

console.log("\n=== Success Criteria Check ===");
const wrongWingReductionPct = ((oldAvgWrong - newAvgWrong) / oldAvgWrong) * 100;
const timeIncreasePct = ((newAvgTime - oldAvgTime) / oldAvgTime) * 100;
console.log(`① 평균 WrongWing 10% 이상 감소: ${wrongWingReductionPct >= 10 ? "PASS" : "FAIL"} (${wrongWingReductionPct.toFixed(1)}%)`);
console.log(`② 완전 해결률 증가: ${newSuccessRate > oldSuccessRate ? "PASS" : "FAIL"} (${oldSuccessRate.toFixed(1)}% -> ${newSuccessRate.toFixed(1)}%)`);
console.log(`③ 평균 탐색 시간 20% 이내 증가: ${timeIncreasePct <= 20 ? "PASS" : "FAIL"} (${timeIncreasePct.toFixed(1)}%)`);
console.log(`④ 기존 Pair 파괴 횟수 감소: ${newAvgDestroyed < oldAvgDestroyed ? "PASS" : "FAIL"} (${oldAvgDestroyed.toFixed(2)} -> ${newAvgDestroyed.toFixed(2)})`);
