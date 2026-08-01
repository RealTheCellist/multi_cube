// --- ApplicabilityAnalysis (Multi-Component Merge Validation Protocol
// Standardization Sprint v1, STEP4) --------------------------------------
// Determines which existing Recovery Primitives must follow the MCM
// Validation Protocol (Capability + Product Validation reported together)
// vs which are adequately served by Product Validation alone. Unlike the
// Directive's own illustrative "예)" lists, this module reads the REAL
// on-disk RESERVED_SLICE_MS constants (fs.readFileSync + regex, the same
// disclosed-audit pattern ContractAudit.ts modules have used throughout
// this arc) rather than assuming the Directive's example lists are final
// -- this Sprint's own real finding corrects one gap in those examples
// (see PARITY_GATED_CYCLE below).
import * as fs from "fs";

export type RecoveryTypeName = "DISRUPT" | "SETUP" | "REPAIR" | "CCR" | "MIXED_COMMUTATOR" | "PARITY_GATED_CYCLE" | "MULTI_COMPONENT_MERGE";

export interface ApplicabilityRow {
  type: RecoveryTypeName;
  dedicatedBudgetMs: number | null; // null = no fixed RESERVED_SLICE_MS of its own (shares genDeadline or uses "remainingTime" contract)
  exceedsRecoveryReserve: boolean; // dedicatedBudgetMs > PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS(250ms)
  empiricalSolveE2ECapabilityConfirmed: "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN_NEEDS_CHECK";
  empiricalEvidence: string;
  applicability: "MCM_PROTOCOL_REQUIRED" | "PRODUCT_VALIDATION_SUFFICIENT" | "STRUCTURALLY_AT_RISK_UNVERIFIED";
  rationale: string;
}

const RECOVERY_TS_PATH = "src/customCube/fiveByFiveEdgeRecovery.ts";
const EXECUTOR_TS_PATH = "src/customCube/fiveByFiveEdgeExecutor.ts";

function readConst(source: string, name: string): number | null {
  const m = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(source);
  return m ? Number(m[1]) : null;
}

