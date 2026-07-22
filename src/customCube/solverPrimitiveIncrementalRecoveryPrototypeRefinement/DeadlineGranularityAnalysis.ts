// --- DeadlineGranularityAnalysis (Incremental Recovery Prototype
// Refinement Sprint v1) --------------------------------------------------
// STEP2. Characterizes WHERE the real time goes inside a single
// Incremental Recovery attempt, using InstrumentedSearch.ts's timing
// capture, run with a GENEROUS deadline (so the search runs close to its
// natural, uninterrupted length rather than being cut short) to see its
// own real cost profile. Classifies whether Budget overrun is a "design"
// problem (many hops/leaves inherently needed) or a "granularity" problem
// (a single enumerateWingCandidates() call itself routinely exceeds the
// nominal 40ms budget on its own, regardless of how many hops are
// attempted).
import type { Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { runInstrumentedDfs } from "./InstrumentedSearch";

const GENEROUS_DEADLINE_MS = 2000; // far above the 40ms nominal cap -- lets the search reach its own natural termination (MAX_LEAVES_EXPLORED or node-list exhaustion) so its UNCONSTRAINED cost profile can be measured

export interface GranularitySample {
  hopCandidateGenMs: number[];
  leafEvalMs: number[];
  totalWallMs: number;
  leavesExplored: number;
  hopsAttempted: number;
}

export function sampleGranularity(records: readonly { cubies: Cubie[]; nodes: string[] }[], lib: WingLibrary): GranularitySample[] {
  return records.map((r) => {
    const result = runInstrumentedDfs(r.cubies, r.nodes, lib, Date.now() + GENEROUS_DEADLINE_MS);
    return {
      hopCandidateGenMs: result.hopCandidateGenMs,
      leafEvalMs: result.leafEvalMs,
      totalWallMs: result.totalWallMs,
      leavesExplored: result.leavesExplored,
      hopsAttempted: result.hopsAttempted,
    };
  });
}

export interface GranularitySummary {
  n: number;
  avgTimeBetweenDeadlineChecks: number; // = avg single enumerateWingCandidates() call time -- the only unchecked chunk of work between two Date.now() checks
  maxSingleHopGenMs: number; // the single largest enumerateWingCandidates() call observed
  avgLeafEvalMs: number;
  avgTotalWallMs: number;
  avgHopsAttempted: number;
  avgLeavesExplored: number;
  avgWallPerHop: number; // totalWallMs / hopsAttempted -- "branch당 시간"
  designVsGranularity: "design" | "granularity" | "both" | "neither";
  explanation: string;
}

export function summarizeGranularity(samples: readonly GranularitySample[], nominalBudgetMs: number): GranularitySummary {
  const n = samples.length;
  const allHopGens = samples.flatMap((s) => s.hopCandidateGenMs);
  const allLeafEvals = samples.flatMap((s) => s.leafEvalMs);
  const avgTimeBetweenDeadlineChecks = allHopGens.length ? allHopGens.reduce((a, b) => a + b, 0) / allHopGens.length : 0;
  const maxSingleHopGenMs = allHopGens.length ? Math.max(...allHopGens) : 0;
  const avgLeafEvalMs = allLeafEvals.length ? allLeafEvals.reduce((a, b) => a + b, 0) / allLeafEvals.length : 0;
  const avgTotalWallMs = n ? samples.reduce((a, s) => a + s.totalWallMs, 0) / n : 0;
  const avgHopsAttempted = n ? samples.reduce((a, s) => a + s.hopsAttempted, 0) / n : 0;
  const avgLeavesExplored = n ? samples.reduce((a, s) => a + s.leavesExplored, 0) / n : 0;
  const avgWallPerHop = avgHopsAttempted > 0 ? avgTotalWallMs / avgHopsAttempted : 0;

  // "granularity" problem: a SINGLE enumerateWingCandidates() call alone
  // already exceeds the nominal budget -- no number of extra deadline
  // checks between hops could have prevented the overrun, since the
  // overrun happens WITHIN one already-started call.
  // "design" problem: no single call exceeds the budget, but attempting
  // the FULL node list requires many sequential hops whose SUM exceeds the
  // budget -- more frequent checks (smaller PER_HOP_DEADLINE_MS) or a
  // shorter node list would have kept the total within budget.
  const singleCallExceedsBudget = maxSingleHopGenMs > nominalBudgetMs;
  const sumOfHopsExceedsBudget = avgWallPerHop * avgHopsAttempted > nominalBudgetMs;

  let designVsGranularity: GranularitySummary["designVsGranularity"];
  let explanation: string;
  if (singleCallExceedsBudget && sumOfHopsExceedsBudget) {
    designVsGranularity = "both";
    explanation = `단일 enumerateWingCandidates() 호출(최대 ${maxSingleHopGenMs.toFixed(1)}ms)만으로도 명목 예산(${nominalBudgetMs}ms)을 넘기고(granularity 문제), 여러 hop을 거치는 전체 순회 자체도 누적으로 예산을 넘긴다(design 문제, 평균 hop당 ${avgWallPerHop.toFixed(1)}ms x 평균 ${avgHopsAttempted.toFixed(1)}hop) -- 두 원인이 함께 작용한다.`;
  } else if (singleCallExceedsBudget) {
    designVsGranularity = "granularity";
    explanation = `단일 enumerateWingCandidates() 호출만으로도 최대 ${maxSingleHopGenMs.toFixed(1)}ms가 걸려 명목 예산(${nominalBudgetMs}ms)을 넘긴다 -- deadline 체크 자체가 hop 사이에서만 이루어지는 granularity 문제이며, 체크를 아무리 자주 해도(더 짧은 PER_HOP_DEADLINE_MS를 줘도) 이 단일 호출 내부의 시간은 막을 수 없다.`;
  } else if (sumOfHopsExceedsBudget) {
    designVsGranularity = "design";
    explanation = `개별 enumerateWingCandidates() 호출 자체는 예산 안에 들어오지만(최대 ${maxSingleHopGenMs.toFixed(1)}ms < ${nominalBudgetMs}ms), 순회해야 할 hop 수(평균 ${avgHopsAttempted.toFixed(1)}개) x hop당 시간(${avgWallPerHop.toFixed(1)}ms)의 누적이 예산을 넘긴다 -- 이는 deadline 체크 빈도의 문제가 아니라, 순회할 node 수 자체를 줄여야 하는 design 문제다(budgetAwareTraversal이 다루는 대상).`;
  } else {
    designVsGranularity = "neither";
    explanation = "개별 호출과 전체 순회 모두 명목 예산 안에서 자연스럽게 끝났다 -- 이 표본에서는 Budget Overrun이 관찰되지 않았다.";
  }

  return {
    n,
    avgTimeBetweenDeadlineChecks,
    maxSingleHopGenMs,
    avgLeafEvalMs,
    avgTotalWallMs,
    avgHopsAttempted,
    avgLeavesExplored,
    avgWallPerHop,
    designVsGranularity,
    explanation,
  };
}
