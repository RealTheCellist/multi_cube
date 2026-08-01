// --- CapabilityValidation (Multi-Component Merge Production Integration
// Sprint v1, STEP3) -----------------------------------------------------------
// Calls the REAL, now-MULTI_COMPONENT_MERGE-wired attemptRecovery()
// DIRECTLY -- bypassing fiveByFiveEdgeExecutor.ts (frozen this Sprint,
// never given a passthrough for includeMultiComponentMerge) -- for a
// controlled Baseline (includeMultiComponentMerge=false, i.e. today's
// pre-this-Sprint production behavior with CCR/REPAIR/PARITY_GATED_CYCLE/
// MIXED_COMMUTATOR all still active) vs Integrated (true, the real new
// production default) comparison. Identical methodology to
// parityGatedCycleProductionIntegrationV1/Replay.ts (disclosed reuse of
// its own endgameRetryTask reimplementation of fiveByFiveEdgeExecutor.ts's
// own UNEXPORTED runPrimaryPipeline ENDGAME branch, and its own
// chosenType/candidatesOffered trace-parsing convention, extended with
// MULTI_COMPONENT_MERGE's own description string).
//
// Population: the SAME 142-case Hole Dataset every Recovery-level
// Production Integration Sprint in this arc has used (loadRawHoleDataset(),
// unmodified, no new dataset).
import { cloneCubies, type Cubie } from "../cubeState";
import {
  applySeq,
  bestFixOverall,
  ENDGAME_MULTIPLY_THRESHOLD,
  tryEndgameMultiPly,
  tryEndgameThroughDisruption,
  wrongWingCount5,
  type Move,
} from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const CALL_DEADLINE_MS = 1000; // matches PLAN_TIME_BUDGET_MS (fiveByFiveEdgeSolverEngine.ts) -- the real whole-plan budget

function endgameRetryTask(cubies: Cubie[], libs: ExecutorLibraries, deadline: number): Move[] {
  const { lib, flipLib, caseLib } = libs;
  const applied: Move[] = [];
  let guard = 0;
  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline && guard < 50) {
    guard++;
    const fix = bestFixOverall(cubies, lib, flipLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      applied.push(...fix);
      continue;
    }
    if (wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD) {
      const endgameFix = tryEndgameMultiPly(cubies, lib, flipLib, deadline);
      if (endgameFix && endgameFix.length > 0) {
        applySeq(cubies, endgameFix);
        applied.push(...endgameFix);
        continue;
      }
    }
    break;
  }
  if (wrongWingCount5(cubies) > 0 && wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD && Date.now() < deadline) {
    const disruptionFix = tryEndgameThroughDisruption(cubies, lib, flipLib, deadline, undefined, undefined, caseLib);
    if (disruptionFix && disruptionFix.length > 0) {
      applySeq(cubies, disruptionFix);
      applied.push(...disruptionFix);
    }
  }
  return applied;
}

function chosenTypeFromTrace(trace: TraceEntry[]): RecoveryType | "none" {
  for (const t of trace) {
    if (t.label === "recovery-repair-short-circuit" || t.label === "recovery-applied") {
      const detail = t.detail ?? "";
      if (detail.includes("Sequential Multi-Component Merge")) return "MULTI_COMPONENT_MERGE";
      if (detail.includes("Cross-Component Bridge Cycle Resolver")) return "PARITY_GATED_CYCLE";
      if (detail.includes("Mixed Pattern Bracket Commutator")) return "MIXED_COMMUTATOR";
      if (detail.includes("Clean-Cycle Resolution")) return "CCR";
      if (detail.includes("구조적 Cycle 해결")) return "REPAIR";
      if (detail.includes("확장 Disruption") || detail.includes("가벼운 Disruption")) return "DISRUPT";
      if (detail.includes("Multi-ply Setup")) return "SETUP";
    }
  }
  return "none";
}

function candidatesOfferedFromTrace(trace: TraceEntry[]): RecoveryType[] {
  const entry = trace.find((t) => t.label === "recovery-candidates");
  if (!entry?.detail) return [];
  const offered: RecoveryType[] = [];
  for (const part of entry.detail.split(" / ")) {
    if (part.includes("Sequential Multi-Component Merge")) offered.push("MULTI_COMPONENT_MERGE");
    else if (part.includes("Cross-Component Bridge Cycle Resolver")) offered.push("PARITY_GATED_CYCLE");
    else if (part.includes("Mixed Pattern Bracket Commutator")) offered.push("MIXED_COMMUTATOR");
    else if (part.includes("Clean-Cycle Resolution")) offered.push("CCR");
    else if (part.includes("구조적 Cycle 해결")) offered.push("REPAIR");
    else if (part.includes("확장 Disruption") || part.includes("가벼운 Disruption")) offered.push("DISRUPT");
    else if (part.includes("Multi-ply Setup")) offered.push("SETUP");
  }
  return offered;
}

