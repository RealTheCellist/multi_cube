// --- DeadlineReplay (Multi-Component Merge Production Integration
// Refinement Sprint v2, STEP2/3) ---------------------------------------------
// Real attemptRecovery() replay varying ONLY the outer `deadline` argument
// (an ordinary parameter attemptRecovery() already accepts -- no code
// change needed) across 3 arms: 1000ms(today's real production), 1500ms,
// 2000ms(matches Comparative Prototype Sprint v1's own per-Primitive
// budget). Scheduler order (AFTER_CCR), Gate (componentCount>=3), Budget
// Contract (MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS=2000ms), and the
// Primitive itself are all held fixed at their real production values --
// per this Sprint's own "Scheduler Ordering도 추가 변경하지 않는다" scope.
// Identical trace-parsing methodology to the prior 2 Sprints' own
// CapabilityValidation.ts/CapabilityReplay.ts (disclosed reuse).
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

export const OUTER_DEADLINE_ARMS_MS = { A: 1000, B: 1500, C: 2000 } as const;
export type DeadlineArm = keyof typeof OUTER_DEADLINE_ARMS_MS;

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
}

function runOneArm(cubies: Cubie[], label: string, libs: ExecutorLibraries, outerDeadlineMs: number): ReplayOutcome {
  const clone = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const deadline = start + outerDeadlineMs;
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
    true, // includeMultiComponentMerge
    "AFTER_CCR" // multiComponentMergeOrder -- fixed, per this Sprint's own scope
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
  };
}

export interface DeadlineReplayRow {
  label: string;
  armA: ReplayOutcome; // 1000ms
  armB: ReplayOutcome; // 1500ms
  armC: ReplayOutcome; // 2000ms
}

export function replayOneCase(hole: HoleCase, libs: ExecutorLibraries): DeadlineReplayRow {
  return {
    label: hole.label,
    armA: runOneArm(hole.cubies, hole.label, libs, OUTER_DEADLINE_ARMS_MS.A),
    armB: runOneArm(hole.cubies, hole.label, libs, OUTER_DEADLINE_ARMS_MS.B),
    armC: runOneArm(hole.cubies, hole.label, libs, OUTER_DEADLINE_ARMS_MS.C),
  };
}

export function replayPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries): DeadlineReplayRow[] {
  return holes.map((h) => replayOneCase(h, libs));
}

export interface DeadlineReplaySummary {
  n: number;
  armAImprovedCount: number;
  armBImprovedCount: number;
  armCImprovedCount: number;
  armBNewCapabilityVsA: number; // armB.improved && !armA.improved
  armCNewCapabilityVsA: number; // armC.improved && !armA.improved
  armARegressionCount: number; // armA.trueRegression
  armBRegressionCount: number;
  armCRegressionCount: number;
  armAMcmChosenCount: number;
  armBMcmChosenCount: number;
  armCMcmChosenCount: number;
}

export function summarizeDeadlineReplay(rows: readonly DeadlineReplayRow[]): DeadlineReplaySummary {
  return {
    n: rows.length,
    armAImprovedCount: rows.filter((r) => r.armA.improved).length,
    armBImprovedCount: rows.filter((r) => r.armB.improved).length,
    armCImprovedCount: rows.filter((r) => r.armC.improved).length,
    armBNewCapabilityVsA: rows.filter((r) => r.armB.improved && !r.armA.improved).length,
    armCNewCapabilityVsA: rows.filter((r) => r.armC.improved && !r.armA.improved).length,
    armARegressionCount: rows.filter((r) => r.armA.trueRegression).length,
    armBRegressionCount: rows.filter((r) => r.armB.trueRegression).length,
    armCRegressionCount: rows.filter((r) => r.armC.trueRegression).length,
    armAMcmChosenCount: rows.filter((r) => r.armA.chosenType === "MULTI_COMPONENT_MERGE").length,
    armBMcmChosenCount: rows.filter((r) => r.armB.chosenType === "MULTI_COMPONENT_MERGE").length,
    armCMcmChosenCount: rows.filter((r) => r.armC.chosenType === "MULTI_COMPONENT_MERGE").length,
  };
}
