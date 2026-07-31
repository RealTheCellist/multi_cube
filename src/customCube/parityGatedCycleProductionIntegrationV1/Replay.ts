// --- Replay (Parity-Gated Cycle Production Integration Sprint v1,
// STEP3/4) ----------------------------------------------------------------
// Calls the REAL, now-PARITY_GATED_CYCLE-wired attemptRecovery() (Recovery
// layer, this Sprint's own allowed integration layer) DIRECTLY -- bypassing
// fiveByFiveEdgeExecutor.ts (frozen this Sprint, never given a passthrough
// for includeParityGatedCycle) -- for a controlled Baseline
// (includeParityGatedCycle=false) vs Integrated (true, the real production
// default) comparison. This is the EXACT same methodology CCR Production
// Integration Sprint v1's own RecoveryLevelCollector.ts and Mixed
// Commutator Production Integration Sprint v1 both already established for
// this exact situation (a brand new Recovery candidate with no pre-existing
// passthrough all the way to solve()) -- not a new technique.
//
// endgameRetryTask below is the SAME disclosed, independent reimplementation
// of fiveByFiveEdgeExecutor.ts's own UNEXPORTED runPrimaryPipeline ENDGAME
// branch that RecoveryLevelCollector.ts's own comment already discloses
// (reusing the exact same EXISTING, unmodified exports --
// bestFixOverall/tryEndgameMultiPly/tryEndgameThroughDisruption) --
// Executor itself is never imported, modified, or bypassed at the type
// level.
//
// Population: the SAME 142-case Hole Dataset every Recovery-level
// Production Integration Sprint in this arc has used
// (loadRawHoleDataset(), unmodified, no new dataset) -- these are
// precisely the states where the ordinary Planner/Executor pipeline
// already got stuck and Recovery is genuinely invoked in real solve()
// usage.
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
    if (part.includes("Cross-Component Bridge Cycle Resolver")) offered.push("PARITY_GATED_CYCLE");
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
  candidatesDetail: string | null; // raw "recovery-candidates" trace line, "<description>: score=<n>" joined by " / " -- for Competition.ts's own score-gap parsing
  succeeded: boolean;
  improved: boolean;
  trueRegression: boolean;
  wallMs: number;
  deadlineMissed: boolean;
}

// Parses (type, score) pairs directly out of the real "recovery-candidates"
// trace line (fiveByFiveEdgeRecovery.ts's own
// `${c.description}: score=${c.score.toFixed(1)}` format, unmodified) --
// same classification rules as candidatesOfferedFromTrace, extended to
// also capture the score each candidate actually carried.
export function parseScoredCandidates(detail: string | null): { type: RecoveryType; score: number }[] {
  if (!detail) return [];
  const result: { type: RecoveryType; score: number }[] = [];
  for (const part of detail.split(" / ")) {
    const m = /score=(-?\d+(?:\.\d+)?)/.exec(part);
    if (!m) continue;
    const score = parseFloat(m[1]);
    let type: RecoveryType | null = null;
    if (part.includes("Cross-Component Bridge Cycle Resolver")) type = "PARITY_GATED_CYCLE";
    else if (part.includes("Mixed Pattern Bracket Commutator")) type = "MIXED_COMMUTATOR";
    else if (part.includes("Clean-Cycle Resolution")) type = "CCR";
    else if (part.includes("구조적 Cycle 해결")) type = "REPAIR";
    else if (part.includes("확장 Disruption") || part.includes("가벼운 Disruption")) type = "DISRUPT";
    else if (part.includes("Multi-ply Setup")) type = "SETUP";
    if (type) result.push({ type, score });
  }
  return result;
}

function runOneArm(cubies: Cubie[], label: string, libs: ExecutorLibraries, includeParityGatedCycle: boolean): ReplayOutcome {
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
    includeParityGatedCycle
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
    succeeded: wrongWingAfter < wrongWingBefore,
    improved: wrongWingAfter < wrongWingBefore,
    trueRegression: wrongWingAfter > wrongWingBefore,
    wallMs,
    deadlineMissed: wallMs > CALL_DEADLINE_MS,
  };
}

export interface ReplayPair {
  baseline: ReplayOutcome;
  integrated: ReplayOutcome;
}

export function replayOneCase(hole: HoleCase, libs: ExecutorLibraries): ReplayPair {
  return {
    baseline: runOneArm(hole.cubies, hole.label, libs, false),
    integrated: runOneArm(hole.cubies, hole.label, libs, true),
  };
}

export function replayPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries): ReplayPair[] {
  return holes.map((h) => replayOneCase(h, libs));
}