export interface ReplayOutcome {
  label: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  chosenType: RecoveryType | "none";
  candidatesOffered: RecoveryType[];
  candidatesDetail: string | null;
  improved: boolean;
  trueRegression: boolean;
  wallMs: number;
  deadlineMissed: boolean;
}

function runOneArm(cubies: Cubie[], label: string, libs: ExecutorLibraries, includeMultiComponentMerge: boolean): ReplayOutcome {
  const clone = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const deadline = start + CALL_DEADLINE_MS;
  const moves = attemptRecovery(
    clone,
    libs,
    deadline,
    DEFAULT_EVALUATOR_WEIGHTS,
    (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline),
    trace,
    true, // includeRepair
    true, // shortCircuitRepair
    "reservedBudget",
    true, // includeCCR
    true, // includeMixedCommutator
    true, // useSetupReservedSlice
    true, // includeParityGatedCycle -- kept ACTIVE in both arms; only MCM itself is toggled
    includeMultiComponentMerge
  );
  const wallMs = Date.now() - start;
  const wrongWingAfter = moves.length > 0 ? wrongWingCount5(clone) : wrongWingBefore;
  const candidatesEntry = trace.find((t) => t.label === "recovery-candidates");
  return {
    label,
    wrongWingBefore,
    wrongWingAfter,
    chosenType: chosenTypeFromTrace(trace),
    candidatesOffered: candidatesOfferedFromTrace(trace),
    candidatesDetail: candidatesEntry?.detail ?? null,
    improved: wrongWingAfter < wrongWingBefore,
    trueRegression: wrongWingAfter > wrongWingBefore,
    wallMs,
    deadlineMissed: wallMs > CALL_DEADLINE_MS,
  };
}

export interface CapabilityValidationRow {
  label: string;
  baseline: ReplayOutcome;
  integrated: ReplayOutcome;
  newCapability: boolean; // integrated.improved AND NOT baseline.improved -- genuinely only solved because MCM was included
  duplicate: boolean; // integrated.improved AND baseline.improved AND MCM won chooseBestRecovery()'s argmax -- provided no capability beyond what Baseline already achieved
  regression: boolean; // baseline.improved AND NOT integrated.improved -- a case Baseline could solve that Integrated lost
}

export function validateOneCase(hole: HoleCase, libs: ExecutorLibraries): CapabilityValidationRow {
  const baseline = runOneArm(hole.cubies, hole.label, libs, false);
  const integrated = runOneArm(hole.cubies, hole.label, libs, true);
  return {
    label: hole.label,
    baseline,
    integrated,
    newCapability: integrated.improved && !baseline.improved,
    duplicate: integrated.improved && baseline.improved && integrated.chosenType === "MULTI_COMPONENT_MERGE",
    regression: baseline.improved && !integrated.improved,
  };
}

export function validatePopulation(holes: readonly HoleCase[], libs: ExecutorLibraries): CapabilityValidationRow[] {
  return holes.map((h) => validateOneCase(h, libs));
}

export interface CapabilityValidationSummary {
  n: number;
  baselineImprovedCount: number;
  integratedImprovedCount: number;
  newCapabilityCount: number;
  duplicateCount: number;
  regressionCount: number;
  integratedTrueRegressionCount: number;
}

export function summarizeCapabilityValidation(rows: readonly CapabilityValidationRow[]): CapabilityValidationSummary {
  return {
    n: rows.length,
    baselineImprovedCount: rows.filter((r) => r.baseline.improved).length,
    integratedImprovedCount: rows.filter((r) => r.integrated.improved).length,
    newCapabilityCount: rows.filter((r) => r.newCapability).length,
    duplicateCount: rows.filter((r) => r.duplicate).length,
    regressionCount: rows.filter((r) => r.regression).length,
    integratedTrueRegressionCount: rows.filter((r) => r.integrated.trueRegression).length,
  };
}
