// --- ExtendedReproducibility (Solver Primitive Evaluation Stabilization
// Sprint v2) -- STEP3: actually runs the Evaluation Framework (not just a
// formula) at a larger N than Sprint v1's N=5, and checks whether the
// paired-diff Confidence Interval genuinely narrows as N grows. Collects
// ONE batch of N_MAX independent runs (collectMultipleRuns, UNMODIFIED,
// reused from RawDataCollector.ts) and reports checkpoint statistics at
// PREFIXES of that same run sequence (N=5/10/N_MAX) rather than
// re-collecting from scratch for each N -- the checkpoints are nested
// subsets of one real dataset, which is both cheaper (one collection
// pass instead of three) and statistically cleaner (the N=5 checkpoint
// here is literally "the first 5 of these N_MAX runs," directly
// comparable to growing the same sample rather than three unrelated
// samples).
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { collectMultipleRuns, type RunRecord } from "./RawDataCollector";
import { compareGapClassificationMethods, type GapClassificationComparison } from "./GapClassificationMethods";
import { computeGapRescueCI, type GapRescueCIResult } from "./GapRescueConfidenceInterval";

export interface ReproducibilityCheckpoint {
  n: number;
  gapClassification: GapClassificationComparison;
  gapRescueCI: GapRescueCIResult;
  pairedDiffCIWidth: number; // ciUpper - ciLower, the narrowing metric STEP3 is actually checking
}

export interface ExtendedReproducibilityResult {
  nMax: number;
  checkpoints: ReproducibilityCheckpoint[];
  ciNarrowedFromFirstToLast: boolean; // pairedDiffCIWidth strictly decreased from the smallest to the largest checkpoint
  allRuns: RunRecord[]; // the full N_MAX raw dataset -- exposed so STEP4 (NoiseSourceDecomposition) can reuse it directly instead of paying for a second collection pass
}

export function runExtendedReproducibility(
  snapshots: readonly FailureSnapshot[],
  lib: WingLibrary,
  libs: ExecutorLibraries,
  deadlineMs: number,
  checkpointNs: readonly number[],
): ExtendedReproducibilityResult {
  const nMax = Math.max(...checkpointNs);
  const allRuns: RunRecord[] = collectMultipleRuns(snapshots, lib, libs, deadlineMs, nMax);

  const checkpoints: ReproducibilityCheckpoint[] = [...checkpointNs]
    .sort((a, b) => a - b)
    .map((n) => {
      const subset = allRuns.slice(0, n);
      const gapClassification = compareGapClassificationMethods(subset);
      const gapRescueCI = computeGapRescueCI(subset);
      const pairedDiffCIWidth = gapRescueCI.pairedDiffStats.ciUpper - gapRescueCI.pairedDiffStats.ciLower;
      return { n, gapClassification, gapRescueCI, pairedDiffCIWidth };
    });

  const first = checkpoints[0];
  const last = checkpoints[checkpoints.length - 1];
  const ciNarrowedFromFirstToLast = last.pairedDiffCIWidth < first.pairedDiffCIWidth;

  return { nMax, checkpoints, ciNarrowedFromFirstToLast, allRuns };
}
