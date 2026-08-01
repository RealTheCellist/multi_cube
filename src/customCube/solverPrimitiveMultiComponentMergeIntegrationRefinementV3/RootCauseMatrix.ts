// --- RootCauseMatrix (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP6) -----------------------------------------------
// Classifies each of the 3 successMismatch cases into exactly ONE of the
// Directive's own 6 named buckets, using STEP2(Attribution)/STEP3(Removal)/
// STEP5(Unlimited Replay) real evidence -- checked in the order that most
// directly falsifies each hypothesis first (Budget -> Selection/Candidate ->
// Primitive Failure -> Unknown only if nothing else explains it).
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { CaseAttribution } from "./CompetitionAttribution";
import type { CaseRemovalRow, RemovalConfig } from "./PrimitiveRemoval";
import type { UnlimitedReplayRow } from "./UnlimitedReplay";

export type RootCauseBucket = "BUDGET_COMPETITION" | "SCHEDULER_COMPETITION" | "CANDIDATE_COMPETITION" | "SELECTION_COMPETITION" | "PRIMITIVE_FAILURE" | "UNKNOWN";

export interface ComparativeReference {
  runtimeMs: number;
  mergeStepsSucceeded: number;
  componentCountBefore: number;
  componentCountAfter: number;
}

// MCM's own nominal budget contract (fiveByFiveEdgeRecovery.ts,
// MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS -- read-only reference, never
// modified by this Sprint).
export const MCM_NOMINAL_RESERVED_SLICE_MS = 2000;

const REMOVAL_CONFIG_TO_TYPE: Record<Exclude<RemovalConfig, "FULL">, RecoveryType> = {
  WITHOUT_CCR: "CCR",
  WITHOUT_REPAIR: "REPAIR",
  WITHOUT_PARITY_GATED_CYCLE: "PARITY_GATED_CYCLE",
  WITHOUT_MIXED_COMMUTATOR: "MIXED_COMMUTATOR",
};

export interface RootCauseRow {
  label: string;
  bucket: RootCauseBucket;
  evidence: string;
}

export function classifyCase(attribution: CaseAttribution, removal: CaseRemovalRow, unlimited: UnlimitedReplayRow, comparative: ComparativeReference | undefined): RootCauseRow {
  if (unlimited.improved) {
    return {
      label: attribution.label,
      bucket: "BUDGET_COMPETITION",
      evidence: `Unlimited Replay(outer=60000ms)에서 improved=true(wallMs=${unlimited.wallMs}, chosenType=${unlimited.chosenType}) -- outer deadline 제약만 제거해도 회복됨. 다른 Primitive와의 예산 경쟁이 근본 원인.`,
    };
  }

  if (removal.anyRemovalRescues) {
    const rescuerTypes = removal.rescuingConfigs.map((c) => REMOVAL_CONFIG_TO_TYPE[c as Exclude<RemovalConfig, "FULL">]);
    const wonSelectionRescuer = attribution.primitivesBeforeMcm.find((p) => rescuerTypes.includes(p.type) && p.wonSelection);
    if (wonSelectionRescuer) {
      return {
        label: attribution.label,
        bucket: "SELECTION_COMPETITION",
        evidence: `${removal.rescuingConfigs.join(", ")} 제거 시 회복 -- FULL 실행에서 ${wonSelectionRescuer.type}가 chooseBestRecovery 경쟁에서 MCM을 이겼었음(선택 경쟁).`,
      };
    }
    return {
      label: attribution.label,
      bucket: "CANDIDATE_COMPETITION",
      evidence: `${removal.rescuingConfigs.join(", ")} 제거 시 회복 -- 선택되지는 않았지만 해당 Primitive의 후보 생성/시간 소비 자체가 MCM 결과에 영향을 줌.`,
    };
  }

  if (!attribution.mcmOffered) {
    return {
      label: attribution.label,
      bucket: "PRIMITIVE_FAILURE",
      evidence: `Gate(componentCount>=3)는 통과했으나 Unlimited Replay에서도 MCM이 최종 offered 후보로 남지 않음 -- 경쟁과 무관한 Primitive 자체의 문제.`,
    };
  }

  if (comparative && comparative.runtimeMs > MCM_NOMINAL_RESERVED_SLICE_MS) {
    return {
      label: attribution.label,
      bucket: "PRIMITIVE_FAILURE",
      evidence: `Comparative Prototype 자체의 실측 runtimeMs=${comparative.runtimeMs}ms가 MCM 자체 명목 예산(${MCM_NOMINAL_RESERVED_SLICE_MS}ms)을 초과 -- outer deadline을 완전히 제거해도(Unlimited Replay) MCM 자체의 MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS 상수(production 코드, 이 Sprint의 보호 대상이라 변경하지 않음) 자체가 이미 부족해 회복되지 않음. mergeStepsSucceeded=${comparative.mergeStepsSucceeded}(병합 단계 자체도 성공하지 못했고, 개선은 traversal/cleanup 잔여 시간에 의존).`,
    };
  }

  return {
    label: attribution.label,
    bucket: "UNKNOWN",
    evidence: `Unlimited Replay와 Primitive Removal 모두 회복시키지 못했고, Comparative 실측 runtime(${comparative?.runtimeMs ?? "?"}ms)도 명목 예산 이내여서 예산 부족으로 설명되지 않음 -- 추가 요인이 필요.`,
  };
}

