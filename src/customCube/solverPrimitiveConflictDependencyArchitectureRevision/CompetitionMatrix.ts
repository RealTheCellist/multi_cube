// --- CompetitionMatrix (CONFLICT_DEEP_DEPENDENCY Architecture Revision
// Sprint v1, STEP1) -----------------------------------------------------------
// Calls the REAL, unmodified generateRecoveryStrategies() DIRECTLY (bypassing
// Executor/fiveByFiveEdgeRecovery.ts's own attemptRecovery() retry loop --
// this Sprint only needs a single generation round per case, not the full
// Recovery Sequence) with today's real production defaults
// (schedulingStrategy="reservedBudget", useSetupReservedSlice=true,
// includeRepair/includeCCR/includeMixedCommutator=true) using the existing
// onEvent instrumentation hook (SchedulingEvent, already exported for this
// exact purpose since Integration Refinement Sprint v1 -- no new
// instrumentation added to the production file) to capture per-candidate
// generation wall time. Zero reconstruction: every candidate's score/
// expectedFuturePotential/moves come directly from the real function's own
// return value.
import { cloneCubies, type Cubie } from "../cubeState";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const GEN_DEADLINE_MS = 1000; // matches CALL_DEADLINE_MS convention used throughout this arc's own Recovery-level probes

export interface CandidateRow {
  type: RecoveryType;
  score: number;
  expectedFuturePotential: number;
  expectedWrongWingDelta: number;
  movesLength: number;
  runtimeMs: number | null; // from onEvent start->generated/empty, null if not observed
}

export interface CompetitionRound {
  label: string;
  candidateCount: number;
  candidates: CandidateRow[];
  chosenType: RecoveryType | "none";
  chosenScore: number | null;
  runnerUpType: RecoveryType | "none";
  runnerUpScore: number | null;
  scoreGap: number | null; // chosenScore - runnerUpScore, null if <2 candidates
}

function runtimeFromEvents(events: SchedulingEvent[], type: RecoveryType): number | null {
  // Multiple DISRUPT events share the same type label (two DISRUPT generation
  // steps) -- sum their observed durations since CandidateRow doesn't
  // distinguish which DISRUPT call produced a given candidate (neither does
  // chooseBestRecovery(), which treats them as ordinary same-type candidates).
  let total = 0;
  let found = false;
  let startAt: number | null = null;
  for (const e of events) {
    if (e.candidateType !== type) continue;
    if (e.phase === "start") {
      startAt = e.atMs;
    } else if ((e.phase === "generated" || e.phase === "empty") && startAt !== null) {
      total += e.atMs - startAt;
      startAt = null;
      found = true;
    }
  }
  return found ? total : null;
}

export function runCompetitionRound(cubies: Cubie[], libs: ExecutorLibraries, label: string): CompetitionRound {
  const events: SchedulingEvent[] = [];
  const clone = cloneCubies(cubies);
  const deadline = Date.now() + GEN_DEADLINE_MS;
  const candidates: RecoveryStrategy[] = generateRecoveryStrategies(
    clone,
    libs,
    deadline,
    DEFAULT_EVALUATOR_WEIGHTS,
    true,
    "reservedBudget",
    (e) => events.push(e),
    true,
    true,
    true // useSetupReservedSlice=true -- today's real production default
  );

  const rows: CandidateRow[] = candidates.map((c) => ({
    type: c.type,
    score: c.score,
    expectedFuturePotential: c.expectedFuturePotential,
    expectedWrongWingDelta: c.expectedWrongWingDelta,
    movesLength: c.moves.length,
    runtimeMs: runtimeFromEvents(events, c.type),
  }));

  const best = chooseBestRecovery(candidates);
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const runnerUp = sorted.find((c) => c !== best) ?? null;

  return {
    label,
    candidateCount: candidates.length,
    candidates: rows,
    chosenType: best?.type ?? "none",
    chosenScore: best?.score ?? null,
    runnerUpType: runnerUp?.type ?? "none",
    runnerUpScore: runnerUp?.score ?? null,
    scoreGap: best && runnerUp ? best.score - runnerUp.score : null,
  };
}

export function runCompetitionMatrix(cases: readonly HoleCase[], libs: ExecutorLibraries, repeats: number): CompetitionRound[] {
  const rounds: CompetitionRound[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    for (const c of cases) rounds.push(runCompetitionRound(c.cubies, libs, `${c.label}#${rep}`));
  }
  return rounds;
}

export interface DisplacementRow {
  displacedType: RecoveryType;
  countAsRunnerUp: number; // rounds where SETUP won and this type was the runner-up
  avgScoreGap: number;
}

export interface CompetitionMatrixSummary {
  n: number;
  setupWinCount: number;
  setupWinRate: number;
  avgScoreGapWhenSetupWins: number;
  displacement: DisplacementRow[]; // who SETUP displaced, ranked by frequency
}

export function summarizeCompetitionMatrix(rounds: readonly CompetitionRound[]): CompetitionMatrixSummary {
  const n = rounds.length;
  const setupWins = rounds.filter((r) => r.chosenType === "SETUP");
  const gapValues = setupWins.map((r) => r.scoreGap).filter((g): g is number => g !== null);
  const avgScoreGapWhenSetupWins = gapValues.length ? gapValues.reduce((a, b) => a + b, 0) / gapValues.length : 0;

  const displacedCounts = new Map<RecoveryType, { count: number; gapSum: number }>();
  for (const r of setupWins) {
    if (r.runnerUpType === "none" || r.runnerUpType === "SETUP") continue;
    const entry = displacedCounts.get(r.runnerUpType) ?? { count: 0, gapSum: 0 };
    entry.count += 1;
    entry.gapSum += r.scoreGap ?? 0;
    displacedCounts.set(r.runnerUpType, entry);
  }
  const displacement: DisplacementRow[] = [...displacedCounts.entries()]
    .map(([displacedType, { count, gapSum }]) => ({ displacedType, countAsRunnerUp: count, avgScoreGap: count ? gapSum / count : 0 }))
    .sort((a, b) => b.countAsRunnerUp - a.countAsRunnerUp);

  return {
    n,
    setupWinCount: setupWins.length,
    setupWinRate: n ? setupWins.length / n : 0,
    avgScoreGapWhenSetupWins,
    displacement,
  };
}
