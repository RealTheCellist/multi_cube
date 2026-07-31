// --- PrototypeSelection (Parity-Gated Cycle Comparative Prototype
// Sprint v1, STEP6) -----------------------------------------------------------
// Combines STEP1-5's own real outputs into the Directive's Decision A/B/C.
// Judgment is based on 95% CI / statistical significance (per the
// Directive's own "원시 성공 건수가 아니라 95% 신뢰구간과 효과크기를
// 기준으로 우열을 판단한다"), never raw counts alone.
import type { StatisticalValidationResult } from "./StatisticalValidation";
import type { BenchmarkSummary } from "./CapabilityBenchmark";
import type { ArchitectureImpactSummary } from "./ArchitectureImpact";
import type { SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";

export type FinalDecision = "A_PRODUCTION_INTEGRATION_PLANNING" | "B_HYBRID_PRIMITIVE_BLUEPRINT" | "C_RESEARCH_CLOSEOUT";
export type Winner = "DUAL_WING_BRIDGE" | "MULTI_COMPONENT_MERGE" | "NONE";

function significantlyPositive(s: SampleStats): boolean {
  return s.ciLower > 0;
}
function significantlyNegative(s: SampleStats): boolean {
  return s.ciUpper < 0;
}

export interface PrototypeSelectionResult {
  dualSignificantlyBeatsBaseline: boolean;
  multiSignificantlyBeatsBaseline: boolean;
  dualVsMultiDistinguishable: boolean;
  winner: Winner;
  finalDecision: FinalDecision;
  finalDecisionRationale: string;
  level1BothImplemented: boolean;
  level2StatisticallyCompared: boolean;
  level3SingleTargetConfirmed: boolean;
}

export function selectPrototype(stats: StatisticalValidationResult, benchmark: BenchmarkSummary, impact: readonly ArchitectureImpactSummary[]): PrototypeSelectionResult {
  const dualSignificantlyBeatsBaseline = significantlyPositive(stats.dualVsBaseline.improvedDiffStats);
  const multiSignificantlyBeatsBaseline = significantlyPositive(stats.multiVsBaseline.improvedDiffStats);

  const dualVsMultiStats = stats.dualVsMulti.improvedDiffStats;
  const dualVsMultiDistinguishable = significantlyPositive(dualVsMultiStats) || significantlyNegative(dualVsMultiStats);

  let winner: Winner = "NONE";
  let finalDecision: FinalDecision;
  let finalDecisionRationale: string;

  if (!dualSignificantlyBeatsBaseline && !multiSignificantlyBeatsBaseline) {
    finalDecision = "C_RESEARCH_CLOSEOUT";
    finalDecisionRationale =
      `두 Prototype 모두 Baseline 대비 improvedCount paired-diff 95% CI가 0을 포함(Dual: [${stats.dualVsBaseline.improvedDiffStats.ciLower.toFixed(4)}, ${stats.dualVsBaseline.improvedDiffStats.ciUpper.toFixed(4)}], ` +
      `Multi: [${stats.multiVsBaseline.improvedDiffStats.ciLower.toFixed(4)}, ${stats.multiVsBaseline.improvedDiffStats.ciUpper.toFixed(4)}]) -- 통계적으로 유의미한 개선이 없다. ` +
      "Parity-Gated Cycle Primitive 연구를 이 지점에서 종료할 것을 제안한다.";
  } else if (dualVsMultiDistinguishable) {
    winner = significantlyPositive(dualVsMultiStats) ? "DUAL_WING_BRIDGE" : "MULTI_COMPONENT_MERGE";
    finalDecision = "A_PRODUCTION_INTEGRATION_PLANNING";
    const winnerRegressionCount = winner === "DUAL_WING_BRIDGE" ? benchmark.dualRegressionCount : benchmark.multiRegressionCount;
    const regressionNote = winnerRegressionCount > 0 ? ` 단, ${winner === "DUAL_WING_BRIDGE" ? "Dual Wing Bridge" : "Multi-Component Merge"}는 실측 regressionCount=${winnerRegressionCount}(Baseline은 정의상 0)로, Production Integration Planning 단계에서 이 회귀 케이스들을 반드시 재검토해야 한다.` : " regressionCount=0으로 안전성 우려는 없다.";
    finalDecisionRationale =
      `Dual vs Multi improvedCount paired-diff 95% CI=[${dualVsMultiStats.ciLower.toFixed(4)}, ${dualVsMultiStats.ciUpper.toFixed(4)}]가 0을 포함하지 않아 ` +
      `${winner === "DUAL_WING_BRIDGE" ? "Dual Wing Bridge" : "Multi-Component Merge"}가 통계적으로 우위 -- Production Integration Planning Sprint v1로 진행을 제안한다.${regressionNote}`;
  } else {
    finalDecision = "B_HYBRID_PRIMITIVE_BLUEPRINT";
    finalDecisionRationale =
      `Dual/Multi 둘 다 Baseline 대비 유의미한 개선을 보이지만(또는 최소 하나가), Dual vs Multi 직접 비교의 ` +
      `95% CI=[${dualVsMultiStats.ciLower.toFixed(4)}, ${dualVsMultiStats.ciUpper.toFixed(4)}]가 0을 포함해 두 Prototype이 통계적으로 구분되지 않는다 -- ` +
      "Hybrid Primitive Blueprint Sprint v1(두 메커니즘을 결합하는 설계)로 진행을 제안한다.";
  }

  return {
    dualSignificantlyBeatsBaseline,
    multiSignificantlyBeatsBaseline,
    dualVsMultiDistinguishable,
    winner,
    finalDecision,
    finalDecisionRationale,
    level1BothImplemented: impact.length === 2,
    level2StatisticallyCompared: true,
    level3SingleTargetConfirmed: finalDecision === "A_PRODUCTION_INTEGRATION_PLANNING",
  };
}
