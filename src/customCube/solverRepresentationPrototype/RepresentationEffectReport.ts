// --- RepresentationEffectReport (Solver Representation Prototype Sprint
// v1) -----------------------------------------------------------------
// STEP5: summarizes each condition's real Coverage/Hard Gap/Primitive
// usage, compares Coarse Shape / Exact Shape / Rescue-Structural Hybrid
// against the fixed-order ("기존 Solver" approximation) baseline, checks
// for Regression, and applies this Sprint's own Level 1~3 success criteria
// to reach a final A/B/C decision.
import type { RunResult } from "./RepresentationCoverageRunner";
import { ALLOWED_PRIMITIVES, type AllowedPrimitive } from "./RepresentationPrimitiveSelector";

export interface ConditionSummary {
  condition: string;
  totalReplays: number;
  improvedCount: number;
  coverage: number; // improvedCount / totalReplays -- this project's own established Coverage definition (ANY net improvement), not "fully solved"
  solvedCount: number; // secondary disclosed stat: reached wrongWingCount===0 within MAX_ROUNDS
  fullySolvedRate: number;
  hardGapCount: number;
  hardGapRate: number;
  avgRoundsUsed: number;
  primitiveUsage: Record<AllowedPrimitive, { attempts: number; successes: number; successRate: number }>;
}

export function summarizeCondition(condition: string, results: readonly RunResult[]): ConditionSummary {
  const totalReplays = results.length;
  const improvedCount = results.filter((r) => r.improved).length;
  const solvedCount = results.filter((r) => r.solved).length;
  const hardGapCount = results.filter((r) => r.hardGapRound1).length;
  const avgRoundsUsed = totalReplays ? results.reduce((a, r) => a + r.roundsUsed, 0) / totalReplays : 0;

  const primitiveUsage = {} as ConditionSummary["primitiveUsage"];
  for (const p of ALLOWED_PRIMITIVES) {
    const attempts = results.reduce((a, r) => a + r.attempts[p].attempts, 0);
    const successes = results.reduce((a, r) => a + r.attempts[p].successes, 0);
    primitiveUsage[p] = { attempts, successes, successRate: attempts ? successes / attempts : 0 };
  }

  return {
    condition,
    totalReplays,
    improvedCount,
    coverage: totalReplays ? improvedCount / totalReplays : 0,
    solvedCount,
    fullySolvedRate: totalReplays ? solvedCount / totalReplays : 0,
    hardGapCount,
    hardGapRate: totalReplays ? hardGapCount / totalReplays : 0,
    avgRoundsUsed,
    primitiveUsage,
  };
}

export interface RegressionCheck {
  regressionCount: number;
  regressedHashes: string[];
}

// A replay regresses if it was improved under the baseline but is no
// longer improved, OR ends up with a strictly worse (higher) wrongWingAfter
// than baseline -- matches this project's own established regression
// definition (solverV2PrototypeBP3/ReplayBenchmark.ts:
// "pairAfter < pairBefore || wrongWingAfter > wrongWingBefore"), adapted to
// a baseline-relative (not self-relative) comparison since this Sprint
// compares STRATEGIES, not before/after a single resolver call.
export function checkRegression(baseline: readonly RunResult[], candidate: readonly RunResult[]): RegressionCheck {
  const baseByHash = new Map(baseline.map((r) => [r.hash, r]));
  const regressedHashes: string[] = [];
  for (const c of candidate) {
    const b = baseByHash.get(c.hash);
    if (!b) continue;
    if ((b.improved && !c.improved) || c.wrongWingAfter > b.wrongWingAfter) regressedHashes.push(c.hash);
  }
  return { regressionCount: regressedHashes.length, regressedHashes };
}

export interface ComparisonResult {
  condition: string;
  summary: ConditionSummary;
  coveragePercentagePointDelta: number; // vs baseline, in percentage points
  hardGapRelativeReductionPercent: number; // vs baseline, positive = improvement
  regression: RegressionCheck;
  level1Pass: boolean;
  level2Pass: boolean;
}

