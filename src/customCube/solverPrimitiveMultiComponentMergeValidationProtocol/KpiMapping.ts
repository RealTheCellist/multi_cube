// --- KpiMapping (Multi-Component Merge Validation Protocol
// Standardization Sprint v1, STEP3) --------------------------------------
// Maps each Protocol stage to the real KPI field names already produced by
// the reused modules (ProtocolDefinition.ts's own citations) -- no new KPI
// is introduced here beyond the RIBD proposal already on record from the
// Validation Methodology Qualification Sprint v1 (still NOT adopted into
// the Framework this Sprint -- only cited).
export type KpiTier = "CAPABILITY" | "PRODUCT";

export interface KpiMappingRow {
  tier: KpiTier;
  kpi: string;
  role: "PRIMARY" | "SECONDARY";
  realFieldSource: string;
  definition: string;
}

export const KPI_MAPPING_TABLE: KpiMappingRow[] = [
  {
    tier: "CAPABILITY",
    kpi: "improvedCount",
    role: "PRIMARY",
    realFieldSource: "AttemptRecoveryProbeResult.improved (SharedProbes.ts) aggregated as count(improved===true) over the target case subset",
    definition: "대상 Primitive가 후보로 offer + chosen되어 wrongWingAfter < wrongWingBefore를 만든 케이스 수.",
  },
  {
    tier: "CAPABILITY",
    kpi: "chosenType",
    role: "SECONDARY",
    realFieldSource: "AttemptRecoveryProbeResult.chosenType",
    definition: "실제로 선택된 Recovery 후보 타입 -- 대상 Primitive가 선택되었는지(vs 다른 Primitive에 밀렸는지) 직접 확인.",
  },
  {
    tier: "CAPABILITY",
    kpi: "wrongWingReduction",
    role: "SECONDARY",
    realFieldSource: "AttemptRecoveryProbeResult.wrongWingBefore - .wrongWingAfter",
    definition: "실제로 감소한 wrongWing 개수 합 -- improvedCount의 boolean보다 세밀한 크기 정보.",
  },
  {
    tier: "PRODUCT",
    kpi: "solvedCount",
    role: "PRIMARY",
    realFieldSource: "EndToEndSolveResult.solved / SolveE2EProbeResult.solved (wrongWingAfter===0)",
    definition: "real solve() E2E 이후 완전히 해결된(wrongWing=0) 케이스 수.",
  },
  {
    tier: "PRODUCT",
    kpi: "runtime",
    role: "SECONDARY",
    realFieldSource: "PairwiseComparison.runtimeDiffMs (StatisticalValidation.ts, Baseline vs Integrated wall-clock ms diff)",
    definition: "real solve() 호출의 wall-clock 실행 시간 변화 -- Gate B(Runtime 허용 범위)의 직접 입력.",
  },
  {
    tier: "PRODUCT",
    kpi: "regression",
    role: "SECONDARY",
    realFieldSource: "ReplayOutcome.trueRegression (RegressionAudit.ts) / RegressionAuditResult.newRegressionCount",
    definition: "변경 후 새로 발생한 실패(개선되던 케이스가 악화됨) 건수 -- Gate A(Regression 증가 없음)의 직접 입력.",
  },
];

// Disclosed-but-not-adopted KPI candidate from the Validation Methodology
// Qualification Sprint v1 -- cited here for completeness, still NOT wired
// into KPI_MAPPING_TABLE or the Framework itself this Sprint.
export const PROPOSED_UNADOPTED_KPI = {
  name: "Recovered Improvement Before Deadline (RIBD)",
  status: "PROPOSED, NOT ADOPTED" as const,
  origin: "Multi-Component Merge Validation Methodology Qualification Sprint v1 STEP4 (MetricSensitivityAudit.ts)",
};
