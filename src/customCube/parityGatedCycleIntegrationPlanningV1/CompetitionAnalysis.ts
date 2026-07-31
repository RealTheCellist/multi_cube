// --- CompetitionAnalysis (Parity-Gated Cycle Production Integration
// Planning Sprint v1, STEP5) -------------------------------------------------
// Adds the Prototype as a 6th competing candidate type alongside the 5 real
// RecoveryType values (DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR), using
// the REAL generateRecoveryStrategies()/chooseBestRecovery() (unmodified)
// for the existing 5 and the same score-comparable Prototype candidate
// construction InsertionPointAnalysis.ts already built (reused here, not
// re-derived). Starvation threshold (offered>=5 AND chosenRate<5%) and
// Duplicate definition are cited from solverReleaseReadiness/
// PrimitiveInteractionMatrix.ts's own established convention -- same
// numbers, not re-invented. Measured on the FULL 142-case Hole Dataset
// (not just the 53-case Unknown Population) since that's where the
// EXISTING primitives actually compete/match at all -- the Unknown
// Population's own defining property is that they never do (0% gateMatched,
// confirmed in Prototype Sprint v1's STEP5).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { generateRecoveryStrategies } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { tryCrossComponentBridgeCycleResolver } from "../parityGatedCyclePrototypeV1/CrossComponentBridgeCycleResolver";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const MOVE_COST_WEIGHT = 2; // fiveByFiveEdgeRecovery.ts's own constant, for a comparable score
export const STARVATION_MIN_OFFERED = 5;
export const STARVATION_MAX_CHOSEN_RATE = 0.05;
export const PROTOTYPE_TEST_BUDGETS_MS = [300, 500]; // MIXED_COMMUTATOR's and SETUP's own reserved-slice sizes -- the two realistic "if given a fair reserved slice" scenarios

export type CompetingType = "DISRUPT" | "SETUP" | "REPAIR" | "CCR" | "MIXED_COMMUTATOR" | "PARITY_GATED_CYCLE";
const ALL_TYPES: CompetingType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE"];

export interface CompetitionRoundResult {
  label: string;
  offered: CompetingType[]; // every type that produced a non-null candidate this round
  chosen: CompetingType | null;
  chosenScore: number | null;
  runnerUpScore: number | null; // second-best score among offered, for ScoreGap
}

function prototypeCandidate(cubies: Cubie[], lib: WingLibrary, budgetMs: number): { moves: Move[] | null; score: number | null } {
  const baseScore = scoreWholeState(cubies, DEFAULT_EVALUATOR_WEIGHTS);
  const result = tryCrossComponentBridgeCycleResolver(cubies, lib, Date.now() + budgetMs);
  if (!result.moves || result.moves.length === 0) return { moves: null, score: null };
  const clone = cloneCubies(cubies);
  applySeq(clone, result.moves);
  const afterScore = scoreWholeState(clone, DEFAULT_EVALUATOR_WEIGHTS);
  const score = afterScore - baseScore - result.moves.length * MOVE_COST_WEIGHT;
  return { moves: result.moves, score };
}

export function runCompetitionRound(cubies: Cubie[], label: string, libs: ExecutorLibraries, prototypeBudgetMs: number): CompetitionRoundResult {
  const existing = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + 1000);
  const proto = prototypeCandidate(cubies, libs.lib, prototypeBudgetMs);

  const offered: CompetingType[] = existing.map((c) => c.type as CompetingType);
  if (proto.moves) offered.push("PARITY_GATED_CYCLE");

  const scored: { type: CompetingType; score: number }[] = existing.map((c) => ({ type: c.type as CompetingType, score: c.score }));
  if (proto.moves && proto.score !== null) scored.push({ type: "PARITY_GATED_CYCLE", score: proto.score });
  scored.sort((a, b) => b.score - a.score);

  const chosen = scored[0]?.type ?? null;
  const chosenScore = scored[0]?.score ?? null;
  const runnerUpScore = scored[1]?.score ?? null;

  return { label, offered, chosen, chosenScore, runnerUpScore };
}

export function runCompetitionAnalysis(holes: readonly HoleCase[], libs: ExecutorLibraries, prototypeBudgetMs: number): CompetitionRoundResult[] {
  return holes.map((h) => runCompetitionRound(h.cubies, h.label, libs, prototypeBudgetMs));
}

export interface CompetitionTypeStats {
  type: CompetingType;
  offeredCount: number;
  chosenCount: number;
  chosenRate: number; // chosenCount / offeredCount
  starved: boolean;
  duplicateCount: number; // always 0 by construction (each type appears at most once in `offered` per round) -- measured, not assumed
}

export function summarizeCompetition(rounds: readonly CompetitionRoundResult[]): { stats: CompetitionTypeStats[]; avgScoreGap: number } {
  const stats: CompetitionTypeStats[] = ALL_TYPES.map((type) => {
    const offeredCount = rounds.filter((r) => r.offered.includes(type)).length;
    const chosenCount = rounds.filter((r) => r.chosen === type).length;
    const duplicateCount = rounds.filter((r) => r.offered.filter((t) => t === type).length > 1).length;
    const chosenRate = offeredCount ? chosenCount / offeredCount : 0;
    return { type, offeredCount, chosenCount, chosenRate, starved: offeredCount >= STARVATION_MIN_OFFERED && chosenRate < STARVATION_MAX_CHOSEN_RATE, duplicateCount };
  });
  const gaps = rounds.filter((r) => r.chosenScore !== null && r.runnerUpScore !== null).map((r) => r.chosenScore! - r.runnerUpScore!);
  const avgScoreGap = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
  return { stats, avgScoreGap };
}
