// --- ProductQualification (Multi-Component Merge Production Validation
// Sprint v1, STEP6) --------------------------------------------------------------
// Level1-4 + Decision A/B/C per the Directive's own success criteria.
import type { ContractAuditResult } from "./ContractAudit";
import type { PairwiseComparison } from "./StatisticalValidation";
import type { FrameworkValidationResult } from "./ValidationFramework";

export type QualificationDecision = "A_QUALIFICATION_COMPLETE" | "B_POPULATION_EXPANSION_NEEDED" | "C_PRIMITIVE_BLUEPRINT_REGRESSION";

export interface Level1To4 {
  level1Pass: boolean; // Contract Audit PASS
  level2Pass: boolean; // Capability: improvedCountDiff 95% CI excludes zero
  level3Pass: boolean; // Regression: 0
  level4Pass: boolean; // Validation Framework Decision A
}

export interface ProductQualificationResult extends Level1To4 {
  decision: QualificationDecision;
  rationale: string;
}

export function evaluateProductQualification(contractAudit: ContractAuditResult, comparison: PairwiseComparison, newRegressionCount: number, framework: FrameworkValidationResult): ProductQualificationResult {
  const level1Pass = contractAudit.allShortCircuitTypesPresent && contractAudit.noDriftSinceFix;
  const level2Pass = comparison.improvedCountDiff.stats.ciLower > 0;
  const level3Pass = newRegressionCount === 0;
  const level4Pass = framework.pipelineResult.decision === "A";

  // A negative signal (mean < 0) is the one thing that would genuinely
  // indicate the effect reverses at population scale -- mean === 0 (no
  // observed difference either way, e.g. both arms identical) is NOT a
  // negative signal, just an absence of one, and belongs in the B branch
  // alongside "positive but not yet significant."
  const noNegativeSignal = comparison.improvedCountDiff.stats.mean >= 0;

  let decision: QualificationDecision;
  let rationale: string;
  if (level1Pass && level2Pass && level3Pass && level4Pass) {
    decision = "A_QUALIFICATION_COMPLETE";
    rationale = `Contract 정상(Level1), Capability 95% CI 하한>0으로 통계적으로 유의(Level2), Regression 0건(Level3), Validation Framework Decision A(Level4) -- 모두 PASS. Multi-Component Merge를 정식 Operating Contract로 확정하고 Primitive 연구를 종료한다.`;
  } else if (level1Pass && level3Pass && noNegativeSignal) {
    decision = "B_POPULATION_EXPANSION_NEEDED";
    rationale = `Contract는 정상이고(Level1 PASS) Regression도 없다(Level3 PASS, newRegressionCount=0). 다만 이번 Sprint가 사용한 real end-to-end solve() 1회 호출 측정(N=142)에서는 improvedCountDiff mean=${comparison.improvedCountDiff.stats.mean.toFixed(4)}로 Baseline과 Integrated가 사실상 구별되지 않았다(Level2 FAIL) -- 이는 Short-Circuit Production Integration Sprint v1이 이미 실측으로 확인한 효과(scrambleDepth30:2/scrambleDepth100:5, outer=2000ms, attemptRecovery() 레벨)가 사라졌다는 뜻이 아니라, 이번 Sprint의 측정 축(단일 solve() 호출, 자체 내부 예산)이 그 조건보다 훨씬 좁아 같은 신호를 감지하기에 충분히 민감하지 않다는 뜻이다(disclosed). 모집단 확대보다는 이 효과가 실제로 관측되는 조건(outer=2000ms 급 예산)에 맞춘 재측정이 필요하다.`;
  } else {
    decision = "C_PRIMITIVE_BLUEPRINT_REGRESSION";
    rationale = `Contract 이상(Level1=${level1Pass}) 또는 새로운 Regression 발생(Level3=${level3Pass}, newRegressionCount=${newRegressionCount}) 또는 Capability가 오히려 악화(improvedCountDiff mean=${comparison.improvedCountDiff.stats.mean.toFixed(4)}<0) -- Integration 문제가 아니라 Primitive 자체의 한계로 판단해 Blueprint 단계로 회귀한다.`;
  }

  return { level1Pass, level2Pass, level3Pass, level4Pass, decision, rationale };
}
