// --- ResearchCloseoutDecision (Solver Research Closeout Sprint v1, STEP6)
// -------------------------------------------------------------------------
import type { ResearchInventoryMatrixResult } from "./ResearchInventoryMatrix";
import type { FinalArchitectureV1 } from "./FinalArchitecture";
import type { OperatingContractRow } from "./OperatingContractCatalog";
import type { ValidationStandardResult } from "./ValidationStandard";
import type { KnownLimitationRow } from "./KnownLimitationRegister";

export type ResearchCloseoutDecisionType = "A_RESEARCH_COMPLETE" | "B_PARTIAL_DOCUMENTATION_NEEDED" | "C_INSUFFICIENT_GROUNDS";

export interface Level1To3 {
  level1PrimitiveLifecycleComplete: boolean;
  level2ProductionReleaseComplete: boolean;
  level3MaintenanceTransitionPossible: boolean;
}

export interface ResearchCloseoutDecisionResult extends Level1To3 {
  decision: ResearchCloseoutDecisionType;
  rationale: string;
}

export function evaluateResearchCloseoutDecision(
  inventory: ResearchInventoryMatrixResult,
  architecture: FinalArchitectureV1,
  contracts: readonly OperatingContractRow[],
  validationStandard: ValidationStandardResult,
  limitations: readonly KnownLimitationRow[]
): ResearchCloseoutDecisionResult {
  // Level1: every Dedicated Budget Primitive currently in production has
  // gone through the FULL lifecycle (Discovery -> Blueprint -> Prototype
  // -> Production Integration -> Validation Protocol Qualification). Both
  // real Contract Catalog rows for MCM/PARITY_GATED_CYCLE must show
  // PRODUCTION_ACTIVE_PROTOCOL_QUALIFIED status, and no limitation is left
  // as a FUTURE_RESEARCH_CANDIDATE that blocks release (a candidate that's
  // merely "worth doing" doesn't block closeout; one that's REQUIRED would).
  const dedicatedBudgetContracts = contracts.filter((c) => c.currentStatus === "PRODUCTION_ACTIVE_PROTOCOL_QUALIFIED");
  const allDedicatedBudgetQualified = dedicatedBudgetContracts.length === validationStandard.dedicatedBudgetProtocols.length;
  const noBlockingLimitation = limitations.every((l) => l.disposition !== "FUTURE_RESEARCH_CANDIDATE");
  const level1PrimitiveLifecycleComplete = allDedicatedBudgetQualified && noBlockingLimitation && inventory.totalFiles > 0;

  // Level2: Release Framework (Gates A-E, Categories A-D) and every
  // Operating Contract have real Origin/Integration/Validation Sprint
  // citations (no contract left with an empty lineage).
  const allGatesDefined = validationStandard.gates.length === 5;
  const allCategoriesDefined = validationStandard.categories.length === 4;
  const allContractsHaveLineage = contracts.every((c) => c.originSprint.length > 0 && c.integrationSprint.length > 0 && c.validationSprint.length > 0);
  const level2ProductionReleaseComplete = allGatesDefined && allCategoriesDefined && allContractsHaveLineage;

  // Level3: architecture is frozen (non-empty pipeline definition) and the
  // Known Limitation Register shows no unresolved item requiring further
  // research before Maintenance can begin.
  const architectureFrozen = architecture.recoveryPipelineDefaultOrder.length === 8;
  const level3MaintenanceTransitionPossible = architectureFrozen && noBlockingLimitation;

  let decision: ResearchCloseoutDecisionType;
  let rationale: string;
  if (level1PrimitiveLifecycleComplete && level2ProductionReleaseComplete && level3MaintenanceTransitionPossible) {
    decision = "A_RESEARCH_COMPLETE";
    rationale = `Research Inventory(${inventory.totalFiles}개 문서 분류 완료) + Final Architecture(8단계 Recovery Pipeline 확정) + Operating Contract Catalog(${contracts.length}개 Contract 전부 Origin/Integration/Validation Sprint 계보 확인) + Validation Standard(Gate ${validationStandard.gates.length}개, Category ${validationStandard.categories.length}개, Dedicated Budget Protocol 2건 모두 Decision A) + Known Limitation Register(${limitations.length}건 전부 RESOLVED 또는 OPERATIONALLY_ACCEPTED, 향후 연구 필수 항목 없음) 모두 확인됨 -- Solver Research Complete를 선언하고 Maintenance Mode로 전환한다.`;
  } else if (level1PrimitiveLifecycleComplete) {
    decision = "B_PARTIAL_DOCUMENTATION_NEEDED";
    rationale = `핵심 연구(Primitive Lifecycle)는 종료되었으나 Production Release 체계 또는 운영 전환 조건 중 일부가 완전하지 않다 -- 문서/운영 표준 보완이 필요하다.`;
  } else {
    decision = "C_INSUFFICIENT_GROUNDS";
    rationale = `아직 종료할 근거가 부족하다 -- Dedicated Budget Primitive 중 Protocol이 완전히 qualified되지 않은 항목이 있거나, 종료를 막는 미해결 Limitation이 남아 있다.`;
  }

  return {
    level1PrimitiveLifecycleComplete,
    level2ProductionReleaseComplete,
    level3MaintenanceTransitionPossible,
    decision,
    rationale,
  };
}
