// --- OperatingContractCatalog (Solver Research Closeout Sprint v1, STEP3)
// -------------------------------------------------------------------------
// Every real Operating Contract currently live in production, with its
// Origin/Integration/Validation Sprint lineage and current status. Values
// cited here are read directly from production source at Sprint time
// (fiveByFiveEdgeRecovery.ts, fiveByFiveEdgeExecutor.ts) -- documentation
// only, no production file modified.
export interface OperatingContractRow {
  contract: string;
  currentValue: string;
  originSprint: string;
  integrationSprint: string;
  validationSprint: string;
  currentStatus: "PRODUCTION_ACTIVE" | "PRODUCTION_ACTIVE_PROTOCOL_QUALIFIED";
}

export const OPERATING_CONTRACT_CATALOG: OperatingContractRow[] = [
  {
    contract: "ENDGAME Recovery Reserve (PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS)",
    currentValue: "250ms",
    originSprint: "Endgame Optimization Blueprint/Prototype/Refinement/Refinement V2",
    integrationSprint: "Production Integration Finalization Sprint v1",
    validationSprint: "Solver Release Readiness Validation Sprint v1, Post-Release Validation Framework Sprint v1",
    currentStatus: "PRODUCTION_ACTIVE",
  },
  {
    contract: "Primary 파이프라인 tryFixWing Fixed Budget (FIXED_BUDGET_MS)",
    currentValue: "140ms",
    originSprint: "Architecture Prototype Refinement Sprint v1 (BudgetSweep/OperatingContract)",
    integrationSprint: "Production Integration Sprint v1 (Fixed Budget 140ms wiring)",
    validationSprint: "Production Integration Sprint v1 (Capability/Regression, real solve(), N>=30)",
    currentStatus: "PRODUCTION_ACTIVE",
  },
  {
    contract: "REPAIR Reserved Slice (REPAIR_RESERVED_SLICE_MS)",
    currentValue: "75ms",
    originSprint: "CCR/Blueprint 계열 Budget Contract 비교",
    integrationSprint: "Scheduler Production Integration Sprint v1 (order 확정)",
    validationSprint: "Post-Release 이후 모든 population replay (142케이스 상시 포함)",
    currentStatus: "PRODUCTION_ACTIVE",
  },
  {
    contract: "CCR Budget Contract (remainingTime)",
    currentValue: "고정 slice 없음 -- real 남은 outer deadline 그대로 사용",
    originSprint: "CCR Prototype Sprint v1 (Budget Contract 비교: fixed/adaptive/remaining-time)",
    integrationSprint: "CCR Production Integration Sprint v1",
    validationSprint: "CCR Production Integration Sprint v1 (End-to-End Capability, real solve())",
    currentStatus: "PRODUCTION_ACTIVE",
  },
  {
    contract: "Scheduler SETUP Last-Resort Ordering",
    currentValue: "candidates.length===0일 때만 SETUP 시도(다른 모든 후보가 실패한 경우의 최종 수단)",
    originSprint: "Scheduler Architecture Revision Sprint v1 (Decision Matrix)",
    integrationSprint: "Scheduler Prototype Sprint v1 + Scheduler Production Integration Sprint v1",
    validationSprint: "Scheduler Production Integration Sprint v1 (N>=15, real solve())",
    currentStatus: "PRODUCTION_ACTIVE",
  },
  {
    contract: "SETUP Reserved Slice (SETUP_RESERVED_SLICE_MS)",
    currentValue: "500ms",
    originSprint: "Conflict Deep Dependency Budget Scheduling Sprint",
    integrationSprint: "Reserved Slice Production Integration Sprint v1",
    validationSprint: "Reserved Slice Production Integration Sprint v1 (Capability+Regression, real solve(), 전체 Hole Dataset)",
    currentStatus: "PRODUCTION_ACTIVE",
  },
  {
    contract: "MIXED_COMMUTATOR Reserved Slice (MIXED_COMMUTATOR_RESERVED_SLICE_MS) + Gate(cycleCount===1 AND componentCount===1)",
    currentValue: "300ms",
    originSprint: "Mixed Commutator Design Space Sprint",
    integrationSprint: "Mixed Commutator Production Integration Sprint",
    validationSprint: "Mixed Commutator Production Validation Sprint v1/v2, Gate Refinement + Gate Production Integration Sprint",
    currentStatus: "PRODUCTION_ACTIVE",
  },
  {
    contract: "MULTI_COMPONENT_MERGE Reserved Slice (MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS) + Gate(componentCount>=3) + Short-Circuit allowlist",
    currentValue: "2000ms",
    originSprint: "MCM Integration Planning Sprint v1",
    integrationSprint: "MCM Production Integration Sprint v1 + Integration Refinement v1/v2/RefinementV3 + Short-Circuit Production Integration Sprint v1(allowlist fix)",
    validationSprint: "MCM Production Validation Sprint v1 + Validation Methodology Qualification Sprint v1 + Validation Protocol Standardization Sprint v1",
    currentStatus: "PRODUCTION_ACTIVE_PROTOCOL_QUALIFIED",
  },
  {
    contract: "PARITY_GATED_CYCLE Reserved Slice (PARITY_GATED_CYCLE_RESERVED_SLICE_MS) + Gate(componentCount>1) + 이미 Short-Circuit allowlist 포함",
    currentValue: "2000ms",
    originSprint: "Parity-Gated Cycle Blueprint/Hybrid Blueprint/Comparative Prototype Sprint",
    integrationSprint: "Parity-Gated Cycle Production Integration Sprint v1",
    validationSprint: "PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1 (Decision A)",
    currentStatus: "PRODUCTION_ACTIVE_PROTOCOL_QUALIFIED",
  },
];
