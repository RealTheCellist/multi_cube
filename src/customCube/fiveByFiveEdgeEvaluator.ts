// Multi-metric task scoring, per Architecture Spec v2.0 section 13. The
// Planner (fiveByFiveEdgePlanner.ts) uses this to ORDER candidate tasks --
// it never simulates actually applying a fix (that's the Executor's job,
// see fiveByFiveEdgeExecutor.ts), so every metric here is a STATIC estimate
// read off the current cube state, not a before/after comparison.
import type { Cubie } from "./cubeState";
import { colorKeyOf, wrongWingCount5 } from "./fiveByFiveEdges";
import { analyzeEdgeSlots, detectEdgeSlotPattern, type EdgeSlotStats } from "./fiveByFiveHumanEdges";

// All weights live in one place, not scattered as inline constants, so
// tuning the Planner's priorities never means hunting through scoring code.
export interface EvaluatorWeights {
  pairedEdges: number;
  protectedEdges: number;
  futurePotential: number;
  slotStability: number;
  flipPenalty: number;
  parityRisk: number;
  remainingWork: number;
  macroGoalProgress: number;
}

export const DEFAULT_EVALUATOR_WEIGHTS: EvaluatorWeights = {
  pairedEdges: 40, // reward slots close to done (pairedCount already 1)
  protectedEdges: -60, // penalize disturbing the pool of already-finished slots
  futurePotential: 80, // reward flipped-pair slots (cheap, no setup needed)
  slotStability: 25, // reward slots whose own wings are already color-correct
  flipPenalty: -15, // small fixed cost for needing the flip tool specifically
  parityRisk: -50, // penalize slots known to need a cross-class ("diagonal") fix
  remainingWork: -10, // per remaining wrong wing, a small urgency-independent cost
  macroGoalProgress: 30, // reward tasks that push the 12-edge completion fraction up
};

export interface TaskMetrics {
  wrongWingCount: number;
  pairedEdges: number;
  protectedEdges: number;
  futurePotential: number;
  slotStability: number;
  flipPenalty: number;
  parityRisk: number;
  remainingWork: number;
  macroGoalProgress: number;
}

const TOTAL_SLOTS = 12;

/** Every diagonal ("3rd/4th" position within its class) slot pairing that
 * BASE_ALG's own rotation orbit cannot reach directly (see
 * fiveByFiveEdges.ts's PARITY_ALG comment) -- flagged here purely as a
 * scoring signal (deprioritize, don't avoid outright), not a hard rule. */
const KNOWN_DIAGONAL_RISK_PATTERN = "unpaired";

export function computeSlotMetrics(cubies: Cubie[], stats: EdgeSlotStats, allStats: EdgeSlotStats[]): TaskMetrics {
  const wrongWingCount = wrongWingCount5(cubies);
  const pairedSlots = allStats.filter((s) => s.pairedCount === 2).length;
  const pattern = detectEdgeSlotPattern(stats);

  const pairedEdges = stats.pairedCount; // 0, 1, or 2 -- this slot's own progress
  const protectedEdges = pairedSlots; // how much is currently "at risk" globally
  const futurePotential = pattern === "flipped-pair" ? 1 : pattern === "half-paired" ? 0.5 : 0;
  const slotStability = stats.wings.every((w) => colorKeyOf(w) === colorKeyOf(stats.trueEdge)) ? 1 : 0;
  const flipPenalty = pattern === "flipped-pair" ? 1 : 0;
  const parityRisk = pattern === KNOWN_DIAGONAL_RISK_PATTERN ? 1 : 0;
  const remainingWork = wrongWingCount - (2 - stats.pairedCount);
  const macroGoalProgress = (pairedSlots + (stats.pairedCount === 2 ? 0 : 1)) / TOTAL_SLOTS;

  return { wrongWingCount, pairedEdges, protectedEdges, futurePotential, slotStability, flipPenalty, parityRisk, remainingWork, macroGoalProgress };
}

export function scoreMetrics(metrics: TaskMetrics, weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS): number {
  return (
    metrics.pairedEdges * weights.pairedEdges +
    metrics.protectedEdges * weights.protectedEdges +
    metrics.futurePotential * weights.futurePotential +
    metrics.slotStability * weights.slotStability +
    metrics.flipPenalty * weights.flipPenalty +
    metrics.parityRisk * weights.parityRisk +
    metrics.remainingWork * weights.remainingWork +
    metrics.macroGoalProgress * weights.macroGoalProgress
  );
}

/** Convenience: analyze the whole cube and score every slot in one pass. */
export function scoreAllSlots(
  cubies: Cubie[],
  weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS
): { stats: EdgeSlotStats; metrics: TaskMetrics; score: number }[] {
  const allStats = analyzeEdgeSlots(cubies);
  return allStats.map((stats) => {
    const metrics = computeSlotMetrics(cubies, stats, allStats);
    return { stats, metrics, score: scoreMetrics(metrics, weights) };
  });
}
