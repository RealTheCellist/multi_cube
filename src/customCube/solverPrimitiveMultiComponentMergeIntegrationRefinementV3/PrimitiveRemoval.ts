// --- PrimitiveRemoval (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP3) -----------------------------------------------
// Counterfactual Primitive Removal: real attemptRecovery() replay at
// outer=2000ms (Arm C conditions, where the successMismatch was observed),
// toggling ONE existing include* flag at a time (includeCCR/includeRepair/
// includeParityGatedCycle/includeMixedCommutator -- all pre-existing
// attemptRecovery() parameters, zero production code change). Tests
// whether removing a specific competing Primitive lets MULTI_COMPONENT_MERGE
// win chooseBestRecovery on the 3 successMismatch cases.
//
// Disclosed scope limitation: DISRUPT and SETUP have NO existing
// include-toggle parameter (they are unconditional in every
// generateRecoveryStrategies() order variant) -- adding one would require
// modifying fiveByFiveEdgeRecovery.ts, which this Sprint's own Directive
// forbids. Their contribution is instead inferred from STEP1/STEP2's own
// timeline evidence (time consumed + whether they produced a competing
// candidate), not from a removal experiment.
//
// Identical trace-parsing methodology to Refinement Sprint v2's own
// DeadlineReplay.ts (disclosed reuse -- endgameRetryTask/chosenTypeFromTrace
// reimplemented locally since that Sprint's module keeps them private).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const OUTER_DEADLINE_MS = 2000; // Arm C conditions -- where the successMismatch was observed

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

export type RemovalConfig = "FULL" | "WITHOUT_CCR" | "WITHOUT_REPAIR" | "WITHOUT_PARITY_GATED_CYCLE" | "WITHOUT_MIXED_COMMUTATOR";
export const REMOVAL_CONFIGS: RemovalConfig[] = ["FULL", "WITHOUT_CCR", "WITHOUT_REPAIR", "WITHOUT_PARITY_GATED_CYCLE", "WITHOUT_MIXED_COMMUTATOR"];

function flagsFor(config: RemovalConfig) {
  return {
    includeRepair: config !== "WITHOUT_REPAIR",
    includeCCR: config !== "WITHOUT_CCR",
    includeMixedCommutator: config !== "WITHOUT_MIXED_COMMUTATOR",
    includeParityGatedCycle: config !== "WITHOUT_PARITY_GATED_CYCLE",
  };
}

export interface RemovalOutcome {
  config: RemovalConfig;
  improved: boolean;
  chosenType: RecoveryType | "none";
  wrongWingBefore: number;
  wrongWingAfter: number;
}

function runOneConfig(cubies: Cubie[], libs: ExecutorLibraries, config: RemovalConfig): RemovalOutcome {
  const clone = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const deadline = start + OUTER_DEADLINE_MS;
  const flags = flagsFor(config);
  const moves = attemptRecovery(
    clone,
    libs,
    deadline,
    DEFAULT_EVALUATOR_WEIGHTS,
    (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline),
    trace,
    flags.includeRepair,
    true, // shortCircuitRepair
    "reservedBudget",
    flags.includeCCR,
    flags.includeMixedCommutator,
    true, // useSetupReservedSlice
    flags.includeParityGatedCycle,
    true, // includeMultiComponentMerge -- always on, this Sprint studies whether REMOVING competitors helps MCM win
    "AFTER_CCR" // Scheduler Ordering fixed -- not this Sprint's scope
  );
  const wrongWingAfter = moves.length > 0 ? wrongWingCount5(clone) : wrongWingBefore;
  return {
    config,
    improved: wrongWingAfter < wrongWingBefore,
    chosenType: chosenTypeFromTrace(trace),
    wrongWingBefore,
    wrongWingAfter,
  };
}

export interface CaseRemovalRow {
  label: string;
  outcomes: RemovalOutcome[];
  anyRemovalRescues: boolean; // some WITHOUT_* config improved when FULL did not
  rescuingConfigs: RemovalConfig[];
}

export function runRemovalForCase(hole: HoleCase, libs: ExecutorLibraries): CaseRemovalRow {
  const outcomes = REMOVAL_CONFIGS.map((c) => runOneConfig(hole.cubies, libs, c));
  const fullOutcome = outcomes.find((o) => o.config === "FULL")!;
  const rescuing = outcomes.filter((o) => o.config !== "FULL" && o.improved && !fullOutcome.improved);
  return {
    label: hole.label,
    outcomes,
    anyRemovalRescues: rescuing.length > 0,
    rescuingConfigs: rescuing.map((r) => r.config),
  };
}

export function runRemovalPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries): CaseRemovalRow[] {
  return holes.map((h) => runRemovalForCase(h, libs));
}
