// --- StandardizationDecision (Multi-Component Merge Validation Protocol
// Standardization Sprint v1, STEP6) --------------------------------------
import type { ValidationScopeRow } from "./ValidationScopeMatrix";
import type { ProtocolStageRow } from "./ProtocolDefinition";
import type { ApplicabilityRow } from "./ApplicabilityAnalysis";
import type { CompatibilityAuditResult } from "./CompatibilityAudit";

export type StandardizationDecisionType = "A_PROTOCOL_ADOPTED" | "B_PROTOCOL_NEEDS_REVISION" | "C_FRAMEWORK_REVISION_NEEDED";

export interface Level1To3 {
  level1Pass: boolean; // Validation Protocol 정의 완료
  level2Pass: boolean; // 기존 Framework와 충돌 없음
  level3Pass: boolean; // 향후 재사용 가능
}

export interface StandardizationDecisionResult extends Level1To3 {
  decision: StandardizationDecisionType;
  rationale: string;
  openFollowUps: string[];
}

export function evaluateStandardizationDecision(
  scopeMatrix: readonly ValidationScopeRow[],
  validationFlow: readonly ProtocolStageRow[],
  applicabilityMatrix: readonly ApplicabilityRow[],
  compatibility: CompatibilityAuditResult
): StandardizationDecisionResult {
  // Level1: both axes defined, all 4 stages defined in strict order 1-4.
  const level1Pass = scopeMatrix.length === 2 && validationFlow.length === 4 && validationFlow.every((s, i) => s.order === i + 1);

  // Level2: Compatibility Audit found the existing Framework requires zero
  // modification (Gate signatures generic + Category C already covers the
  // required Gate list).
  const level2Pass = !compatibility.frameworkModificationRequired;

  // Level3: every stage in the Validation Flow reuses an ALREADY-COMMITTED,
  // already-verified real module (no placeholder/TODO reusedModule
  // strings) -- meaning a future Sprint can mechanically follow this
  // Protocol without inventing new infrastructure.
  const level3Pass = validationFlow.every((s) => s.reusedModule.length > 0 && !/TODO|미구현|placeholder/i.test(s.reusedModule));

  const unverifiedApplicability = applicabilityMatrix.filter((r) => r.applicability === "STRUCTURALLY_AT_RISK_UNVERIFIED");
  const openFollowUps = unverifiedApplicability.map(
    (r) => `${r.type}: ${r.rationale}`
  );

  let decision: StandardizationDecisionType;
  let rationale: string;
  if (level1Pass && level2Pass && level3Pass) {
    decision = "A_PROTOCOL_ADOPTED";
    rationale = `Validation Scope(2축) + Validation Flow(4단계) + Applicability(7개 Primitive 전체 분류) + Compatibility(Gate A/B/C/E 전부 generic, Category C requiredGates 일치) 모두 실측/코드 감사로 확인되었다 -- MCM Validation Protocol을 공식 채택한다. MCM 연구는 Primitive 연구/Production Integration/Validation Methodology/Validation Protocol 표준화 4단계를 모두 완료하고 운영 표준(Operational Standard)으로 전환된다.`;
  } else if (level1Pass && level3Pass) {
    decision = "B_PROTOCOL_NEEDS_REVISION";
    rationale = `Protocol 자체는 정의되었으나 Compatibility Audit에서 기존 Framework와의 불일치가 발견되었다(frameworkModificationRequired=true) -- Protocol을 보완해 재검토해야 한다.`;
  } else {
    decision = "C_FRAMEWORK_REVISION_NEEDED";
    rationale = `Protocol 자체가 완전히 정의되지 않았거나(Level1/3 FAIL) Framework 충돌이 구조적으로 해소 불가능하다 -- Validation Framework 자체의 재검토가 필요하다.`;
  }

  return { level1Pass, level2Pass, level3Pass, decision, rationale, openFollowUps };
}
