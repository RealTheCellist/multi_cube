// --- RecoveryLevelCollector (CONFLICT_DEEP_DEPENDENCY Reserved Slice
// Production Integration Sprint v1, STEP3/4) -------------------------------
// Calls the REAL, now-SETUP-Reserved-Slice-wired attemptRecovery() (Recovery
// layer, this Sprint's own allowed Integration target) DIRECTLY -- bypassing
// fiveByFiveEdgeExecutor.ts (frozen this Sprint) -- for a controlled
// Baseline (useSetupReservedSlice=false) vs Candidate (useSetupReservedSlice=
// true) comparison at N repeated runs. Mirrors
// solverPrimitiveCCRProductionIntegration/RecoveryLevelCollector.ts's own
// exact methodology (that file's own header comment explains why
// endgameRetryTask is a disclosed, independent reimplementation of
// fiveByFiveEdgeExecutor.ts's unexported ENDGAME retry branch, reusing only
// EXISTING exported search functions -- duplicated here rather than
// cross-imported, matching this codebase's own convention of each
// Production Integration Sprint's collector being self-contained).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { TraceEntry, RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

// Matches PLAN_TIME_BUDGET_MS (fiveByFiveEdgeSolverEngine.ts) -- the
// isolated-call convention every prior Sprint's own Recovery-level
// benchmark in this arc has used.
export const CALL_DEADLINE_MS = 1000;

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
      if (detail.includes("Clean-Cycle Resolution")) return "CCR";
      if (detail.includes("Mixed Pattern Bracket Commutator")) return "MIXED_COMMUTATOR";
      if (detail.includes("구조적 Cycle 해결")) return "REPAIR";
      if (detail.includes("확장 Disruption") || detail.includes("가벼운 Disruption")) return "DISRUPT";
      if (detail.includes("Multi-ply Setup")) return "SETUP";
    }
  }
  return "none";
}

// "recovery-candidates" detail: `${c.description}: score=${score}` joined by " / "
function candidatesOfferedFromTrace(trace: TraceEntry[]): RecoveryType[] {
  const entry = trace.find((t) => t.label === "recovery-candidates");
  if (!entry?.detail) return [];
  return entry.detail
    .split(" / ")
    .map((seg): RecoveryType | null => {
      if (seg.includes("Clean-Cycle Resolution")) return "CCR";
      if (seg.includes("Mixed Pattern Bracket Commutator")) return "MIXED_COMMUTATOR";
      if (seg.includes("구조적 Cycle 해결")) return "REPAIR";
      if (seg.includes("확장 Disruption") || seg.includes("가벼운 Disruption")) return "DISRUPT";
      if (seg.includes("Multi-ply Setup")) return "SETUP";
      return null;
    })
    .filter((t): t is RecoveryType => t !== null);
}

export interface PerCaseRunRecord {
  label: string;
  wrongWingBefore: number;
  baselineChosenType: RecoveryType | "none";
  baselineCandidatesOffered: RecoveryType[];
  baselineSucceeded: boolean;
  baselineRegressed: boolean;
  baselineTimeMs: number;
  baselineWrongWingAfter: number;
  candidateChosenType: RecoveryType | "none";
  candidateCandidatesOffered: RecoveryType[];
  candidateSucceeded: boolean;
  candidateRegressed: boolean;
  candidateTimeMs: number;
  candidateWrongWingAfter: number;
}

export type RunRecord = PerCaseRunRecord[];

export function collectRun(cases: readonly HoleCase[], libs: ExecutorLibraries): RunRecord {
  return cases.map((c) => {
    const original = c.cubies;
    const wrongBefore = wrongWingCount5(original);

    const baselineClone = cloneCubies(original);
    const baselineStart = Date.now();
    const baselineTrace: TraceEntry[] = [];
    attemptRecovery(
      baselineClone,
      libs,
      Date.now() + CALL_DEADLINE_MS,
      DEFAULT_EVALUATOR_WEIGHTS,
      (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline),
      baselineTrace,
      true,
      true,
      "reservedBudget",
      true,
      true,
      false // useSetupReservedSlice=false -- Baseline: pre-this-Sprint reservedBudget behavior (SETUP shares genDeadline)
    );
    const baselineTimeMs = Date.now() - baselineStart;
    const baselineWrongWingAfter = wrongWingCount5(baselineClone);

    const candidateClone = cloneCubies(original);
    const candidateStart = Date.now();
    const candidateTrace: TraceEntry[] = [];
    attemptRecovery(
      candidateClone,
      libs,
      Date.now() + CALL_DEADLINE_MS,
      DEFAULT_EVALUATOR_WEIGHTS,
      (working, taskDeadline) => endgameRetryTask(working, libs, taskDeadline),
      candidateTrace,
      true,
      true,
      "reservedBudget",
      true,
      true,
      true // useSetupReservedSlice=true -- Candidate: this Sprint's real Production Integration (SETUP_RESERVED_SLICE_MS=500)
    );
    const candidateTimeMs = Date.now() - candidateStart;
    const candidateWrongWingAfter = wrongWingCount5(candidateClone);

    return {
      label: c.label,
      wrongWingBefore: wrongBefore,
      baselineChosenType: chosenTypeFromTrace(baselineTrace),
      baselineCandidatesOffered: candidatesOfferedFromTrace(baselineTrace),
      baselineSucceeded: baselineWrongWingAfter < wrongBefore,
      baselineRegressed: baselineWrongWingAfter > wrongBefore,
      baselineTimeMs,
      baselineWrongWingAfter,
      candidateChosenType: chosenTypeFromTrace(candidateTrace),
      candidateCandidatesOffered: candidatesOfferedFromTrace(candidateTrace),
      candidateSucceeded: candidateWrongWingAfter < wrongBefore,
      candidateRegressed: candidateWrongWingAfter > wrongBefore,
      candidateTimeMs,
      candidateWrongWingAfter,
    };
  });
}
