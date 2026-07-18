// --- HardGapReclassifier (Solver v3 Research Kickoff Sprint v1) ----------
// STEP1: diagnoses whether the current Hard Gap definition over-classifies
// states due to its 1-hop/single-primitive measurement window.
//
// `GapDetector.ts`'s own Hard Gap definition (existing, unmodified) tests
// exactly 6 base capabilities (BASE/FLIP/CASE/PARITY/RECOVERY/CYCLECHASE) --
// it does NOT include BP-1/BP-2/BP-3 (the bounded multi-hop/structural
// Prototypes built in the prior four Sprints), even though those already
// exist, are already validated (0% regression each), and are specifically
// designed to relax the single-hop immediate-improvement gate that
// CycleChase and the other 5 base capabilities share.
//
// This module re-tests the SAME 75 real states with BP-1/BP-2/BP-3 ALSO
// included as capabilities (reusing their real, unmodified resolvers --
// no new search, no new algorithm), and measures how many currently-"Hard
// Gap" replays get rescued purely by widening the measurement window to
// include already-existing multi-hop combinators. This is the concrete,
// data-grounded operationalization of "was Hard Gap over-classified
// because of how it's measured, not because it's truly unsolvable."
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";

const RESCUE_DEADLINE_MS = 500;

export interface ReclassifiedReplay {
  hash: string;
  wasHardGap: boolean;
  rescuedByBP1: boolean;
  rescuedByBP2: boolean;
  rescuedByBP3: boolean;
  rescued: boolean; // any of the three
  stillHardGap: boolean; // wasHardGap && !rescued
}

function testResolver(
  resolver: (cubies: ReturnType<typeof deserializeCube>, lib: WingLibrary, deadline: number) => ReturnType<typeof tryBoundedMultiCycleResolver>,
  snapshot: FailureSnapshot,
  lib: WingLibrary,
): boolean {
  const cubies = deserializeCube(snapshot.cubeState);
  const before = wrongWingCount5(cubies);
  const clone = cloneCubies(cubies);
  const fix = resolver(clone, lib, Date.now() + RESCUE_DEADLINE_MS);
  if (!fix || fix.length === 0) return false;
  applySeq(clone, fix); // resolvers return a move sequence, they don't mutate their input in place
  return wrongWingCount5(clone) < before;
}

export interface HardGapReclassification {
  totalReplays: number;
  originalHardGapCount: number;
  originalHardGapRate: number;
  rescuedCount: number;
  rescuedByBP1Count: number;
  rescuedByBP2Count: number;
  rescuedByBP3Count: number;
  newHardGapCount: number;
  newHardGapRate: number;
  overClassificationRate: number; // rescuedCount / originalHardGapCount
  perReplay: ReclassifiedReplay[];
}

function reclassifyHardGapOnce(failuresDbPath: string, gapDeadlineMs: number): HardGapReclassification {
  const profiles: ReplayGapProfile[] = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const all75 = loadAll75(failuresDbPath);
  const byHash = new Map(all75.map((s) => [s.hash, s]));
  const lib = buildWingLibrary();

  const perReplay: ReclassifiedReplay[] = [];
  for (const profile of profiles) {
    if (!profile.isHardGap) {
      perReplay.push({ hash: profile.replayHash, wasHardGap: false, rescuedByBP1: false, rescuedByBP2: false, rescuedByBP3: false, rescued: false, stillHardGap: false });
      continue;
    }
    const snapshot = byHash.get(profile.replayHash);
    if (!snapshot) continue;

    const rescuedByBP1 = testResolver(tryBoundedMultiCycleResolver, snapshot, lib);
    const rescuedByBP2 = testResolver(tryParityAwareCycleBreaker, snapshot, lib);
    const rescuedByBP3 = testResolver(tryNonParityStructuralFix, snapshot, lib);
    const rescued = rescuedByBP1 || rescuedByBP2 || rescuedByBP3;

    perReplay.push({
      hash: profile.replayHash,
      wasHardGap: true,
      rescuedByBP1,
      rescuedByBP2,
      rescuedByBP3,
      rescued,
      stillHardGap: !rescued,
    });
  }

  const originalHardGap = perReplay.filter((r) => r.wasHardGap);
  const rescued = originalHardGap.filter((r) => r.rescued);
  const stillHardGap = originalHardGap.filter((r) => r.stillHardGap);

  return {
    totalReplays: profiles.length,
    originalHardGapCount: originalHardGap.length,
    originalHardGapRate: profiles.length ? originalHardGap.length / profiles.length : 0,
    rescuedCount: rescued.length,
    rescuedByBP1Count: originalHardGap.filter((r) => r.rescuedByBP1).length,
    rescuedByBP2Count: originalHardGap.filter((r) => r.rescuedByBP2).length,
    rescuedByBP3Count: originalHardGap.filter((r) => r.rescuedByBP3).length,
    newHardGapCount: stillHardGap.length,
    newHardGapRate: profiles.length ? stillHardGap.length / profiles.length : 0,
    overClassificationRate: originalHardGap.length ? rescued.length / originalHardGap.length : 0,
    perReplay,
  };
}

// The whole project has repeatedly, empirically confirmed run-to-run
// variance from Math.random()-based internal tie-breaking (Hard Gap counts
// alone have ranged 27~34 across runs in this very Sprint's own STEP0). A
// single run's over-classification rate is not reliable evidence on its
// own, so this averages RECLASSIFY_RUNS independent runs -- same pattern
// as STEP0's Cluster 안정성 measurement.
const RECLASSIFY_RUNS = 3;

export interface HardGapReclassificationAggregate {
  runs: HardGapReclassification[];
  avgOriginalHardGapCount: number;
  avgRescuedCount: number;
  avgNewHardGapCount: number;
  avgOverClassificationRate: number;
  overClassificationRateRange: [number, number];
}

export function reclassifyHardGap(failuresDbPath: string, gapDeadlineMs: number): HardGapReclassificationAggregate {
  const runs: HardGapReclassification[] = [];
  for (let i = 0; i < RECLASSIFY_RUNS; i++) runs.push(reclassifyHardGapOnce(failuresDbPath, gapDeadlineMs));

  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
  const rates = runs.map((r) => r.overClassificationRate);

  return {
    runs,
    avgOriginalHardGapCount: avg(runs.map((r) => r.originalHardGapCount)),
    avgRescuedCount: avg(runs.map((r) => r.rescuedCount)),
    avgNewHardGapCount: avg(runs.map((r) => r.newHardGapCount)),
    avgOverClassificationRate: avg(rates),
    overClassificationRateRange: [Math.min(...rates), Math.max(...rates)],
  };
}
