// --- CoverageBreakdown (Coverage Expansion Sprint v1) -----------------------
// Spec STEP 2: tallies InactivityClassifier's per-Replay causes across the
// whole 75-Replay database.
import type { WingLibrary } from "../fiveByFiveEdges";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { classifyReplay, type InactivityCause, type InactivityClassification } from "./InactivityClassifier";

export interface CoverageBreakdownResult {
  totalReplays: number;
  activatedCount: number;
  classifications: InactivityClassification[];
  causeTally: Record<InactivityCause, number>;
}

const ALL_CAUSES: InactivityCause[] = ["NO_WANTS_CYCLE", "ONLY_3_CYCLE", "FIRST_HOP_FAIL", "BROKEN_BY_PARITY", "INSUFFICIENT_PAIR", "UNKNOWN"];

export function computeCoverageBreakdown(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): CoverageBreakdownResult {
  const classifications = snapshots.map((s) => classifyReplay(s, lib, deadlineMs));
  const activatedCount = classifications.filter((c) => c.activated).length;

  const causeTally = Object.fromEntries(ALL_CAUSES.map((c) => [c, 0])) as Record<InactivityCause, number>;
  for (const c of classifications) {
    if (c.cause) causeTally[c.cause]++;
  }

  return { totalReplays: snapshots.length, activatedCount, classifications, causeTally };
}
