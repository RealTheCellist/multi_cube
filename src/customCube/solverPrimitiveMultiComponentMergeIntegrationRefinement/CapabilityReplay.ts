// --- CapabilityReplay (Multi-Component Merge Production Integration
// Refinement Sprint v1, STEP2/STEP3) -------------------------------------------
// Real attemptRecovery() replay, 3 arms: Baseline (MCM disabled -- today's
// pre-MCM production), AFTER_CCR (today's real MULTI_COMPONENT_MERGE
// production order), BEFORE_CCR (this Sprint's own reordering experiment).
// Identical methodology to
// solverPrimitiveMultiComponentMergeProductionIntegration/CapabilityValidation.ts
// (disclosed reuse of its own endgameRetryTask/chosenTypeFromTrace/
// candidatesOfferedFromTrace helpers), generalized from 2 arms to 3 and
// parameterized by the new multiComponentMergeOrder.
//
// STEP2's own "Arm C: Unlimited Budget" is NOT re-replayed here -- it is
// cited directly from the Comparative Prototype Sprint v1's own real,
// already-measured full-2000ms-budget result (multiImproved flags on the
// 9 componentCount>=3 cases: 4/9 succeeded standalone with a full,
// uncompeted-for budget) since that is exactly what "Unlimited Budget"
// means and re-running it would just reproduce the same numbers.
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
import type { MultiComponentMergeOrder } from "./BudgetAudit";

const CALL_DEADLINE_MS = 1000;

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
  improved: boolean;
  trueRegression: boolean;
  wallMs: number;
  deadlineMissed: boolean;
}

export type Arm = "BASELINE_NO_MCM" | "AFTER_CCR" | "BEFORE_CCR";

function runOneArm(cubies: Cubie[], label: string, libs: ExecutorLibraries, arm: Arm): ReplayOutcome {
  const clone = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const deadline = start + CALL_DEADLINE_MS;
  const includeMcm = arm !== "BASELINE_NO_MCM";
  const order: MultiComponentMergeOrder = arm === "BEFORE_CCR" ? "BEFORE_CCR" : "AFTER_CCR";
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
    true, // includeParityGatedCycle
    includeMcm,
    order
  );
  const wallMs = Date.now() - start;
  const wrongWingAfter = moves.length > 0 ? wrongWingCount5(clone) : wrongWingBefore;
  return {
    label,
    wrongWingBefore,
    wrongWingAfter,
    chosenType: chosenTypeFromTrace(trace),
    candidatesOffered: candidatesOfferedFromTrace(trace),
    improved: wrongWingAfter < wrongWingBefore,
    trueRegression: wrongWingAfter > wrongWingBefore,
    wallMs,
    deadlineMissed: wallMs > CALL_DEADLINE_MS,
  };
}

export interface CapabilityReplayRow {
  label: string;
  baseline: ReplayOutcome;
  afterCcr: ReplayOutcome;
  beforeCcr: ReplayOutcome;
}

export function replayOneCase(hole: HoleCase, libs: ExecutorLibraries): CapabilityReplayRow {
  return {
    label: hole.label,
    baseline: runOneArm(hole.cubies, hole.label, libs, "BASELINE_NO_MCM"),
    afterCcr: runOneArm(hole.cubies, hole.label, libs, "AFTER_CCR"),
    beforeCcr: runOneArm(hole.cubies, hole.label, libs, "BEFORE_CCR"),
  };
}

export function replayPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries): CapabilityReplayRow[] {
  return holes.map((h) => replayOneCase(h, libs));
}

export interface CapabilityReplaySummary {
  n: number;
  baselineImprovedCount: number;
  afterCcrImprovedCount: number;
  beforeCcrImprovedCount: number;
  afterCcrNewCapabilityCount: number; // afterCcr.improved && !baseline.improved
  beforeCcrNewCapabilityCount: number; // beforeCcr.improved && !baseline.improved
  afterCcrRegressionCount: number; // baseline.improved && !afterCcr.improved
  beforeCcrRegressionCount: number;
  afterCcrTrueRegressionCount: number;
  beforeCcrTrueRegressionCount: number;
}

export function summarizeCapabilityReplay(rows: readonly CapabilityReplayRow[]): CapabilityReplaySummary {
  return {
    n: rows.length,
    baselineImprovedCount: rows.filter((r) => r.baseline.improved).length,
    afterCcrImprovedCount: rows.filter((r) => r.afterCcr.improved).length,
    beforeCcrImprovedCount: rows.filter((r) => r.beforeCcr.improved).length,
    afterCcrNewCapabilityCount: rows.filter((r) => r.afterCcr.improved && !r.baseline.improved).length,
    beforeCcrNewCapabilityCount: rows.filter((r) => r.beforeCcr.improved && !r.baseline.improved).length,
    afterCcrRegressionCount: rows.filter((r) => r.baseline.improved && !r.afterCcr.improved).length,
    beforeCcrRegressionCount: rows.filter((r) => r.baseline.improved && !r.beforeCcr.improved).length,
    afterCcrTrueRegressionCount: rows.filter((r) => r.afterCcr.trueRegression).length,
    beforeCcrTrueRegressionCount: rows.filter((r) => r.beforeCcr.trueRegression).length,
  };
}
