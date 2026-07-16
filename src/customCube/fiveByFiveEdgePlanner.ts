// --- Planner v2: Strategy-based planning ------------------------------------
// Upgraded per the "Planner v2 Upgrade" spec: the old Planner just sorted
// unfinished edge slots by their own immediate score and called the sorted
// list a plan -- a plain priority queue, not a strategy. This version
// generates several CANDIDATE whole-cube strategies (each an ordered
// MacroGoal sequence reflecting a different human-plausible priority: finish
// what's nearly done, do the cheap flips first, front-load the risky cases
// while the budget is freshest, etc.), previews each one a few goals deep
// against a CLONED cube (never the real one), scores the resulting state
// with the Evaluator, and only then commits to the highest-scoring
// strategy's full goal sequence. The Executor and Library stay completely
// untouched -- this file only ever calls Executor's own public
// executeTask() as a black box for simulation, never Library functions
// directly (spec section "Planner 금지 사항").
import type { Cubie } from "./cubeState";
import { buildSolvedCube, cloneCubies } from "./cubeState";
import { wrongWingCount5 } from "./fiveByFiveEdges";
import { analyzeEdgeSlots, detectEdgeSlotPattern, type EdgeSlotStats } from "./fiveByFiveHumanEdges";
import { computeSlotMetrics, scoreMetrics, scoreWholeState, type EvaluatorWeights, DEFAULT_EVALUATOR_WEIGHTS } from "./fiveByFiveEdgeEvaluator";
import { executeTask, type ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import type { MacroGoal, MacroGoalType, SolveStrategy, SolveTask, SolveTaskType, TraceEntry } from "./fiveByFiveEdgeSolverTypes";

// Canonical 0-11 numbering for the 12 true-edge slots, derived once from a
// solved reference cube (stable regardless of any particular scramble's own
// iteration order) -- gives SolveTask.targetEdge a real, stable meaning
// instead of an arbitrary per-call index.
let cachedSlotOrder: string[] | null = null;
function slotOrder(): string[] {
  if (cachedSlotOrder) return cachedSlotOrder;
  const solved = buildSolvedCube(5);
  cachedSlotOrder = analyzeEdgeSlots(solved)
    .map((s) => s.slot)
    .sort();
  return cachedSlotOrder;
}
function slotIndex(slot: string): number {
  return slotOrder().indexOf(slot); // -1 is a legitimate "not one of the 12 canonical slots" signal
}
/** Reverse of slotIndex -- the Executor needs to go from a task's
 * targetEdge number back to the actual slot key to find its Cubies. */
export function slotKeyForIndex(index: number): string | null {
  return slotOrder()[index] ?? null;
}

let nextTaskId = 1;
let nextStrategyId = 1;

function macroGoalTypeToTaskType(type: MacroGoalType): SolveTaskType {
  if (type === "FIX_FLIP") return "FLIP";
  if (type === "PAIR_EDGE") return "PAIR";
  if (type === "LAST_TWO") return "PARITY"; // the case library IS the Last-2-Edges technique
  return type; // "PARITY" | "ENDGAME" already match 1:1
}

function macroGoalToTask(goal: MacroGoal): SolveTask {
  const type = macroGoalTypeToTaskType(goal.type);
  const slot = goal.targetEdge >= 0 ? slotKeyForIndex(goal.targetEdge) : null;
  return {
    id: nextTaskId++,
    type,
    description:
      type === "FLIP"
        ? `${slot} 슬롯 flip 보정`
        : type === "PAIR"
          ? `${slot} 슬롯 wing 페어링`
          : type === "PARITY"
            ? "Last-2-Edges 케이스 매칭 시도"
            : "잔여 wing 그라인더 (bestFixOverall 등)",
    targetEdge: goal.targetEdge,
    score: goal.priority,
  };
}

// --- Strategy generation ----------------------------------------------------
// Each ordering below reflects a genuinely different priority a human solver
// might reach for -- not just re-sorting the same score, but changing which
// SIGNAL to sort by. Kept to simple, explainable orderings (not a general
// search over all 12!/subsets) since the point is to give the simulation
// layer below several real, distinct candidates to actually test against
// the cube, not to reimplement search here (the Planner still never touches
// a Move, per spec).
type SlotEntry = { stats: EdgeSlotStats; pattern: ReturnType<typeof detectEdgeSlotPattern> };

function toGoals(ordered: SlotEntry[]): MacroGoal[] {
  return ordered.map((entry, i) => ({
    type: entry.pattern === "flipped-pair" ? "FIX_FLIP" : "PAIR_EDGE",
    targetEdge: slotIndex(entry.stats.slot),
    priority: ordered.length - i,
  }));
}

function buildCandidateStrategies(unfinished: SlotEntry[], scoreOf: (e: SlotEntry) => number): { description: string; goals: MacroGoal[] }[] {
  const byScoreDesc = [...unfinished].sort((a, b) => scoreOf(b) - scoreOf(a));
  const byPairedCountDesc = [...unfinished].sort((a, b) => b.stats.pairedCount - a.stats.pairedCount);
  const flipFirst = [...unfinished].sort((a, b) => {
    const aFlip = a.pattern === "flipped-pair" ? 0 : 1;
    const bFlip = b.pattern === "flipped-pair" ? 0 : 1;
    return aFlip - bFlip || scoreOf(b) - scoreOf(a);
  });
  const hardestFirst = [...unfinished].sort((a, b) => {
    const aHard = a.pattern === "unpaired" ? 0 : 1;
    const bHard = b.pattern === "unpaired" ? 0 : 1;
    return aHard - bHard || scoreOf(b) - scoreOf(a);
  });
  const reversed = [...byScoreDesc].reverse();

  return [
    { description: "점수 우선 (기존 방식)", goals: toGoals(byScoreDesc) },
    { description: "완성 임박 우선 (이미 짝지어진 것 유지)", goals: toGoals(byPairedCountDesc) },
    { description: "Flip 우선 (가장 싼 것부터)", goals: toGoals(flipFirst) },
    { description: "어려운 것부터 (예산이 남아있을 때 처리)", goals: toGoals(hardestFirst) },
    { description: "역순 (대조군)", goals: toGoals(reversed) },
  ];
}

// --- Simulation layer --------------------------------------------------------
// Previews a strategy WITHOUT touching the real cube: clones it, applies
// only the first SIMULATION_LOOKAHEAD goals' worth of tasks (via Executor's
// own public executeTask -- a black box to this file, per spec), and scores
// whatever state that leaves. Deliberately shallow (not simulating the whole
// strategy to completion) -- the point is comparing candidates' near-term
// trajectories cheaply within a hard shared budget, not fully solving here.
// Spec recommends "MacroGoal 2~3개까지만" -- kept at the low end of that
// range specifically so all 5 candidates have a realistic chance to
// actually finish their simulation within the shared budget (measured
// directly: at lookahead=3, only 3 of 5 strategies fit; the per-goal cost
// this library's own tryFixWing/etc. can genuinely take dominates over
// exactly how deep the lookahead goes).
const SIMULATION_LOOKAHEAD = 2;

// `simDeadline` is this ONE candidate's FAIR SHARE of the overall
// planning+simulation budget -- planEdgeTasks divides whatever's left of
// planDeadline evenly across however many candidates remain, so all 5+
// strategies' simulations collectively fit that shared window instead of
// each independently claiming as much time as it wants (measured during
// testing: that let the very first candidate alone consume the entire
// simulation phase, so only 1 of 5 strategies ever got compared). Each goal
// WITHIN a single strategy's simulation further divides ITS share by
// lookahead count, so a slow first goal can't by itself starve goals 2-3 of
// this SAME strategy.
function simulateStrategy(
  cubies: Cubie[],
  goals: MacroGoal[],
  libs: ExecutorLibraries,
  weights: EvaluatorWeights,
  simDeadline: number
): { score: number; remainingWork: number } {
  const clone = cloneCubies(cubies);
  const lookahead = goals.slice(0, SIMULATION_LOOKAHEAD);
  for (let i = 0; i < lookahead.length; i++) {
    if (Date.now() > simDeadline) break;
    if (wrongWingCount5(clone) === 0) break;
    const remainingGoals = lookahead.length - i;
    const perGoalDeadline = Math.min(simDeadline, Date.now() + Math.floor((simDeadline - Date.now()) / remainingGoals));
    executeTask(clone, macroGoalToTask(lookahead[i]), libs, perGoalDeadline);
  }
  return { score: scoreWholeState(clone, weights), remainingWork: wrongWingCount5(clone) };
}

export interface PlanResult {
  tasks: SolveTask[];
  trace: TraceEntry[];
}

function log(trace: TraceEntry[], label: string, detail?: string): void {
  trace.push({ at: Date.now(), label, detail });
}

/**
 * Analyzes the cube, generates several candidate Strategies, evaluates each
 * via the simulation layer above, commits to the best-scoring one, and
 * expands its full MacroGoal sequence into SolveTasks -- the Executor's
 * actual input, unchanged in shape from the pre-upgrade Planner. Every
 * strategy considered (and why the winner won) is recorded in the returned
 * trace so SolverEngine can fold it into its own Debug Trace.
 */
export function planEdgeTasks(
  cubies: Cubie[],
  libs: ExecutorLibraries,
  weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS,
  planDeadline: number = Date.now() + 100,
  // The one true emergency brake for a genuinely pathological cube -- see
  // the strategy-evaluation loop's own comment on why every candidate is
  // always simulated (never skipped) up to at least a near-zero share of
  // planDeadline, with this as the absolute ceiling only.
  hardDeadline: number = planDeadline + 700
): PlanResult {
  const trace: TraceEntry[] = [];
  const allStats = analyzeEdgeSlots(cubies);
  const unfinished: SlotEntry[] = allStats.filter((s) => s.pairedCount < 2).map((stats) => ({ stats, pattern: detectEdgeSlotPattern(stats) }));

  // Same per-slot Evaluator score the old (pre-upgrade) Planner sorted by,
  // reused here only as one of several ORDERING signals feeding the
  // candidate strategies below -- not the sole decision anymore (see
  // buildCandidateStrategies: some candidates deliberately sort by a
  // DIFFERENT signal, like pairedCount or pattern, instead of this score).
  const scoreOf = (e: SlotEntry) => scoreMetrics(computeSlotMetrics(cubies, e.stats, allStats), weights);

  const stillNeedsParity = wrongWingCount5(cubies) > 0;
  const candidateDescriptors = buildCandidateStrategies(unfinished, scoreOf);
  log(trace, "generate-strategies", `${candidateDescriptors.length}개 전략 생성`);

  const candidates: SolveStrategy[] = candidateDescriptors.map(({ description, goals }) => {
    const fullGoals = stillNeedsParity
      ? [...goals, { type: "LAST_TWO" as MacroGoalType, targetEdge: -1, priority: 0 }, { type: "ENDGAME" as MacroGoalType, targetEdge: -1, priority: -1 }]
      : goals;
    return { id: nextStrategyId++, description, expectedScore: 0, estimatedRemainingWork: wrongWingCount5(cubies), goals: fullGoals };
  });

  // Every candidate is ALWAYS evaluated (a fixed, deterministic count) --
  // an earlier version skipped remaining candidates once wall-clock time ran
  // out, which measurably broke the spec's own "동일한 Cube는 항상 동일한
  // Strategy를 선택한다" requirement: identical input, called twice in a
  // row, chose DIFFERENT strategies purely because system timing jitter
  // caused a different number of candidates to get simulated before the
  // clock-based cutoff fired. Each candidate still gets a fair, roughly-
  // equal SLICE of whatever's left of planDeadline for its OWN internal
  // search depth (so one slow candidate can't starve the rest of their fair
  // share), but never skips a candidate outright -- in the worst case a
  // candidate simulates with near-zero time left and its score just
  // reflects "no progress," which is itself a legitimate, honest signal to
  // compare against the others, not a missing data point. hardDeadline (the
  // full 1-second plan budget, not the softer planDeadline) is the one true
  // emergency brake, so a genuinely pathological cube still can't hang.
  let best: SolveStrategy | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const strategy = candidates[i];
    const remainingCandidates = candidates.length - i;
    const shareMs = Math.max(0, Math.floor((planDeadline - Date.now()) / remainingCandidates));
    const perStrategyDeadline = Math.min(hardDeadline, Date.now() + shareMs);
    const { score, remainingWork } = simulateStrategy(cubies, strategy.goals, libs, weights, perStrategyDeadline);
    strategy.expectedScore = score;
    strategy.estimatedRemainingWork = remainingWork;
    log(trace, `strategy-${strategy.id}-score`, `"${strategy.description}": score=${score.toFixed(1)}, 예상 잔여=${remainingWork}`);
    // Strict ">" (not ">=") so ties deterministically keep the EARLIER
    // (lower-id) candidate rather than whichever happens to be compared
    // last -- also required for the same "same cube, same choice" reason.
    if (!best || score > best.expectedScore) best = strategy;
  }
  if (!best) best = candidates[0];

  log(
    trace,
    "strategy-chosen",
    `"${best.description}" 선택 (score=${best.expectedScore.toFixed(1)}, 예상 잔여=${best.estimatedRemainingWork}) -- 나머지보다 시뮬레이션 점수가 높음`
  );

  const tasks = best.goals.map((goal) => macroGoalToTask(goal));
  log(trace, "goals-to-tasks", `${best.goals.length}개 MacroGoal -> ${tasks.length}개 Task 전개`);

  return { tasks, trace };
}
