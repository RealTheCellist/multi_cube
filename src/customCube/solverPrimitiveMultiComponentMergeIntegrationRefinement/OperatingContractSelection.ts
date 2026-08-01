// --- OperatingContractSelection (Multi-Component Merge Production
// Integration Refinement Sprint v1, STEP6) -------------------------------------
// Combines STEP1-5's real outputs into a Pareto Frontier over the
// Directive's own 4 named candidates, and resolves Decision A/B/C.
//
// Mechanism-equivalence disclosure: "MCM -> CCR" (candidate 2), "Dedicated
// Budget"(candidate 3) and "Conditional Scheduler"(candidate 4) all reduce
// to the SAME real mechanism in this codebase -- genMultiComponentMerge()
// already Gate-checks componentCount>=3 and no-ops instantly for every
// other case, so reordering it unconditionally (BEFORE_CCR) has byte-
// identical real effect to only reordering when the Gate would match
// (Conditional), and there is no OTHER real "Dedicated Slice" lever
// available without touching CCR's own already-shipped Budget Contract
// (out of this Sprint's scope, disclosed in the Sprint's own docs). All 3
// are therefore evaluated as ONE real candidate (BEFORE_CCR) and reported
// under all 3 names for direct traceability to the Directive's own STEP6
// list.
import type { PairwiseComparison } from "./StatisticalValidation";
import type { BudgetAuditSummary } from "./BudgetAudit";
import type { InteractionAuditSummary } from "./PrimitiveInteractionAudit";
import type { FrameworkValidationResult } from "./ValidationFramework";

export type ContractCandidateId = "CURRENT_CCR_THEN_MCM" | "MCM_THEN_CCR" | "DEDICATED_BUDGET" | "CONDITIONAL_SCHEDULER";

export interface ContractCandidateScore {
  id: ContractCandidateId;
  realMechanism: "AFTER_CCR" | "BEFORE_CCR";
  capabilityScore: number; // newCapabilityCount vs Baseline(no MCM)
  avgActualBudgetAvailableMs: number;
  avgRuntimeMs: number;
  regressionCount: number;
  complexityScore: number; // 0=no change, 1=one parameter/reorder, 2=new mechanism
}

export function buildCandidateScores(
  budgetAfter: BudgetAuditSummary,
  budgetBefore: BudgetAuditSummary,
  afterCcrVsBaseline: PairwiseComparison,
  beforeCcrVsBaseline: PairwiseComparison,
  afterCcrRegressionCount: number,
  beforeCcrRegressionCount: number,
  afterCcrAvgRuntimeMs: number,
  beforeCcrAvgRuntimeMs: number
): ContractCandidateScore[] {
  const current: ContractCandidateScore = {
    id: "CURRENT_CCR_THEN_MCM",
    realMechanism: "AFTER_CCR",
    capabilityScore: afterCcrVsBaseline.improvedCountDiff.stats.mean * afterCcrVsBaseline.n,
    avgActualBudgetAvailableMs: budgetAfter.avgActualBudgetAvailableMs,
    avgRuntimeMs: afterCcrAvgRuntimeMs,
    regressionCount: afterCcrRegressionCount,
    complexityScore: 0,
  };
  const reordered = {
    realMechanism: "BEFORE_CCR" as const,
    capabilityScore: beforeCcrVsBaseline.improvedCountDiff.stats.mean * beforeCcrVsBaseline.n,
    avgActualBudgetAvailableMs: budgetBefore.avgActualBudgetAvailableMs,
    avgRuntimeMs: beforeCcrAvgRuntimeMs,
    regressionCount: beforeCcrRegressionCount,
    complexityScore: 1,
  };
  return [
    current,
    { id: "MCM_THEN_CCR", ...reordered },
    { id: "DEDICATED_BUDGET", ...reordered },
    { id: "CONDITIONAL_SCHEDULER", ...reordered },
  ];
}

export type ContractDecision = "A_PRODUCTION_CONTRACT_ADOPTED" | "B_REFINEMENT_V2" | "C_REGRESS_TO_BLUEPRINT";

export interface ContractSelectionResult {
  decision: ContractDecision;
  rationale: string;
  selectedContract: ContractCandidateId;
  candidateScores: ContractCandidateScore[];
}

export function selectOperatingContract(
  beforeCcrVsAfterCcr: PairwiseComparison,
  beforeCcrVsBaseline: PairwiseComparison,
  framework: FrameworkValidationResult,
  interaction: InteractionAuditSummary,
  candidateScores: ContractCandidateScore[]
): ContractSelectionResult {
  const reorderingSignificantlyBetter = beforeCcrVsAfterCcr.improvedCountDiff.stats.ciLower > 0;
  const reorderedBeatsBaselineSignificantly = beforeCcrVsBaseline.improvedCountDiff.stats.ciLower > 0;
  const reorderedNoRegression = beforeCcrVsBaseline.trueRegressionDiff.stats.ciUpper <= 0 || beforeCcrVsBaseline.trueRegressionDiff.stats.mean <= 0;
  const stillStarved = interaction.budgetStarvedRate >= 0.5;

  let decision: ContractDecision;
  let rationale: string;
  let selectedContract: ContractCandidateId;

  const frameworkPass = framework.pipelineResult.decision === "A";

  if (reorderingSignificantlyBetter && reorderedBeatsBaselineSignificantly && reorderedNoRegression && frameworkPass) {
    decision = "A_PRODUCTION_CONTRACT_ADOPTED";
    selectedContract = "MCM_THEN_CCR";
    rationale = `BEFORE_CCR가 AFTER_CCR 대비 통계적으로 유의하게 개선되었고(improvedCountDiff 95% CI 하한>0), Baseline(MCM 없음) 대비로도 유의한 개선이며 Regression 없음, Validation Framework(Category D) Decision=${framework.pipelineResult.decision} -- Budget/Scheduler 변경만으로 Capability가 회복됨을 확인, MCM_THEN_CCR(=Dedicated Budget=Conditional Scheduler, 동일 메커니즘)를 Production Contract로 채택한다.`;
  } else if (!stillStarved && !reorderedBeatsBaselineSignificantly) {
    decision = "C_REGRESS_TO_BLUEPRINT";
    selectedContract = "CURRENT_CCR_THEN_MCM";
    rationale = `BEFORE_CCR로 재배치한 뒤에도 Budget Starvation이 해소되었음(budgetStarvedRate=${(interaction.budgetStarvedRate * 100).toFixed(1)}%)에도 불구하고 Baseline 대비 유의한 Capability 회복이 없다 -- 예산을 충분히 보장해도 Capability가 회복되지 않으므로 Primitive 자체의 한계로 결론짓고 Primitive Blueprint 단계로 회귀한다.`;
  } else {
    decision = "B_REFINEMENT_V2";
    selectedContract = "CURRENT_CCR_THEN_MCM";
    rationale = `부분적인 회복 신호는 있으나(budgetStarvedRate=${(interaction.budgetStarvedRate * 100).toFixed(1)}%, reorderingSignificantlyBetter=${reorderingSignificantlyBetter}) 최적 Operating Contract를 확정할 만큼 명확하지 않다 -- Refinement Sprint v2로 추가 검증이 필요하다.`;
  }

  return { decision, rationale, selectedContract, candidateScores };
}
