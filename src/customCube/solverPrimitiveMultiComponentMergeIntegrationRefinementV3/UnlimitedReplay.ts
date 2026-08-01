// --- UnlimitedReplay (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP5) -----------------------------------------------
// Counterfactual Unlimited Production Replay: reproduces Comparative
// Prototype Sprint v1's own "no outer deadline" condition as closely as
// possible WITHOUT touching the Primitive algorithm or the Scheduler --
// only the pre-existing `deadline` argument to attemptRecovery() is set far
// larger than any real candidate's own dedicated slice could ever consume
// (60000ms, vs MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS=2000ms and every
// other candidate's own smaller slice()), so every gen*()'s own
// Math.min(deadline, ...) clamp resolves to its OWN nominal budget instead
// of the shrinking outer deadline. This is the same "vary only the existing
// deadline parameter" technique Refinement Sprint v2 used for its own Arm
// A/B/C -- generalized here to a value large enough that NO candidate is
// ever outer-deadline-limited, only self-limited by its own nominal slice
// (mirroring Comparative Prototype Sprint v1's own isolated per-Primitive
// budget, just inside the full competing pipeline rather than alone).
//
// Disclosed remaining gap vs true isolation: other Primitives still RUN and
// still consume real wall-clock time and can still WIN chooseBestRecovery's
// argmax over MCM -- this counterfactual removes the BUDGET constraint, not
// the SCHEDULING competition (that is STEP3's own job, and STEP6's Root
// Cause Matrix combines both).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const UNLIMITED_OUTER_DEADLINE_MS = 60000; // far larger than any candidate's own nominal slice (largest is MCM's own 2000ms) -- no candidate is ever outer-deadline-clamped

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

export interface UnlimitedReplayRow {
  label: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  improved: boolean;
  chosenType: RecoveryType | "none";
  wallMs: number;
}

function runOne(cubies: Cubie[], label: string, libs: ExecutorLibraries): UnlimitedReplayRow {
  const clone = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const deadline = start + UNLIMITED_OUTER_DEADLINE_MS;
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
    "AFTER_CCR" // Scheduler Ordering fixed -- not this Sprint's scope
  );
  const wallMs = Date.now() - start;
  const wrongWingAfter = moves.length > 0 ? wrongWingCount5(clone) : wrongWingBefore;
  return {
    label,
    wrongWingBefore,
    wrongWingAfter,
    improved: wrongWingAfter < wrongWingBefore,
    chosenType: chosenTypeFromTrace(trace),
    wallMs,
  };
}

export function runUnlimitedReplay(holes: readonly HoleCase[], libs: ExecutorLibraries): UnlimitedReplayRow[] {
  return holes.map((h) => runOne(h.cubies, h.label, libs));
}
