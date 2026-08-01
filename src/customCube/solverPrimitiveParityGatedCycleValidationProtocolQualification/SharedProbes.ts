// --- SharedProbes (PARITY_GATED_CYCLE Validation Protocol Qualification
// Sprint v1, STEP1/2/3 shared) -------------------------------------------
// Real, unmodified-production probes, following the exact same MCM
// Validation Protocol this Sprint is qualifying PARITY_GATED_CYCLE against
// (Multi-Component Merge Validation Protocol Standardization Sprint v1's
// own STEP2 Validation Flow: Capability Validation reuses
// generateRecoveryStrategies() + onEvent; Product Validation reuses real
// solve()). `solveE2EProbe`/`PLAN_TIME_BUDGET_MS` are DIRECTLY REUSED
// (imported, not duplicated) from
// solverPrimitiveMultiComponentMergeValidationMethodology/SharedProbes.ts
// since that function is already generic (parses the real trace's own
// chosenType, not hardcoded to any one RecoveryType) -- its own
// classifyRecoveryDescription() already maps "Cross-Component Bridge
// Cycle Resolver" to PARITY_GATED_CYCLE. Only the attemptRecovery-level
// probe needs a new function, since the prior Sprint's own
// attemptRecoveryTimelineProbe() hardcodes its onEvent filter to
// MULTI_COMPONENT_MERGE only.
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";

export { solveE2EProbe, PLAN_TIME_BUDGET_MS, type SolveE2EProbeResult } from "../solverPrimitiveMultiComponentMergeValidationMethodology/SharedProbes";

// Real production Gate (fiveByFiveEdgeRecovery.ts's own genParityGatedCycle:
// `if (stats.componentCount <= 1) return;`) -- read-only reuse of the same
// analyzeConstraints/buildStateGraph functions genParityGatedCycle() itself
// calls, to identify real Hole Dataset cases where PARITY_GATED_CYCLE is
// even eligible to be offered.
export function componentCountFor(hole: HoleCase): number {
  return analyzeConstraints(buildStateGraph(hole.cubies)).componentCount;
}

export interface AttemptRecoveryProbeResult {
  outerDeadlineMs: number;
  componentCount: number;
  gatePassed: boolean; // componentCount > 1, the real production Gate
  parityOffered: boolean;
  parityChosen: boolean;
  parityRemainingTimeAtStartMs: number | null;
  parityOwnRuntimeMs: number | null;
  chosenType: RecoveryType | "none";
  improved: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
}

export function parityRecoveryTimelineProbe(hole: HoleCase, libs: ExecutorLibraries, outerDeadlineMs: number): AttemptRecoveryProbeResult {
  const componentCount = componentCountFor(hole);
  const wrongWingBefore = wrongWingCount5(hole.cubies);
  const startMsByType: Partial<Record<RecoveryType, number>> = {};
  const finishMsByType: Partial<Record<RecoveryType, number>> = {};
  const onEvent = (e: SchedulingEvent) => {
    if (e.candidateType !== "PARITY_GATED_CYCLE") return;
    if (e.phase === "start") startMsByType.PARITY_GATED_CYCLE = e.atMs;
    else finishMsByType.PARITY_GATED_CYCLE = e.atMs;
  };

  const t0 = Date.now();
  const deadline = t0 + outerDeadlineMs;
  const clone = cloneCubies(hole.cubies);
  const candidates = generateRecoveryStrategies(clone, libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true, true, true, "AFTER_CCR");
  const best = chooseBestRecovery(candidates);
  const parityOffered = candidates.some((c) => c.type === "PARITY_GATED_CYCLE");
  const parityChosen = best?.type === "PARITY_GATED_CYCLE";

  const startAbs = startMsByType.PARITY_GATED_CYCLE;
  const finishAbs = finishMsByType.PARITY_GATED_CYCLE;
  const parityRemainingTimeAtStartMs = startAbs !== undefined ? outerDeadlineMs - (startAbs - t0) : null;
  const parityOwnRuntimeMs = startAbs !== undefined && finishAbs !== undefined ? finishAbs - startAbs : null;

  let wrongWingAfter = wrongWingBefore;
  if (best) {
    const after = cloneCubies(hole.cubies);
    applySeq(after, best.moves);
    wrongWingAfter = wrongWingCount5(after);
  }

  return {
    outerDeadlineMs,
    componentCount,
    gatePassed: componentCount > 1,
    parityOffered,
    parityChosen,
    parityRemainingTimeAtStartMs,
    parityOwnRuntimeMs,
    chosenType: best?.type ?? "none",
    improved: wrongWingAfter < wrongWingBefore,
    wrongWingBefore,
    wrongWingAfter,
  };
}
