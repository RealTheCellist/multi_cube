// --- MechanismGapAnalysis (PURE_CYCLE_ISOLATION Structural Mechanism
// Analysis Sprint v1, Deliverable #4) -----------------------------------------
import type { SharedFailureSummary } from "./FailureMechanismMatrix";
import type { SubtypeSummary } from "./SubtypeDiscovery";

export interface MechanismGapSpec {
  currentlyPossible: string;
  currentlyImpossible: string;
  commonFailureCondition: string;
  representativeCases: string[];
}

export function buildMechanismGapSpec(sharedFailure: SharedFailureSummary, subtypes: SubtypeSummary[]): MechanismGapSpec {
  const dead = subtypes.find((s) => s.subtype === "DEAD_CYCLE");
  const locked = subtypes.find((s) => s.subtype === "LOCKED_CYCLE");
  const representative = subtypes.flatMap((s) => s.labels).slice(0, 8);

  return {
    currentlyPossible: `BP-1(폭 2)과 CCR(폭 3) 모두, 동일한 cycle 순회 순서(analyzeMultiCycle 공유)를 따라 매 hop마다 실제 존재하는 이동 후보로 branch하는 bounded DFS를 수행할 수 있다 -- 평균 ${sharedFailure.avgBp1LeavesExplored.toFixed(
      1
    )}(BP-1)/${sharedFailure.avgCcrLeavesExplored.toFixed(1)}(CCR) leaf, 평균 깊이 ${sharedFailure.avgBp1MaxDepth.toFixed(1)}/${sharedFailure.avgCcrMaxDepth.toFixed(1)}까지 도달 가능.`,
    currentlyImpossible: `${dead?.n ?? 0}건(DEAD_CYCLE)은 두 메커니즘 모두 SEARCH_EXHAUSTED로 종료 -- 존재하는 모든 이동 후보를 다 시도해도 net-improving한 leaf가 하나도 없다는 뜻이며, 이는 폭(2 vs 3)이나 시간이 아니라 enumerateWingCandidates()가 이 특정 순열에 제공하는 이동 자체의 근본적 부족(representational gap)을 시사한다. ${
      locked?.n ?? 0
    }건(LOCKED_CYCLE)은 leaf cap에 걸려 탐색 자체가 완결되지 못했다 -- 이 부분집합은 원칙적으로 더 넓은/깊은 탐색이 도움이 될 수 있다.`,
    commonFailureCondition: `공통 종료 원인 일치율: ${sharedFailure.sameTerminationReasonCount}/${sharedFailure.totalCases}건에서 BP-1과 CCR이 동일한 terminationReason으로 종료 -- 두 메커니즘이 폭(2 vs 3)만 다를 뿐 근본적으로 같은 이동 후보 풀에서 탐색하기 때문에 실패 양상도 수렴한다는 실측 증거.`,
    representativeCases: representative,
  };
}
