// --- RootCauseMatrix (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP6) -----------------------------------------------
// Classifies each of the 3 successMismatch cases into exactly ONE bucket,
// using STEP2(Attribution)/STEP3(Removal)/STEP5(Unlimited Replay)/STEP2
// addendum(ShortCircuitAudit) real evidence -- checked in the order that
// most directly falsifies each hypothesis first.
//
// SHORT_CIRCUIT_GAP is a 7th bucket ADDED to the Directive's own named 6
// (Budget/Scheduler/Candidate/Selection Competition, Primitive Failure,
// Unknown) after ShortCircuitAudit.ts's own real trace evidence surfaced a
// concrete mechanism none of those 6 names describe precisely: MCM is
// CHOSEN and its own moves already net-improve wrongWingCount (the same
// validateDeferred guarantee REPAIR/CCR/MIXED_COMMUTATOR/PARITY_GATED_CYCLE
// get), but attemptRecovery()'s own shortCircuitRepair fast path (read-only
// reference, fiveByFiveEdgeRecovery.ts, NOT modified this Sprint) never
// lists MULTI_COMPONENT_MERGE among the types it short-circuits -- so the
// genuinely-improving result can still be discarded by a later round's
// deadline `break` + the function's final `return [];`. This is honestly
// disclosed as a DISTINCT mechanism from "Primitive Failure"(MCM 자체 실패)
// since MCM did NOT fail here -- the surrounding Integration wiring did.
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { CaseAttribution } from "./CompetitionAttribution";
import type { CaseRemovalRow, RemovalConfig } from "./PrimitiveRemoval";
import type { UnlimitedReplayRow } from "./UnlimitedReplay";
import type { ShortCircuitAuditRow } from "./ShortCircuitAudit";

export type RootCauseBucket = "BUDGET_COMPETITION" | "SCHEDULER_COMPETITION" | "CANDIDATE_COMPETITION" | "SELECTION_COMPETITION" | "PRIMITIVE_FAILURE" | "SHORT_CIRCUIT_GAP" | "UNKNOWN";

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

export function classifyCase(
  attribution: CaseAttribution,
  removal: CaseRemovalRow,
  unlimited: UnlimitedReplayRow,
  comparative: ComparativeReference | undefined,
  shortCircuit?: ShortCircuitAuditRow
): RootCauseRow {
  if (shortCircuit?.shortCircuitGapDetected) {
    return {
      label: attribution.label,
      bucket: "SHORT_CIRCUIT_GAP",
      evidence: `실측 trace: MCM이 chooseBestRecovery에서 선택되고 자체 moves가 실제로 net-improve했음(wrongWing ${shortCircuit.wrongWingBefore}->${shortCircuit.wrongWingAfter}, "recovery-applied" 로그로 확인)에도, attemptRecovery()의 shortCircuitRepair 목록에 MULTI_COMPONENT_MERGE가 빠져 있어 이후 라운드의 deadline 초과로 개선분이 통째로 폐기됨(finalMoves.length=0). MCM 자체는 실패하지 않았다 -- Integration 배선(short-circuit 목록 누락)의 문제.`,
    };
  }

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
  comparativeByLabel: ReadonlyMap<string, ComparativeReference>,
  shortCircuits: readonly ShortCircuitAuditRow[] = []
): RootCauseRow[] {
  return attributions.map((a) => {
    const removal = removals.find((r) => r.label === a.label)!;
    const u = unlimited.find((r) => r.label === a.label)!;
    const sc = shortCircuits.find((r) => r.label === a.label);
    return classifyCase(a, removal, u, comparativeByLabel.get(a.label), sc);
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

  // SHORT_CIRCUIT_GAP counts as "fixable via Production Contract" alongside
  // the 4 named competition buckets -- it is a concrete, low-risk,
  // well-understood Integration wiring fix (add MULTI_COMPONENT_MERGE to
  // attemptRecovery()'s own shortCircuitRepair type list), not a deeper
  // Primitive/architecture limitation.
  const fixableBuckets: RootCauseBucket[] = ["BUDGET_COMPETITION", "SCHEDULER_COMPETITION", "CANDIDATE_COMPETITION", "SELECTION_COMPETITION", "SHORT_CIRCUIT_GAP"];
  const allCompetition = rows.every((r) => fixableBuckets.includes(r.bucket));
  const allPrimitiveFailure = rows.every((r) => r.bucket === "PRIMITIVE_FAILURE");
  const anyPrimitiveFailure = rows.some((r) => r.bucket === "PRIMITIVE_FAILURE");

  let level3Decision: FinalDecision;
  let level3Rationale: string;
  if (allCompetition) {
    level3Decision = "A_PRODUCTION_CONTRACT";
    level3Rationale = `3건 모두 Production Contract 수정으로 해결 가능한 원인(Budget/Scheduler/Candidate/Selection Competition 또는 Short-Circuit Gap)으로 분류됨 -- 경쟁 완화 또는 shortCircuitRepair 목록에 MULTI_COMPONENT_MERGE 추가 등으로 해결 가능성이 높다.`;
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