export function buildApplicabilityMatrix(): ApplicabilityRow[] {
  const recoverySource = fs.readFileSync(RECOVERY_TS_PATH, "utf-8");
  const executorSource = fs.readFileSync(EXECUTOR_TS_PATH, "utf-8");

  const recoveryReserveMs = readConst(executorSource, "PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS") ?? 250;
  const repairMs = readConst(recoverySource, "REPAIR_RESERVED_SLICE_MS");
  const mixedMs = readConst(recoverySource, "MIXED_COMMUTATOR_RESERVED_SLICE_MS");
  const setupMs = readConst(recoverySource, "SETUP_RESERVED_SLICE_MS");
  const parityMs = readConst(recoverySource, "PARITY_GATED_CYCLE_RESERVED_SLICE_MS");
  const mcmMs = readConst(recoverySource, "MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS");

  const rows: ApplicabilityRow[] = [
    {
      type: "DISRUPT",
      dedicatedBudgetMs: null,
      exceedsRecoveryReserve: false,
      empiricalSolveE2ECapabilityConfirmed: "CONFIRMED",
      empiricalEvidence: "genDeadline를 SETUP과 공유(자체 Reserved Slice 없음) -- Product Integration Finalization Sprint v1 이래 real solve() 경로에서 지속적으로 관측됨.",
      applicability: "PRODUCT_VALIDATION_SUFFICIENT",
      rationale: "자체 dedicated budget이 없으므로 solve_e2e의 real Budget Envelope과 Capability Validation의 Budget Envelope이 사실상 동일하다 -- 별도 Protocol 불필요.",
    },
    {
      type: "REPAIR",
      dedicatedBudgetMs: repairMs,
      exceedsRecoveryReserve: (repairMs ?? 0) > recoveryReserveMs,
      empiricalSolveE2ECapabilityConfirmed: "CONFIRMED",
      empiricalEvidence: `REPAIR_RESERVED_SLICE_MS=${repairMs}ms, real production Recovery Reserve(${recoveryReserveMs}ms)보다 작음 -- solve_e2e가 이 예산에 항상 도달 가능. Prod Integration Sprint 계열(#205-211)에서 real solve()로 이미 Capability 확인됨.`,
      applicability: "PRODUCT_VALIDATION_SUFFICIENT",
      rationale: "명목 예산이 real Recovery Reserve보다 작아 solve_e2e에서 구조적으로 도달 불가능한 상황이 발생하지 않는다.",
    },
    {
      type: "CCR",
      dedicatedBudgetMs: null,
      exceedsRecoveryReserve: false,
      empiricalSolveE2ECapabilityConfirmed: "CONFIRMED",
      empiricalEvidence: "고정 Reserved Slice 없이 'remainingTime' Budget Contract(남은 real outer deadline 그대로 사용) -- CCR Production Integration Sprint v1(#205-211)에서 real solve()로 Capability 확인됨.",
      applicability: "PRODUCT_VALIDATION_SUFFICIENT",
      rationale: "명목 dedicated budget 자체가 없으므로 solve_e2e의 real Budget Envelope과 어긋날 여지가 없다.",
    },
    {
      type: "MIXED_COMMUTATOR",
      dedicatedBudgetMs: mixedMs,
      exceedsRecoveryReserve: (mixedMs ?? 0) > recoveryReserveMs,
      empiricalSolveE2ECapabilityConfirmed: "CONFIRMED",
      empiricalEvidence: `MIXED_COMMUTATOR_RESERVED_SLICE_MS=${mixedMs}ms, real Recovery Reserve(${recoveryReserveMs}ms)보다 크다(정성적으로는 exceedsRecoveryReserve=true) -- 그러나 Mixed Commutator Production Validation Sprint v1/v2(#345-347, #355-357)에서 real solve() E2E로 이미 Capability가 확인되었고, 이번 MCM Sprint 계열과 같은 Measurement Mismatch를 낳는 후속 Methodology Sprint가 발생하지 않았다.`,
      applicability: "PRODUCT_VALIDATION_SUFFICIENT",
      rationale: "명목상 250ms Recovery Reserve를 초과하지만(300ms), 초과폭이 MCM/PARITY_GATED_CYCLE(2000ms)에 비해 작아 solve_e2e가 실제로 도달 가능한 범위였다는 것이 이미 완료된 real solve() Sprint로 실증되었다. '초과 여부'만으로 기계적으로 Protocol을 적용하지 않고, 실측 Capability 확인 이력을 우선한다.",
    },
    {
      type: "SETUP",
      dedicatedBudgetMs: setupMs,
      exceedsRecoveryReserve: (setupMs ?? 0) > recoveryReserveMs,
      empiricalSolveE2ECapabilityConfirmed: "CONFIRMED",
      empiricalEvidence: `SETUP_RESERVED_SLICE_MS=${setupMs}ms, real Recovery Reserve(${recoveryReserveMs}ms)의 2배 -- 그러나 Reserved Slice Production Integration Sprint v1(#368-373)이 real solve(), 전체 Hole Dataset으로 Capability + Regression Validation을 이미 완료했고, 후속 Measurement Mismatch Sprint가 발생하지 않았다.`,
      applicability: "PRODUCT_VALIDATION_SUFFICIENT",
      rationale: "MIXED_COMMUTATOR와 동일한 논리 -- Directive의 예시 목록이 SETUP을 비대상으로 분류한 것은 산술적 '초과 여부'가 아니라 이미 완료된 real solve() 실측 Capability 확인 이력에 근거한 것으로 재해석된다.",
    },
    {
      type: "PARITY_GATED_CYCLE",
      dedicatedBudgetMs: parityMs,
      exceedsRecoveryReserve: (parityMs ?? 0) > recoveryReserveMs,
      empiricalSolveE2ECapabilityConfirmed: "UNKNOWN_NEEDS_CHECK",
      empiricalEvidence: `PARITY_GATED_CYCLE_RESERVED_SLICE_MS=${parityMs}ms -- MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS(${mcmMs}ms)와 정확히 동일한 규모. Directive의 예시 목록(적용 대상/비대상 어느 쪽에도) 언급되지 않았다 -- 이번 Sprint의 실측 코드 감사로 새로 발견된 항목.`,
      applicability: "STRUCTURALLY_AT_RISK_UNVERIFIED",
      rationale: "MCM과 동일한 2000ms dedicated budget을 가지므로 구조적으로 동일한 Measurement Mismatch 위험군이다. 다만 이 Sprint의 범위(Documentation/Framework Extension, Production 실행 없음)에서는 PARITY_GATED_CYCLE에 대한 실제 attemptRecovery_direct/solve_e2e 비교 실측을 수행하지 않았으므로 'MCM_PROTOCOL_REQUIRED'로 단정하지 않는다 -- 별도 실측 Sprint가 필요한 후보로 명시적으로 남긴다.",
    },
    {
      type: "MULTI_COMPONENT_MERGE",
      dedicatedBudgetMs: mcmMs,
      exceedsRecoveryReserve: (mcmMs ?? 0) > recoveryReserveMs,
      empiricalSolveE2ECapabilityConfirmed: "NOT_CONFIRMED",
      empiricalEvidence: `MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS=${mcmMs}ms -- Validation Methodology Qualification Sprint v1이 real 실행으로 confirmedCapability(attemptRecovery_direct 전 구간)와 solve_e2e에서의 관측 실패(전 구간)를 모두 실측함.`,
      applicability: "MCM_PROTOCOL_REQUIRED",
      rationale: "이 Sprint 계열 전체의 원인 -- 명목 dedicated budget이 solve_e2e의 real Budget Envelope에 구조적으로 도달할 수 없음이 실측으로 확인된 유일한 케이스.",
    },
  ];

  return rows;
}
