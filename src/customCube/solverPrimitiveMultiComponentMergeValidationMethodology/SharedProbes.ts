// --- SharedProbes (Multi-Component Merge Validation Methodology
// Qualification Sprint v1, STEP2/3 shared) -------------------------------------
// Two real, unmodified-production probes this Sprint's own Budget Envelope
// Analysis (STEP2) and Sensitivity Analysis (STEP3) both call across
// different parameter values:
//   - attemptRecoveryTimelineProbe: generateRecoveryStrategies() direct call
//     with the onEvent instrumentation hook (disclosed reuse of Refinement
//     Sprint v3's own CompetitionTimeline.ts pattern) -- gives MCM's own
//     precise remainingTimeAtStart/ownRuntime.
//   - solveE2EProbe: the REAL FiveByFiveEdgeSolverEngine.solve() entry
//     point (disclosed reuse of solverPrimitiveMultiComponentMergeProductionValidation
//     /EndToEndSolveProbe.ts's own trace-parsing methodology), varying ONLY
//     the existing recoveryReserveMsOverride parameter -- no production
//     file touched.
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries, PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export { PLAN_TIME_BUDGET_MS };

let warmed = false;
function ensureWarm(): void {
  if (!warmed) {
    warmupFiveByFiveEdgeLibraries();
    warmed = true;
  }
}

// --- attemptRecovery-level (generateRecoveryStrategies direct + onEvent) ---

export interface AttemptRecoveryProbeResult {
  outerDeadlineMs: number;
  mcmOffered: boolean;
  mcmChosen: boolean;
  mcmRemainingTimeAtStartMs: number | null;
  mcmOwnRuntimeMs: number | null;
  chosenType: RecoveryType | "none";
  improved: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
}

export function attemptRecoveryTimelineProbe(hole: HoleCase, libs: ExecutorLibraries, outerDeadlineMs: number): AttemptRecoveryProbeResult {
  const wrongWingBefore = wrongWingCount5(hole.cubies);
  const startMsByType: Partial<Record<RecoveryType, number>> = {};
  const finishMsByType: Partial<Record<RecoveryType, number>> = {};
  const onEvent = (e: SchedulingEvent) => {
    if (e.candidateType !== "MULTI_COMPONENT_MERGE") return;
    if (e.phase === "start") startMsByType.MULTI_COMPONENT_MERGE = e.atMs;
    else finishMsByType.MULTI_COMPONENT_MERGE = e.atMs;
  };

  const t0 = Date.now();
  const deadline = t0 + outerDeadlineMs;
  const clone = cloneCubies(hole.cubies);
  const candidates = generateRecoveryStrategies(clone, libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true, true, true, "AFTER_CCR");
  const best = chooseBestRecovery(candidates);
  const mcmOffered = candidates.some((c) => c.type === "MULTI_COMPONENT_MERGE");
  const mcmChosen = best?.type === "MULTI_COMPONENT_MERGE";

  const startAbs = startMsByType.MULTI_COMPONENT_MERGE;
  const finishAbs = finishMsByType.MULTI_COMPONENT_MERGE;
  const mcmRemainingTimeAtStartMs = startAbs !== undefined ? outerDeadlineMs - (startAbs - t0) : null;
  const mcmOwnRuntimeMs = startAbs !== undefined && finishAbs !== undefined ? finishAbs - startAbs : null;

  let wrongWingAfter = wrongWingBefore;
  if (best) {
    const after = cloneCubies(hole.cubies);
    applySeq(after, best.moves);
    wrongWingAfter = wrongWingCount5(after);
  }

  return {
    outerDeadlineMs,
    mcmOffered,
    mcmChosen,
    mcmRemainingTimeAtStartMs,
    mcmOwnRuntimeMs,
    chosenType: best?.type ?? "none",
    improved: wrongWingAfter < wrongWingBefore,
    wrongWingBefore,
    wrongWingAfter,
  };
}

// --- solve()-level (real E2E, recoveryReserveMsOverride swept) ---

function classifyRecoveryDescription(description: string): RecoveryType | null {
  if (description.startsWith("가벼운 Disruption") || description.startsWith("확장 Disruption")) return "DISRUPT";
  if (description.startsWith("Multi-ply Setup")) return "SETUP";
  if (description.startsWith("구조적 Cycle 해결")) return "REPAIR";
  if (description.startsWith("Clean-Cycle Resolution")) return "CCR";
  if (description.startsWith("Mixed Pattern Bracket Commutator")) return "MIXED_COMMUTATOR";
  if (description.startsWith("Cross-Component Bridge Cycle Resolver")) return "PARITY_GATED_CYCLE";
  if (description.startsWith("Sequential Multi-Component Merge")) return "MULTI_COMPONENT_MERGE";
  return null;
}

function parseChosenType(trace: readonly TraceEntry[]): RecoveryType | "none" {
  const appliedEvent = trace.find((t) => t.label === "recovery-repair-short-circuit" || t.label === "recovery-applied");
  const detail = appliedEvent?.detail ?? "";
  const m = /^"([^"]+)"/.exec(detail);
  const type = m ? classifyRecoveryDescription(m[1]) : null;
  return type ?? "none";
}

export interface SolveE2EProbeResult {
  recoveryReserveMsOverride: number;
  recoveryTriggered: boolean;
  remainingTimeAtRecoveryTriggerMs: number | null; // approximate: PLAN_TIME_BUDGET_MS - (recovery-triggered's own `at` - solve start)
  deadlineMissed: boolean;
  chosenType: RecoveryType | "none";
  improved: boolean;
  solved: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
}

export function solveE2EProbe(hole: HoleCase, recoveryReserveMsOverride: number): SolveE2EProbeResult {
  ensureWarm();
  const clone = cloneCubies(hole.cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const start = Date.now();
  const engine = new FiveByFiveEdgeSolverEngine();
  const plan = engine.solve(clone, undefined, undefined, recoveryReserveMsOverride);
  const after = cloneCubies(clone);
  applySeq(after, plan.moveQueue);
  const wrongWingAfter = wrongWingCount5(after);
  const trace = engine.getTrace();

  const recoveryTriggeredEvent = trace.find((t) => t.label === "recovery-triggered");
  const remainingTimeAtRecoveryTriggerMs = recoveryTriggeredEvent ? PLAN_TIME_BUDGET_MS - (recoveryTriggeredEvent.at - start) : null;

  return {
    recoveryReserveMsOverride,
    recoveryTriggered: recoveryTriggeredEvent !== undefined,
    remainingTimeAtRecoveryTriggerMs,
    deadlineMissed: trace.some((t) => t.label === "budget-exhausted"),
    chosenType: parseChosenType(trace),
    improved: wrongWingAfter < wrongWingBefore,
    solved: wrongWingAfter === 0,
    wrongWingBefore,
    wrongWingAfter,
  };
}