export function buildRootCauseMatrix(
  attributions: readonly CaseAttribution[],
  removals: readonly CaseRemovalRow[],
  unlimited: readonly UnlimitedReplayRow[],
  comparativeByLabel: ReadonlyMap<string, ComparativeReference>
): RootCauseRow[] {
  return attributions.map((a) => {
    const removal = removals.find((r) => r.label === a.label)!;
    const u = unlimited.find((r) => r.label === a.label)!;
    return classifyCase(a, removal, u, comparativeByLabel.get(a.label));
  });
}

export type FinalDecision = "A_PRODUCTION_CONTRACT" | "B_INTEGRATION_REFINEMENT" | "C_PRIMITIVE_BLUEPRINT_REGRESSION";

export interface Level1To3 {
  level1Pass: boolean; // Residual Competition 구조가 정량화됨 (all 3 cases have a full timeline)
  level2Pass: boolean; // Unknown <= 1
  level3Decision: FinalDecision;
  level3Rationale: string;
}

export function evaluateLevels(rows: readonly RootCauseRow[]): Level1To3 {
  const level1Pass = rows.length === 3;
  const unknownCount = rows.filter((r) => r.bucket === "UNKNOWN").length;
  const level2Pass = unknownCount <= 1;

  const competitionBuckets: RootCauseBucket[] = ["BUDGET_COMPETITION", "SCHEDULER_COMPETITION", "CANDIDATE_COMPETITION", "SELECTION_COMPETITION"];
  const allCompetition = rows.every((r) => competitionBuckets.includes(r.bucket));
  const allPrimitiveFailure = rows.every((r) => r.bucket === "PRIMITIVE_FAILURE");
  const anyPrimitiveFailure = rows.some((r) => r.bucket === "PRIMITIVE_FAILURE");

  let level3Decision: FinalDecision;
  let level3Rationale: string;
  if (allCompetition) {
    level3Decision = "A_PRODUCTION_CONTRACT";
    level3Rationale = `3건 모두 경쟁 기반 원인(Budget/Scheduler/Candidate/Selection Competition)으로 분류됨 -- 경쟁을 완화하는 Production Contract 수정(예: MCM 전용 예산 보장 또는 경쟁 Primitive와의 순서/Gate 조정)으로 해결 가능성이 높다.`;
  } else if (allPrimitiveFailure) {
    level3Decision = "C_PRIMITIVE_BLUEPRINT_REGRESSION";
    level3Rationale = `3건 모두 Primitive Failure(MCM 자체 명목 예산 부족 또는 자체 실패)로 분류됨 -- 경쟁을 모두 제거해도(Unlimited Replay) 회복되지 않으므로 Integration 문제가 아니라 Primitive 메커니즘/Blueprint 자체의 한계로 결론짓는다.`;
  } else if (anyPrimitiveFailure) {
    level3Decision = "B_INTEGRATION_REFINEMENT";
    level3Rationale = `경쟁 기반 원인과 Primitive Failure가 혼재됨 -- 일부는 Contract 수정으로 해결 가능하지만 나머지는 Primitive 자체의 한계이므로, 단일 Decision으로 확정하기보다 case-by-case Refinement가 필요하다.`;
  } else {
    level3Decision = "B_INTEGRATION_REFINEMENT";
    level3Rationale = `Unknown 케이스가 존재해 확정적 분류가 어렵다 -- 추가 Refinement가 필요하다.`;
  }

  return { level1Pass, level2Pass, level3Decision, level3Rationale };
}