// 작업지시서 section 7 그대로: Coverage +3%p 이상 OR Hard Gap -5% 이상
// (Hard Gap은 "%"로만 표기돼 있어 상대 감소율로 해석 -- Coverage는
// "%p"로 명시돼 있어 백분율포인트 절대차로 해석).
const LEVEL1_COVERAGE_PP_THRESHOLD = 3;
const LEVEL1_HARDGAP_RELATIVE_PERCENT_THRESHOLD = 5;

export function compareToBaseline(condition: string, baselineSummary: ConditionSummary, baselineResults: readonly RunResult[], candidateSummary: ConditionSummary, candidateResults: readonly RunResult[]): ComparisonResult {
  const coveragePercentagePointDelta = (candidateSummary.coverage - baselineSummary.coverage) * 100;
  const hardGapRelativeReductionPercent = baselineSummary.hardGapRate > 0 ? ((baselineSummary.hardGapRate - candidateSummary.hardGapRate) / baselineSummary.hardGapRate) * 100 : 0;
  const regression = checkRegression(baselineResults, candidateResults);
  const level1Pass = coveragePercentagePointDelta >= LEVEL1_COVERAGE_PP_THRESHOLD || hardGapRelativeReductionPercent >= LEVEL1_HARDGAP_RELATIVE_PERCENT_THRESHOLD;
  const level2Pass = regression.regressionCount === 0;
  return { condition, summary: candidateSummary, coveragePercentagePointDelta, hardGapRelativeReductionPercent, regression, level1Pass, level2Pass };
}

export type FinalDecision = "A" | "B" | "C";

export interface OutcomeDecision {
  decision: FinalDecision;
  best: ComparisonResult | null;
  rationale: string;
}

export function decideOutcome(comparisons: readonly ComparisonResult[]): OutcomeDecision {
  const passing = comparisons.filter((c) => c.level1Pass && c.level2Pass);
  if (passing.length > 0) {
    const best = passing.reduce((a, b) => (b.coveragePercentagePointDelta > a.coveragePercentagePointDelta ? b : a));
    return {
      decision: "A",
      best,
      rationale: `"${best.condition}"가 Coverage +${best.coveragePercentagePointDelta.toFixed(1)}%p / Hard Gap 상대감소 ${best.hardGapRelativeReductionPercent.toFixed(1)}% 중 하나 이상을 충족하고 Regression 0건 -- Representation만으로 실질적 개선이 확인됐다.`,
    };
  }

  const anyRegression = comparisons.some((c) => c.regression.regressionCount > 0);
  if (anyRegression) {
    const worst = comparisons.reduce((a, b) => (b.regression.regressionCount > a.regression.regressionCount ? b : a));
    return {
      decision: "C",
      best: null,
      rationale: `"${worst.condition}"에서 Regression ${worst.regression.regressionCount}건 발생 -- Representation 기반 재오케스트레이션이 오히려 일부 상태를 악화시켰다. Representation만으로는 한계.`,
    };
  }

  const anyPositive = comparisons.some((c) => c.coveragePercentagePointDelta > 0 || c.hardGapRelativeReductionPercent > 0);
  if (anyPositive) {
    const best = [...comparisons].sort((a, b) => b.coveragePercentagePointDelta - a.coveragePercentagePointDelta)[0];
    return {
      decision: "B",
      best,
      rationale: `가장 나은 "${best.condition}"도 Coverage +${best.coveragePercentagePointDelta.toFixed(1)}%p / Hard Gap 상대감소 ${best.hardGapRelativeReductionPercent.toFixed(1)}%로, Level 1 기준(Coverage +3%p 또는 Hard Gap 상대감소 -5%)에 못 미친다 -- 효과는 있으나 미미하다.`,
    };
  }

  return {
    decision: "C",
    best: null,
    rationale: "어떤 Representation 조건도 기존 Solver(고정 순서) 대비 Coverage/Hard Gap 개선을 보이지 못했다 -- Representation만으로는 한계.",
  };
}
