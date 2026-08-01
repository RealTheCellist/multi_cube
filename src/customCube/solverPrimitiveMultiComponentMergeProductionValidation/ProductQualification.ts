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

  let decision: QualificationDecision;
  let rationale: string;
  if (level1Pass && level2Pass && level3Pass && level4Pass) {
    decision = "A_QUALIFICATION_COMPLETE";
    rationale = `Contract 정상(Level1), Capability 95% CI 하한>0으로 통계적으로 유의(Level2), Regression 0건(Level3), Validation Framework Decision A(Level4) -- 모두 PASS. Multi-Component Merge를 정식 Operating Contract로 확정하고 Primitive 연구를 종료한다.`;
  } else if (level1Pass && level3Pass && (level2Pass || comparison.improvedCountDiff.stats.mean > 0)) {
    decision = "B_POPULATION_EXPANSION_NEEDED";
    rationale = `Contract는 정상이고 Regression도 없으나(Level1/Level3 PASS), Capability의 통계적 유의성(Level2) 또는 Validation Framework 완전 승인(Level4)에는 아직 도달하지 못했다 -- 모집단 확대 또는 반복 수 증가를 통한 추가 Qualification이 필요하다.`;
  } else {
    decision = "C_PRIMITIVE_BLUEPRINT_REGRESSION";
    rationale = `Contract 이상(Level1) 또는 새로운 Regression 발생(Level3) -- Integration 문제가 아니라 Primitive 자체의 한계로 판단해 Blueprint 단계로 회귀한다.`;
  }

  return { level1Pass, level2Pass, level3Pass, level4Pass, decision, rationale };
}
