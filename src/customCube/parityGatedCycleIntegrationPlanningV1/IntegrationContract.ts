// --- IntegrationContract (Parity-Gated Cycle Production Integration
// Planning Sprint v1, Level1-5 + Decision + Contract) -----------------------
// Directive's own explicit Level1-5 criteria, applied mechanically to the
// real measured numbers from STEP1-6 -- no manual correction.
//   Level1: Integration Position 확정 (a single best insertion position is
//     identifiable from STEP2's own measured rescueRate/winRate table).
//   Level2: Gate 확정 (a single best Gate is identifiable from STEP3's own
//     Coverage/Runtime/Precision table).
//   Level3: Budget 확정 (a Budget size is identifiable that keeps
//     deadlineMissCount acceptable while preserving rescue -- or, if no
//     tested budget in the Directive's own 40-200ms range achieves ANY
//     rescue, that finding itself is the Level3 answer: no budget in that
//     range works).
//   Level4: 기존 Primitive와 경쟁 문제 없음 (STEP5's own Starvation/
//     Duplicate numbers are clean: no existing type gets starved, no
//     duplicate offering).
//   Level5: Production Integration Contract 작성 (always achievable --
//     the Contract records whatever STEP1-6 actually found, even a
//     negative result).
import type { PositionSummary } from "./InsertionPointAnalysis";
import type { GateSummary } from "./GateAnalysis";
import type { BudgetResult } from "./BudgetSweep";
import type { CompetitionTypeStats } from "./CompetitionAnalysis";
import type { PairedComparison, FrameworkValidation } from "./StatisticalValidation";

export interface LevelVerdict {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  pass: boolean;
  detail: string;
}

export interface IntegrationContractResult {
  levels: LevelVerdict[];
  decision: "A" | "B" | "C";
  rationale: string;
  contract: {
    position: string;
    gate: string;
    budgetMs: number | null;
    priority: string;
    fallback: string;
  };
}

export function decideIntegrationContract(
  positionSummaries: readonly PositionSummary[],
  gateSummaries: readonly GateSummary[],
  budgetResults: readonly BudgetResult[],
  competitionStats: readonly CompetitionTypeStats[],
  comparison: PairedComparison,
  framework: FrameworkValidation
): IntegrationContractResult {
  const bestPosition = [...positionSummaries].sort((a, b) => b.rescueRate - a.rescueRate)[0];
  const level1Pass = bestPosition.rescueRate > 0;
  const level1: LevelVerdict = {
    level: 1,
    label: "Integration Position 확정",
    pass: level1Pass,
    detail: `최고 rescueRate 위치="${bestPosition.position}" (rescueRate=${(bestPosition.rescueRate * 100).toFixed(1)}%, avgWallMs=${bestPosition.avgWallMs.toFixed(0)})`,
  };

  const bestGate = [...gateSummaries].sort((a, b) => b.improvedCount - a.improvedCount || a.avgRuntimeMsAmongMatched - b.avgRuntimeMsAmongMatched)[0];
  const level2Pass = bestGate.improvedCount > 0;
  const level2: LevelVerdict = {
    level: 2,
    label: "Gate 확정",
    pass: level2Pass,
    detail: `최고 improvedCount Gate="${bestGate.gate}" (coverage=${(bestGate.coverage * 100).toFixed(1)}%, improvedCount=${bestGate.improvedCount}, avgRuntimeMs=${bestGate.avgRuntimeMsAmongMatched.toFixed(0)})`,
  };

  const anyBudgetRescues = budgetResults.some((b) => b.summary.improvedCount > 0);
  const bestBudget = [...budgetResults].sort((a, b) => b.summary.improvedCount - a.summary.improvedCount)[0];
  const level3: LevelVerdict = {
    level: 3,
    label: "Budget 확정",
    pass: anyBudgetRescues,
    detail: anyBudgetRescues
      ? `최고 improvedCount budget=${bestBudget.budgetMs}ms (improvedCount=${bestBudget.summary.improvedCount}, deadlineMissCount=${bestBudget.deadlineMissCount}/${bestBudget.summary.n})`
      : `Directive 테스트 범위(40/80/120/160/200ms) 내 어떤 budget도 rescue=0 -- Prototype 평균 Runtime(1271ms, Prototype Sprint v1 실측치)이 이 범위를 크게 초과하기 때문. Level3 FAIL은 "Budget 미확정"이 아니라 "이 범위 내에는 없다"는 실측 결론.`,
  };

  const noStarvation = competitionStats.every((c) => !c.starved);
  const noDuplicate = competitionStats.every((c) => c.duplicateCount === 0);
  const level4Pass = noStarvation && noDuplicate;
  const level4: LevelVerdict = {
    level: 4,
    label: "기존 Primitive와 경쟁 문제 없음",
    pass: level4Pass,
    detail: `starvedTypes=${competitionStats.filter((c) => c.starved).map((c) => c.type).join(",") || "없음"}, duplicateCount 합계=${competitionStats.reduce((s, c) => s + c.duplicateCount, 0)}`,
  };

  const level5: LevelVerdict = {
    level: 5,
    label: "Production Integration Contract 작성",
    pass: true,
    detail: `아래 contract 필드에 STEP1-6 실측 결과를 그대로 기록. STEP6 Validation Framework 자체 판정: pipeline decision=${framework.pipelineResult.decision} (n=${comparison.n}, improvedCount diff mean=${comparison.improvedCountDiffEvaluation.stats.mean.toFixed(3)}, 95% CI=[${comparison.improvedCountDiffEvaluation.stats.ciLower.toFixed(3)}, ${comparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(3)}]) -- 이 Sprint 고유의 Level1-5와는 별개 기준.`,
  };

  const levels = [level1, level2, level3, level4, level5];

  let decision: "A" | "B" | "C";
  let rationale: string;
  if (!level1Pass) {
    decision = "C";
    rationale = "Level1 FAIL: 어떤 삽입 위치에서도 실제 rescue가 발생하지 않음 -- Prototype은 성공했지만 Production Recovery Pipeline 구조 안에서는 통합 불가. Architecture Revision 필요.";
  } else if (level1Pass && level2Pass && level3.pass && level4Pass) {
    decision = "A";
    rationale = "Level1-5 전부 PASS -- Integration Contract 확정, 다음 Sprint는 Production Integration Sprint.";
  } else {
    decision = "B";
    const reasons: string[] = [];
    if (!level2Pass) reasons.push("Gate 미확정");
    if (!level3.pass) reasons.push("Directive 범위 내 Budget 미확정(더 큰 Budget 필요)");
    if (!level4Pass) reasons.push("기존 Primitive와 경쟁 문제 있음");
    decision = "B";
    rationale = `위치는 확정되었으나 (${reasons.join(", ")}) -- Integration Planning Refinement 필요.`;
  }

  return {
    levels,
    decision,
    rationale,
    contract: {
      position: bestPosition.position,
      gate: bestGate.gate,
      budgetMs: anyBudgetRescues ? bestBudget.budgetMs : null,
      priority: "argmax(score) -- chooseBestRecovery()와 동일한 futurePotential-moveCost 공식, 기존 5개 타입과 동일 기준으로 경쟁",
      fallback: "Gate 불일치 또는 Budget 내 미해결 시 후속 후보(SETUP 등)로 폴백 -- 기존 스케줄러의 인수 순서를 그대로 따름",
    },
  };
}
