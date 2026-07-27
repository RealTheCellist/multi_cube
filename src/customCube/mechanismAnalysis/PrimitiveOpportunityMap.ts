// --- PrimitiveOpportunityMap (State Taxonomy Sprint v2 STEP5) -------------
// Final deliverable: maps each confirmed TRUE-gap mechanism subtype from
// STEP1-3 onto a concrete named Primitive candidate + target + expected
// mechanism. Subtypes that turned out to be scheduling/budget-recoverable
// (not true gaps) are explicitly excluded here and routed to the parallel
// Planner Scheduling Investigation Sprint v1 instead -- this map is only
// for cases that genuinely need new Primitive Capability (Directive Goal
// 1/3), matching the whole Program's "Coverage Hole vs Planner" split from
// Coverage Hole Discovery Sprint v1.
import type { CycleIsolationSummary } from "./CycleIsolationSubtypes";
import type { ConflictCauseEffectSummary } from "./ConflictCauseEffect";
import type { ParityGatedSummary } from "./ParityGatedSplit";

export interface PrimitiveOpportunity {
  id: string;
  target: string;
  caseCount: number;
  expectedMechanism: string;
  priorArtNote?: string; // does relevant prototype work already exist in this research arc?
}

export function buildPrimitiveOpportunityMap(
  cycleIsolation: CycleIsolationSummary,
  conflictCauseEffect: ConflictCauseEffectSummary,
  parityGated: ParityGatedSummary
): PrimitiveOpportunity[] {
  const opportunities: PrimitiveOpportunity[] = [];

  const pureIsolation = cycleIsolation.subtypeCounts.PURE_STRUCTURAL_ISOLATION;
  if (pureIsolation > 0) {
    opportunities.push({
      id: "Primitive-Candidate-A",
      target: "Cycle Isolation / Pure Structural Isolation",
      caseCount: pureIsolation,
      expectedMechanism:
        "Deep Cycle Resolver -- 단일 컴포넌트 내 고립된 3+ cycle을 기존 primitive보다 더 깊은/다른 탐색 전략으로 직접 공략. 예산 확장으로는 안 풀리므로 새로운 탐색 알고리즘(단순 BFS 확장이 아닌 구조 자체가 다른 접근)이 필요.",
      priorArtNote: "solverV2Prototype/BoundedResolver.ts (BP-1)의 bounded multi-cycle DFS 접근을 재검토할 가치가 있음 -- 단, BP-1은 production에 통합되지 않은 상태.",
    });
  }

  const bridgeMissing = cycleIsolation.subtypeCounts.BRIDGE_MISSING + cycleIsolation.subtypeCounts.BRIDGE_MISSING_AND_BUDGET_RECOVERABLE;
  if (bridgeMissing > 0) {
    opportunities.push({
      id: "Primitive-Candidate-B",
      target: "Cycle Isolation / Bridge Missing",
      caseCount: bridgeMissing,
      expectedMechanism:
        "Bridge Injection -- WANTS-그래프의 분리된 두 컴포넌트를 연결할 조각이 없을 때, 두 컴포넌트 중 하나를 일부러 깨서(sacrifice) 다른 컴포넌트와 연결되는 새 WANTS 관계를 만드는 setup move.",
      priorArtNote: "solverPrimitivePrototype/MultiHopBridgePrototype.ts (Primitive Prototype Sprint v2)가 이미 'Multi-Hop Bridge'라는 이름으로 유사한 아이디어를 프로토타입했음 -- 재검토/재사용 우선 검토.",
    });
  }

  const preconditionConflict = conflictCauseEffect.verdictCounts.PRECONDITION;
  if (preconditionConflict > 0) {
    opportunities.push({
      id: "Primitive-Candidate-C",
      target: "Conflict Dominant / Precondition",
      caseCount: preconditionConflict,
      expectedMechanism:
        "Conflict-Breaking Sacrifice -- 원래부터 존재하던 one-sided WANTS 의존성을 깨기 위해, conflict의 target 슬롯을 의도적으로 흩뜨려 양방향 관계(cycle)로 전환한 뒤 정상 primitive로 해결.",
      priorArtNote: "solverPrimitivePrototype/ConflictDominantSacrificePrototype.ts (Primitive Prototype Sprint v2)가 정확히 이 이름으로 이미 프로토타입되어 있음 -- 재활용이 최우선 후보.",
    });
  }

  const trueGapParity = parityGated.verdictCounts.TRUE_GAP;
  if (trueGapParity > 0) {
    opportunities.push({
      id: "Primitive-Candidate-D",
      target: "Parity-Gated Cycle / True Gap",
      caseCount: trueGapParity,
      expectedMechanism:
        "Parity-Cycle Specialist -- PARITY_ALG를 다양한 setup move로 conjugate해 특정 cycle 형태에 맞춰 적용하는, parity와 cycle 구조를 동시에 고려하는 전용 primitive.",
      priorArtNote: "solverV2PrototypeBP2/ParityAwareResolver.ts (BP-2)가 이미 이 접근(48개 atomic fragment로 conjugate)을 프로토타입했음 -- 이 Sprint가 식별한 True Gap 집합에 대해 재벤치마크 우선 검토.",
    });
  }

  return opportunities;
}

export interface NonPrimitiveRecommendation {
  target: string;
  caseCount: number;
  recommendation: string;
}

export function buildNonPrimitiveRecommendations(
  cycleIsolation: CycleIsolationSummary,
  conflictCauseEffect: ConflictCauseEffectSummary,
  parityGated: ParityGatedSummary
): NonPrimitiveRecommendation[] {
  const recs: NonPrimitiveRecommendation[] = [];
  const budgetRecoverable = cycleIsolation.subtypeCounts.BUDGET_RECOVERABLE;
  if (budgetRecoverable > 0) {
    recs.push({
      target: "Cycle Isolation / Budget Recoverable",
      caseCount: budgetRecoverable,
      recommendation: "새 Primitive 불필요 -- 해당 케이스들에 한해 탐색 예산/우선순위 조정만으로 해결 가능. Budget Contract 재검토 대상.",
    });
  }
  const byproductConflict = conflictCauseEffect.verdictCounts.BYPRODUCT;
  if (byproductConflict > 0) {
    recs.push({
      target: "Conflict Dominant / Byproduct",
      caseCount: byproductConflict,
      recommendation: "새 Primitive 불필요 -- Pipeline 자체가 conflict를 만들어내는 것이므로 Task 순서/우선순위 조정(Planner 개선)으로 애초에 예방 가능할 수 있음. Planner Scheduling Investigation Sprint로 이관.",
    });
  }
  const recoveryRecoverable = parityGated.verdictCounts.RECOVERY_RECOVERABLE;
  const basePipelineRecoverable = parityGated.verdictCounts.BASE_PIPELINE_RECOVERABLE;
  const budgetRecoverableParity = parityGated.verdictCounts.BUDGET_RECOVERABLE;
  if (recoveryRecoverable + basePipelineRecoverable + budgetRecoverableParity > 0) {
    recs.push({
      target: "Parity-Gated Cycle / Scheduling-fixable",
      caseCount: recoveryRecoverable + basePipelineRecoverable + budgetRecoverableParity,
      recommendation: `새 Primitive 불필요 -- Recovery layer 트리거 문제(${recoveryRecoverable}건), 메인 파이프라인 순서 문제(${basePipelineRecoverable}건), 예산 문제(${budgetRecoverableParity}건)로 구성. Planner Scheduling Investigation Sprint의 핵심 대상.`,
    });
  }
  return recs;
}
