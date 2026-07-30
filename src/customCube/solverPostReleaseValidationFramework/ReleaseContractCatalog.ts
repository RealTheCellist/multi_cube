// --- ReleaseContractCatalog (Solver Post-Release Validation Framework
// Sprint v1, STEP1) -------------------------------------------------------
// The standard, canonical list of every Operating Contract that makes up
// the current Release. Each entry cites its own Origin (where the value
// was first derived/confirmed), Integration (where it was wired into real
// Production code), and Validation (every Sprint that measured it,
// individually or combined) -- so a future change to any of these can be
// traced back to the exact prior evidence it must not regress.
export interface ContractHistoryEntry {
  sprint: string;
  doc: string; // path under src/customCube/docs/, relative to that dir
  finding: string;
}

export interface ReleaseContract {
  name: string;
  productionValue: string;
  productionLocation: string; // file:const, read-only reference -- not re-derived here
  origin: ContractHistoryEntry;
  integration: ContractHistoryEntry;
  validation: ContractHistoryEntry[]; // chronological, may include an individually-neutral result superseded by a later combined one -- kept, not hidden
}

export const RELEASE_CONTRACT_CATALOG: ReleaseContract[] = [
  {
    name: "ENDGAME Budget Contract",
    productionValue: "250ms",
    productionLocation: "fiveByFiveEdgeExecutor.ts: PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS",
    origin: {
      sprint: "ENDGAME Optimization Prototype Refinement Sprint v2",
      doc: "ENDGAME_OPTIMIZATION_PROTOTYPE_REFINEMENT_V2.md",
      finding: "450ms~50ms 전체 스윕 + Pareto Frontier에서 250ms를 전역 최적으로 확정 (Decision B, 이후 채택).",
    },
    integration: {
      sprint: "Production Integration Finalization Sprint v1",
      doc: "PRODUCTION_INTEGRATION_FINALIZATION.md",
      finding: "PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS=250을 fiveByFiveEdgeExecutor.ts의 실제 기본값으로 확정.",
    },
    validation: [
      {
        sprint: "Production Integration Finalization Sprint v1",
        doc: "PRODUCTION_INTEGRATION_FINALIZATION.md",
        finding: "결합(ENDGAME+Incremental Recovery+CCR) 검증에서 Level1-3 PASS, RELEASE. Primary mean=1.167, 95% CI=[0.634, 1.699], d=0.784.",
      },
      {
        sprint: "Solver Release Readiness Validation Sprint v1",
        doc: "SOLVER_RELEASE_READINESS_REPORT.md",
        finding: "N=30 재검증. ENDGAME 축 단독은 CI가 0을 포함(mean=+0.10, CI=[-0.04,0.24]) -- 개별 축 단독 유의성은 없으나 결합 증거로 Capability PASS 유지.",
      },
    ],
  },
  {
    name: "Incremental Recovery Fixed Budget",
    productionValue: "140ms",
    productionLocation: "fiveByFiveEdgeExecutor.ts: FIXED_BUDGET_MS (module-private)",
    origin: {
      sprint: "Incremental Recovery Refinement Sprint v1",
      doc: "INCREMENTAL_RECOVERY_REFINEMENT.md",
      finding: "BudgetRefinement + DeadlineGranularityAnalysis을 통해 140ms를 Production 후보값으로 확정.",
    },
    integration: {
      sprint: "Incremental Recovery Production Integration Sprint v1",
      doc: "INCREMENTAL_RECOVERY_PRODUCTION_INTEGRATION.md",
      finding: "FIXED_BUDGET_MS=140을 tryFixWing/Executor의 실제 기본값으로 wiring.",
    },
    validation: [
      {
        sprint: "Incremental Recovery Production Integration Sprint v1",
        doc: "INCREMENTAL_RECOVERY_PRODUCTION_INTEGRATION.md",
        finding: "개별 검증 Decision B -- per-call Budget Compliance는 44.88%->97.90%로 확인되나 whole-solve Capability 유의성 없음(모든 CI가 0 포함).",
      },
      {
        sprint: "Production Integration Finalization Sprint v1",
        doc: "PRODUCTION_INTEGRATION_FINALIZATION.md",
        finding: "ENDGAME+CCR과 결합 검증에서 Decision A/RELEASE로 격상 -- 결합 상태의 순이익이 유의미함(Primary CI=[0.634,1.699]).",
      },
    ],
  },
  {
    name: "CCR Scheduling Contract",
    productionValue: "remainingTime (schedulingStrategy 무관, 항상 마지막 실행, 별도 예약 슬라이스 없음)",
    productionLocation: "fiveByFiveEdgeRecovery.ts: genCCR()",
    origin: {
      sprint: "CCR Integration Blueprint Sprint v1",
      doc: "CCR_INTEGRATION_BLUEPRINT.md",
      finding: "fixed/adaptive/remainingTime 세 Budget Contract 후보 비교 -- remainingTime(500ms floor 권장)을 채택.",
    },
    integration: {
      sprint: "CCR Production Integration Sprint v1",
      doc: "PRODUCTION_INTEGRATION_BLUEPRINT.md",
      finding: "genCCR()을 Recovery layer에 remainingTime 정책으로 wiring, 항상 마지막 순서.",
    },
    validation: [
      {
        sprint: "Production Integration Finalization Sprint v1",
        doc: "PRODUCTION_INTEGRATION_FINALIZATION.md",
        finding: "ENDGAME+Incremental Recovery와 결합 검증, Decision A/RELEASE.",
      },
      {
        sprint: "Solver Release Readiness Validation Sprint v1",
        doc: "SOLVER_RELEASE_READINESS_REPORT.md",
        finding: "코드 불변 재확인. 이번 측정에서 CCR offered=0(전체 solve() 예산 소진으로 인한 기대된 현상, 결함 아님).",
      },
    ],
  },
  {
    name: "CONFLICT_DEEP_DEPENDENCY Scheduler Contract (SETUP Last-Resort)",
    productionValue: 'order=[DISRUPT,DISRUPT,REPAIR,CCR,MIXED_COMMUTATOR,SETUP] when schedulingStrategy==="reservedBudget" && useSetupReservedSlice===true; genSetup()은 candidates.length>0이면 스킵',
    productionLocation: "fiveByFiveEdgeRecovery.ts: generateRecoveryStrategies()'s order array + genSetup()",
    origin: {
      sprint: "CONFLICT_DEEP_DEPENDENCY Architecture Revision Sprint v1",
      doc: "CONFLICT_DEEP_DEPENDENCY_ARCHITECTURE_REVISION.md",
      finding: "Counterfactual Replay로 11건 True Regression 중 6건이 SETUP 경쟁 제거로 해소됨을 확인, Option A(SETUP Last-Resort) 설계 및 시뮬레이션 검증(improvedRate 16.5%->17.0%).",
    },
    integration: {
      sprint: "CONFLICT_DEEP_DEPENDENCY Scheduler Prototype Sprint v1",
      doc: "CONFLICT_DEEP_DEPENDENCY_SCHEDULER_PROTOTYPE.md",
      finding: "Option A를 실제 fiveByFiveEdgeRecovery.ts에 적용(2곳 변경: skip 조건 + order 배열).",
    },
    validation: [
      {
        sprint: "CONFLICT_DEEP_DEPENDENCY Scheduler Prototype Sprint v1",
        doc: "CONFLICT_DEEP_DEPENDENCY_SCHEDULER_PROTOTYPE.md",
        finding: "N=15 재현성 검증, Decision A. True Regression 11->0, improvedCountDiff mean=1.93, d=1.26(large).",
      },
      {
        sprint: "CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1",
        doc: "CONFLICT_DEEP_DEPENDENCY_SCHEDULER_PRODUCTION_INTEGRATION.md",
        finding: "N=30 Production 규모 재검증, Decision A. True Regression 0건 유지, mean=1.13, CI=[0.60,1.66], d=0.77(medium).",
      },
      {
        sprint: "Solver Release Readiness Validation Sprint v1",
        doc: "SOLVER_RELEASE_READINESS_REPORT.md",
        finding: "결합 스냅샷에서 재확인, Decision A.",
      },
    ],
  },
];

// A precedent worth keeping visible: docs/PRODUCTION_RELEASE_CLOSEOUT.md
// already declared "Production Release Complete" once before, after only
// the first three contracts above existed -- and substantial further work
// (the entire CONFLICT_DEEP_DEPENDENCY track, this catalog's fourth
// contract) followed anyway. This is exactly why a durable, reusable
// Framework -- not a one-off closeout doc per release milestone -- is
// this Sprint's own reason for existing.
export const PRIOR_RELEASE_DECLARATIONS = [
  { doc: "PRODUCTION_RELEASE_CLOSEOUT.md", declaredAfter: "Production Integration Finalization Sprint v1 (3 contracts)", subsequentWork: "CONFLICT_DEEP_DEPENDENCY 계열 전체 (Mechanism Analysis부터 Scheduler Production Integration까지)" },
];
