// --- HoleCollectionV4 (Solver Primitive Discovery Sprint #4 -- State
// Taxonomy Sprint v1, STEP1) -------------------------------------------------
// Regenerates the Hole Dataset against the CURRENT Release production
// solver. Reuses coverageAtlas/HoleDatasetBuilder.ts's buildLibs(),
// selectHoleDiscoveryInputCases(), buildHoleCase() completely unmodified --
// those functions call runFullPipeline() (solverCompletenessVerification/
// FullPipelineProbe.ts), which itself calls the REAL, unmodified
// FiveByFiveEdgeSolverEngine/Recovery layer -- so simply re-running this
// same, unmodified code against the same input population naturally
// reflects every production change landed since the original 142-case
// raw-dataset-v1-holes.json was built in Coverage Hole Discovery Sprint v1
// (Scheduler SETUP Last-Resort ordering, ENDGAME Reserved Slice, CCR,
// Mixed Commutator, Incremental Recovery -- none of which existed in
// production yet when that original dataset was captured).
//
// Adds ONLY the one thing that dataset didn't carry: FailureModeTags, the
// Directive's own 4 collection targets (solve 실패/partial improve/
// timeout/planner abort). These are NOT mutually exclusive -- a single
// Hole can carry more than one tag (e.g. it can both time out on some
// iterations AND still show partial improvement overall).
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
export { buildLibs, selectHoleDiscoveryInputCases, buildHoleCase } from "../coverageAtlas/HoleDatasetBuilder";
export type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface FailureModeTags {
  noProgress: boolean; // "solve 실패" -- final wrongWingCount >= the ORIGINAL (pre-pipeline) wrongWingCount; the whole pipeline made zero net progress
  partialImprove: boolean; // final wrongWingCount < original wrongWingCount, but did not reach 0
  timeout: boolean; // >=1 of the up-to-50 wing-pairing iterations missed its own 1s per-call deadline (trace "budget-exhausted")
  plannerAbort: boolean; // >=1 iteration's solve() call returned an empty moveQueue (Planner produced nothing that iteration)
}

export function classifyFailureMode(hole: HoleCase): FailureModeTags {
  const originalWrongWingCount = wrongWingCount5(hole.originalCubies);
  const finalWrongWingCount = hole.wrongWingCount;
  return {
    noProgress: finalWrongWingCount >= originalWrongWingCount,
    partialImprove: finalWrongWingCount < originalWrongWingCount,
    timeout: hole.wingPairingDeadlineMisses > 0,
    plannerAbort: hole.wingPairingNoProgressStreak > 0,
  };
}

export interface HoleCaseV4 extends HoleCase {
  failureModes: FailureModeTags;
}

export function enrichWithFailureModes(holes: HoleCase[]): HoleCaseV4[] {
  return holes.map((h) => ({ ...h, failureModes: classifyFailureMode(h) }));
}

export interface FailureModeSummary {
  totalCases: number;
  noProgressCount: number;
  partialImproveCount: number;
  timeoutCount: number;
  plannerAbortCount: number;
}

export function summarizeFailureModes(holes: readonly HoleCaseV4[]): FailureModeSummary {
  return {
    totalCases: holes.length,
    noProgressCount: holes.filter((h) => h.failureModes.noProgress).length,
    partialImproveCount: holes.filter((h) => h.failureModes.partialImprove).length,
    timeoutCount: holes.filter((h) => h.failureModes.timeout).length,
    plannerAbortCount: holes.filter((h) => h.failureModes.plannerAbort).length,
  };
}
