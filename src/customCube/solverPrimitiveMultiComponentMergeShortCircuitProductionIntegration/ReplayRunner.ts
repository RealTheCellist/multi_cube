// --- ReplayRunner (Multi-Component Merge Short-Circuit Production
// Integration Sprint v1, STEP2/3/4 shared) -------------------------------------
// Real attemptRecovery() replay at TODAY'S REAL PRODUCTION DEFAULTS (no
// experimental parameters -- outer=1000ms, AFTER_CCR order, every include*
// flag left at its default true/"reservedBudget"/"AFTER_CCR"). Used for
// BOTH the full 142-case Production Replay (STEP2) and the 3-case
// SuccessMismatch Replay (STEP3), and doubles as STEP4's own Short-Circuit
// Validation source (mcmShortCircuited field, parsed from the same trace).
// Identical trace-parsing methodology to every prior Sprint's own
// endgameRetryTask/chosenTypeFromTrace (disclosed reuse, reimplemented
// locally per this arc's own established convention).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const PRODUCTION_OUTER_DEADLINE_MS = 1000; // PLAN_TIME_BUDGET_MS -- today's real production outer deadline

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

function mcmShortCircuitedFromTrace(trace: TraceEntry[]): boolean {
  // The "recovery-repair-short-circuit" log line (fiveByFiveEdgeRecovery.ts)
  // interpolates `${best.type}` directly -- the RecoveryType enum value
  // ("MULTI_COMPONENT_MERGE"), NOT the human-readable candidate description
  // ("Sequential Multi-Component Merge") used elsewhere (e.g.
  // "recovery-applied"/"recovery-candidates"). Match the actual text this
  // specific log line emits.
  return trace.some((t) => t.label === "recovery-repair-short-circuit" && (t.detail ?? "").includes("MULTI_COMPONENT_MERGE"));
}

export interface ReplayOutcome {
  label: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  chosenType: RecoveryType | "none";
  mcmShortCircuited: boolean; // STEP4: MCM was chosen AND took the short-circuit immediate-return path this run
  improved: boolean;
  trueRegression: boolean;
  wallMs: number;
}

export function runOneCase(hole: HoleCase, libs: ExecutorLibraries, outerDeadlineMs: number = PRODUCTION_OUTER_DEADLINE_MS): ReplayOutcome {
  const clone = cloneCubies(hole.cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const deadline = start + outerDeadlineMs;
  const moves = attemptRecovery(clone, libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline), trace);
  const wallMs = Date.now() - start;
  const wrongWingAfter = moves.length > 0 ? wrongWingCount5(clone) : wrongWingBefore;
  return {
    label: hole.label,
    wrongWingBefore,
    wrongWingAfter,
    chosenType: chosenTypeFromTrace(trace),
    mcmShortCircuited: mcmShortCircuitedFromTrace(trace),
    improved: wrongWingAfter < wrongWingBefore,
    trueRegression: wrongWingAfter > wrongWingBefore,
    wallMs,
  };
}

export function runPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries, outerDeadlineMs: number = PRODUCTION_OUTER_DEADLINE_MS): ReplayOutcome[] {
  return holes.map((h) => runOneCase(h, libs, outerDeadlineMs));
}
