// --- HoleDatasetBuilder (Coverage Hole Discovery Sprint v1, Phase 1 STEP1) -
// Builds the Hole Dataset: the actual final STUCK wing-pairing cube states
// (not just aggregate stats) where the real production pipeline failed to
// converge within the 50-iteration cap. The just-completed Solver
// Completeness Verification Sprint v1 found 717/717 non-convergent but did
// not persist the final cube states themselves (its report is aggregate
// stats only) -- this module re-derives a subset of those stuck states,
// this time keeping the actual Cubie[] for structural analysis.
//
// Reuses runFullPipeline() from solverCompletenessVerification/
// FullPipelineProbe.ts completely unmodified. Since it mutates its `cubies`
// argument in place, keeping our own reference after a non-convergent call
// gives the exact final stuck state -- no change to the existing probe was
// needed.
//
// Each hole state is then tested against ALL 5 existing capability-tested
// primitives (BASE/FLIP/CASE/PARITY/RECOVERY) via the existing, unmodified
// capabilityAnalysis/primitiveCapabilityTester.ts, on a scratch clone.
// RECOVERY there already wraps the real production Recovery layer's
// attemptRecovery() (DISRUPT/SETUP/REPAIR/CCR combined dispatcher), so this
// gives a rigorous per-case verdict distinct from a scheduling failure: if
// NO primitive succeeds even in isolation, this is a true Structural
// Coverage Hole (directive's Goal 3). If at least one DOES succeed in
// isolation but the real solve() loop still got stuck for 50 iterations,
// that is a Reachable-but-Unexploited case -- a scheduling/Zero-Move-Loop
// problem (directive's Goal 2), not a missing-capability problem. This
// distinction did not exist before this Sprint and is the main structural
// finding STEP2-5 build on.
import { cloneCubies, type Cubie } from "../cubeState";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary, wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { ensureWarm, runFullPipeline } from "../solverCompletenessVerification/FullPipelineProbe";
import { testAllCapabilities } from "../capabilityAnalysis/primitiveCapabilityTester";
import type { PrimitiveTestResult } from "../capabilityAnalysis/capabilityTypes";
import {
  buildDepthGradedScrambles,
  buildSnapshot335Cases,
  buildWorstCaseLibrary,
  type DatasetCase,
} from "../solverCompletenessVerification/DatasetBuilder";

export interface HoleCase {
  label: string;
  category: DatasetCase["category"];
  worstCaseTags?: string[];
  originalCubies: Cubie[]; // state BEFORE centers/wing-pairing ran (the raw dataset case input) -- needed to distinguish a pre-existing structural feature from one created as a byproduct of the pipeline itself
  cubies: Cubie[]; // final stuck state
  wrongWingCount: number;
  wingPairingIterations: number;
  wingPairingNoProgressStreak: number; // longest consecutive run of empty moveQueue within the 50-iteration loop that produced this hole
  wingPairingRecoveryTriggeredCount: number; // how many of the 50 real iterations triggered the production Recovery layer at all -- 0 means Recovery was NEVER invoked for this case
  wingPairingBudgetViolations: number; // iterations where recovery triggered AND that call's own deadline was still missed
  wingPairingDeadlineMisses: number; // iterations where the outer 1s per-call deadline was exceeded
  totalWallMs: number;
  capabilityResults: PrimitiveTestResult[];
  anyPrimitiveApplicable: boolean; // true iff >=1 of BASE/FLIP/CASE/PARITY/RECOVERY succeeded on an isolated scratch-clone test
}

export function buildLibs(): ExecutorLibraries {
  ensureWarm();
  return { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
}

/**
 * Phase 1 input scope: Worst Case Library (52, curated for parity/
 * recovery-failed/high-wrongWingCount diversity) in full, plus a stratified
 * subsample of snapshot335 (first 30, deterministic load order) and
 * scrambleDepths (first 10 of each of the 6 depth buckets = 60) for
 * population diversity beyond the worst-case subset. Disclosed scope
 * choice: NOT the full 717 -- at ~58-62s/case (this session's own just-
 * measured average), a Phase-1 discovery pass over a ~142-case
 * representative slice is proportionate; Phase 6 (Completeness
 * Verification) re-runs the full population once real coverage fixes exist.
 */
export function selectHoleDiscoveryInputCases(dbPath: string): DatasetCase[] {
  const worstCase = buildWorstCaseLibrary(dbPath);
  const snapshotSample = buildSnapshot335Cases(dbPath).slice(0, 30);
  const scrambleSample: DatasetCase[] = [];
  const byDepth = new Map<string, DatasetCase[]>();
  for (const c of buildDepthGradedScrambles()) {
    const list = byDepth.get(c.category) ?? [];
    list.push(c);
    byDepth.set(c.category, list);
  }
  for (const [, list] of byDepth) scrambleSample.push(...list.slice(0, 10));
  return [...worstCase, ...snapshotSample, ...scrambleSample];
}

export async function buildHoleCase(datasetCase: DatasetCase, libs: ExecutorLibraries): Promise<HoleCase | null> {
  ensureWarm();
  const cubies = cloneCubies(datasetCase.cubies);
  const result = await runFullPipeline(cubies, datasetCase.label);
  if (result.anyException || result.wingPairingConverged) return null; // not a hole -- crashed or actually solved
  const capabilityResults = testAllCapabilities(cubies, libs);
  return {
    label: datasetCase.label,
    category: datasetCase.category,
    worstCaseTags: datasetCase.worstCaseTags,
    originalCubies: cloneCubies(datasetCase.cubies),
    cubies: cloneCubies(cubies),
    wrongWingCount: wrongWingCount5(cubies),
    wingPairingIterations: result.wingPairingIterations,
    wingPairingNoProgressStreak: result.wingPairingNoProgressStreak,
    wingPairingRecoveryTriggeredCount: result.wingPairingRecoveryTriggeredCount,
    wingPairingBudgetViolations: result.wingPairingBudgetViolations,
    wingPairingDeadlineMisses: result.wingPairingDeadlineMisses,
    totalWallMs: result.totalWallMs,
    capabilityResults,
    anyPrimitiveApplicable: capabilityResults.some((r) => r.succeeded),
  };
}
