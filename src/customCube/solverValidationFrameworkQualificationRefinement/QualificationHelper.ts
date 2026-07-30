// --- QualificationHelper (Solver Validation Framework Qualification
// Refinement Sprint v1) -----------------------------------------------------
// Small auxiliary module the Directive explicitly allows ("필요하면
// QualificationHelper.ts 정도의 보조 모듈 추가는 허용"). Holds exactly two
// things this Sprint's own replay needs that the OLD, unmodified
// HistoricalQualificationDataset.ts does not carry: (1) which lifecycle
// stage (prototype vs production) each of the 5 historical cases actually
// represents, and (2) which Change Categories STEP2's strict Gate C
// applies to. Neither of these edits the old dataset file -- STEP3
// requires replaying the SAME 5 cases with the SAME published numbers, so
// the stage tag is layered on here, keyed by sprintName, rather than added
// as a new field on HistoricalCase.
import type { ChangeCategory, ValidationStage } from "../solverPostReleaseValidationFramework/ChangeClassification";

export interface StageAssignment {
  sprintName: string;
  stage: ValidationStage;
  rationale: string;
}

// Stage assigned by what each Sprint's own N and role in its lifecycle
// actually was (not by the literal word "Prototype"/"Production" in its
// name, which is inconsistent across this arc -- e.g. "Mixed Commutator
// PRODUCTION Validation Sprint v1/v2" both used N=10, the same small-N
// individual-Primitive-validation role the Refinement Directive's own
// STEP1 background cites as the Category C prototype-tier precedent).
export const STAGE_ASSIGNMENTS: StageAssignment[] = [
  {
    sprintName: "CONFLICT_DEEP_DEPENDENCY Scheduler Prototype Sprint v1",
    stage: "prototype",
    rationale: "N=15, 이후 Scheduler Production Integration Sprint v1(N=30)이 재확인하는 2단계 워크플로의 1단계.",
  },
  {
    sprintName: "CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1",
    stage: "production",
    rationale: "N=30, Scheduler Ordering을 Production Contract로 확정한 Sprint.",
  },
  {
    sprintName: "Incremental Recovery Production Integration Sprint v1",
    stage: "production",
    rationale: "N=30, Production Recovery Layer에 실제로 통합 배선한 Sprint.",
  },
  {
    sprintName: "Mixed Commutator Production Validation Sprint v1",
    stage: "prototype",
    rationale: "N=10 -- Sprint 이름과 무관하게 실제로는 개별 Primitive 자체의 초기 검증(이후 v2가 재확인)이었던 소표본 단계.",
  },
  {
    sprintName: "Mixed Commutator Production Validation Sprint v2",
    stage: "prototype",
    rationale: "N=10 -- v1과 동일한 소표본 개별 Primitive 검증 단계(Gate C 강화 이후에도 재확인하는 역할).",
  },
];

export function getStageForSprint(sprintName: string): ValidationStage {
  const found = STAGE_ASSIGNMENTS.find((s) => s.sprintName === sprintName);
  if (!found) throw new Error(`No stage assignment for sprint: ${sprintName}`);
  return found.stage;
}

// STEP2: strict Gate C (require isSignificantImprovement) applies to
// Category B/C/D -- changes that must show real Capability gain. Category
// A(Bug Fix) keeps the original weak "not worse" bar, since a Bug Fix's
// job is to stop breaking something, not to prove a statistically
// significant improvement. No historical case in this dataset is Category
// A (see CATEGORY_A_GAP_NOTE in HistoricalQualificationDataset.ts), so
// this function evaluates to true for all 5 replayed cases, but is
// written generally rather than hardcoded to those 5.
export function requiresStrictGateC(category: ChangeCategory): boolean {
  return category === "B" || category === "C" || category === "D";
}
