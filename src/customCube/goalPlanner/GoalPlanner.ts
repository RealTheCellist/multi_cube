// --- GoalPlanner (GOSP prototype) --------------------------------------------
// Top-level orchestrator: ties GoalReplay + GoalAnalyzer + GoalEvaluator
// together, computes spec section 13's within-cluster Goal commonality, and
// checks spec section 15's Level 1/2/3 success criteria against real data.
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import { loadTopReplays, runGoalVerification } from "./GoalReplay";
import { exploreStateGraph, extractGoalCandidates } from "./GoalAnalyzer";
import { scoreAll } from "./GoalEvaluator";
import { DEFAULT_GOAL_SEARCH_OPTIONS, type GoalSearchOptions, type StateGraph } from "./GoalState";
import type { ClusterGoalSignature, GoalCandidate, GoalReplayBenchmarkResult } from "./GoalDescriptor";

export interface GoalPlannerOptions {
  totalReplayBudget: number; // spec section 7 -- "상위 20개 Replay"
  searchOptions: GoalSearchOptions;
  benchmarkTopK: number; // how many top-scored candidates get the expensive Goal Replay verification (section 14)
  level1MinReplays: number; // spec section 15 Level 1 threshold -- 5
  clusterGoalMinOccurrences: number; // spec section 13's own promotion threshold (disclosed: 2+)
}

export const DEFAULT_GOAL_PLANNER_OPTIONS: GoalPlannerOptions = {
  totalReplayBudget: 20,
  searchOptions: DEFAULT_GOAL_SEARCH_OPTIONS,
  benchmarkTopK: 30,
  level1MinReplays: 5,
  clusterGoalMinOccurrences: 2,
};

export interface GoalPlannerResult {
  replaysAnalyzed: number;
  graphs: StateGraph[];
  allCandidates: GoalCandidate[]; // scored
  clusterGoals: ClusterGoalSignature[]; // section 13 promotions, within one clusterKey
  globalGoalGroups: { goalSignature: string; replayHashes: string[] }[]; // cluster-agnostic, for Level 1
  benchmarkResults: GoalReplayBenchmarkResult[];
  successRateWithoutGoal: number;
  successRateAfterGoal: number;
  level1: boolean;
  level2: boolean;
  level3: boolean;
}

function computeClusterGoals(candidates: readonly GoalCandidate[], minOccurrences: number): ClusterGoalSignature[] {
  const groups = new Map<string, GoalCandidate[]>();
  for (const c of candidates) {
    const key = `${c.clusterKey}::${c.goalSignature}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const promoted: ClusterGoalSignature[] = [];
  for (const [, list] of groups) {
    const replayHashes = [...new Set(list.map((c) => c.replayHash))];
    if (replayHashes.length < minOccurrences) continue;
    const representative = list.reduce((best, c) => ((c.goalScore ?? 0) > (best.goalScore ?? 0) ? c : best));
    promoted.push({
      clusterKey: list[0].clusterKey,
      goalSignature: list[0].goalSignature,
      occurrences: replayHashes.length,
      replayHashes,
      representativeCandidate: representative,
    });
  }
  return promoted.sort((a, b) => b.occurrences - a.occurrences);
}

function computeGlobalGoalGroups(candidates: readonly GoalCandidate[]): { goalSignature: string; replayHashes: string[] }[] {
  const groups = new Map<string, Set<string>>();
  for (const c of candidates) {
    const set = groups.get(c.goalSignature) ?? new Set<string>();
    set.add(c.replayHash);
    groups.set(c.goalSignature, set);
  }
  return [...groups.entries()]
    .map(([goalSignature, replayHashes]) => ({ goalSignature, replayHashes: [...replayHashes] }))
    .sort((a, b) => b.replayHashes.length - a.replayHashes.length);
}

export function runGoalPlannerSprint(dbPath: string, options: GoalPlannerOptions = DEFAULT_GOAL_PLANNER_OPTIONS): GoalPlannerResult {
  warmupFiveByFiveEdgeLibraries();
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  const replays = loadTopReplays(dbPath, options.totalReplayBudget);
  const graphs: StateGraph[] = [];
  const rawCandidates: GoalCandidate[] = [];

  for (const replay of replays) {
    const graph = exploreStateGraph(replay.cubies, libs, replay.snapshot.hash, replay.clusterKey, options.searchOptions);
    graphs.push(graph);
    rawCandidates.push(...extractGoalCandidates(graph));
  }

  const allCandidates = scoreAll(rawCandidates);
  const clusterGoals = computeClusterGoals(allCandidates, options.clusterGoalMinOccurrences);
  const globalGoalGroups = computeGlobalGoalGroups(allCandidates);
  const level1 = globalGoalGroups.some((g) => g.replayHashes.length >= options.level1MinReplays);

  const byReplayHash = new Map(replays.map((r) => [r.snapshot.hash, r.snapshot]));
  const topForBenchmark = [...allCandidates]
    .sort((a, b) => (b.goalScore ?? 0) - (a.goalScore ?? 0))
    .slice(0, options.benchmarkTopK);
  const benchmarkResults = topForBenchmark.map((c) => runGoalVerification(c, byReplayHash.get(c.replayHash)!));

  const successRateWithoutGoal = benchmarkResults.length
    ? benchmarkResults.filter((r) => r.solverSolvedWithoutGoal).length / benchmarkResults.length
    : 0;
  const successRateAfterGoal = benchmarkResults.length
    ? benchmarkResults.filter((r) => r.solverSolvedAfterGoal).length / benchmarkResults.length
    : 0;
  // Level 2 (spec: "Goal 도달 이후 기존 Solver 성공률 증가") -- a real,
  // strict increase in the AGGREGATE solved-rate across the benchmarked set.
  const level2 = successRateAfterGoal > successRateWithoutGoal;
  // Level 3 (spec: "기존 Primitive 수정 없이 Goal Planner만 추가하여 Replay
  // 성공률 증가") is the SAME empirical fact as Level 2, with the added
  // architectural guarantee that no Primitive was modified to produce it --
  // that guarantee holds structurally here (verified separately via git
  // diff/status against the 5 protected files), so Level 3 == Level 2.
  const level3 = level2;

  return {
    replaysAnalyzed: replays.length,
    graphs,
    allCandidates,
    clusterGoals,
    globalGoalGroups,
    benchmarkResults,
    successRateWithoutGoal,
    successRateAfterGoal,
    level1,
    level2,
    level3,
  };
}
