// --- ShortCircuitAudit (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP2 addendum) --------------------------------------
// A diagnostic run on scrambleDepth30:2 (real attemptRecovery(), outer=
// 2000ms, trace-enabled) surfaced a concrete, reproducible mechanism none of
// the Directive's own named buckets anticipated: attemptRecovery()'s own
// shortCircuitRepair fast path (fiveByFiveEdgeRecovery.ts, read-only
// reference -- NOT modified this Sprint) only applies to
// `best.type === "REPAIR" || "CCR" || "MIXED_COMMUTATOR" ||
// "PARITY_GATED_CYCLE"` -- MULTI_COMPONENT_MERGE is NOT in that list, even
// though genMultiComponentMerge() (Production Integration Sprint v1's own
// code) already runs the SAME validateDeferred net-improvement guarantee
// before ever adding a candidate (identical to REPAIR/CCR/MIXED_COMMUTATOR/
// PARITY_GATED_CYCLE's own guarantee, per that Sprint's own disclosed
// comment). Consequence: when MCM is chosen and its own moves already
// reduce wrongWingCount below the round's original baseline, the function
// does NOT return immediately (like the 4 short-circuited types would) --
// it falls through to the `retryTask` round trip. If that retry makes no
// further progress AND the next round's own `Date.now() > deadline` check
// trips (MCM's own generation + the retry attempt can consume most of the
// remaining outer deadline), the for-loop `break`s and the function's final
// `return [];` discards the ALREADY-GENUINELY-IMPROVING `applied` moves
// entirely -- turning a real improvement into a reported non-improvement.
// This module detects that specific signature from the real trace, purely
// by PARSING TraceEntry text the production code already emits (zero
// production file change) -- reusing the exact same endgameRetryTask/
// attemptRecovery call pattern as STEP3/STEP5's own modules (disclosed
// reuse).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const OUTER_DEADLINE_MS = 2000; // Arm C conditions -- same as STEP1/STEP2

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

// Parses "recovery-applied" trace lines this file's own attemptRecovery()
// already emits: `"<description>" 선택 -- wrongWing <before> -> <after>, ...`
const APPLIED_RE = /^"(.+)" 선택 -- wrongWing (\d+) -> (\d+),/;

export interface ShortCircuitAuditRow {
  label: string;
  finalMovesEmpty: boolean; // attemptRecovery()'s own return value was []
  mcmWasAppliedInTrace: boolean; // a "recovery-applied" entry mentions Sequential Multi-Component Merge
  mcmOwnNetImprovement: boolean; // that entry's own wrongWing before>after
  shortCircuitGapDetected: boolean; // MCM applied + net-improving, yet final result is empty -- the gap this module exists to find
  wrongWingBefore: number | null;
  wrongWingAfter: number | null;
}

function runOne(hole: HoleCase, libs: ExecutorLibraries): ShortCircuitAuditRow {
  const clone = cloneCubies(hole.cubies);
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const deadline = start + OUTER_DEADLINE_MS;
  const moves = attemptRecovery(
    clone,
    libs,
    deadline,
    DEFAULT_EVALUATOR_WEIGHTS,
    (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline),
    trace,
    true,
    true,
    "reservedBudget",
    true,
    true,
    true,
    true,
    true,
    "AFTER_CCR"
  );

  let mcmWasAppliedInTrace = false;
  let mcmOwnNetImprovement = false;
  let wrongWingBefore: number | null = null;
  let wrongWingAfter: number | null = null;
  for (const t of trace) {
    if (t.label !== "recovery-applied") continue;
    const detail = t.detail ?? "";
    if (!detail.includes("Sequential Multi-Component Merge")) continue;
    const m = APPLIED_RE.exec(detail);
    if (!m) continue;
    mcmWasAppliedInTrace = true;
    wrongWingBefore = Number(m[2]);
    wrongWingAfter = Number(m[3]);
    mcmOwnNetImprovement = wrongWingAfter < wrongWingBefore;
  }

  return {
    label: hole.label,
    finalMovesEmpty: moves.length === 0,
    mcmWasAppliedInTrace,
    mcmOwnNetImprovement,
    shortCircuitGapDetected: mcmWasAppliedInTrace && mcmOwnNetImprovement && moves.length === 0,
    wrongWingBefore,
    wrongWingAfter,
  };
}

export function runShortCircuitAudit(holes: readonly HoleCase[], libs: ExecutorLibraries): ShortCircuitAuditRow[] {
  return holes.map((h) => runOne(h, libs));
}
