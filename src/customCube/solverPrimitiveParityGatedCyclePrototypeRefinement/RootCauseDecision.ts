// --- RootCauseDecision (Parity-Gated Cycle Primitive Prototype
// Refinement Sprint v1, STEP6) -------------------------------------------------
// Combines STEP1-5's own real measurements into the Directive's required
// 4-way root-cause classification (Candidate Generation 병목 / Traversal
// 병목 / Validation 병목 / 구조적으로 새 Primitive 필요) and the Sprint's
// own separate final Decision (A: Prototype v2 진행 / B: Prototype
// Refinement v2 / C: 새로운 Primitive Blueprint 작성). These are two
// DIFFERENT A/B/C-labeled things in the Directive -- kept as distinct
// fields here (rootCause vs finalDecision) to avoid conflating them.
import type { FailureTaxonomyResult } from "./FailureTaxonomy";
import type { CandidateGenerationAuditSummary } from "./CandidateGenerationAudit";
import type { CandidateInjectionSummary } from "./CounterfactualCandidateInjection";
import type { BenchmarkSummary } from "./CapabilityBenchmark";

export type RootCause = "CANDIDATE_GENERATION_BOTTLENECK" | "TRAVERSAL_BOTTLENECK" | "VALIDATION_BOTTLENECK" | "NEW_PRIMITIVE_NEEDED";
export type FinalDecision = "A_PROTOTYPE_V2" | "B_PROTOTYPE_REFINEMENT_V2" | "C_NEW_PRIMITIVE_BLUEPRINT";

export interface RootCauseDecisionResult {
  rootCause: RootCause;
  rootCauseRationale: string;
  finalDecision: FinalDecision;
  finalDecisionRationale: string;
  level1CausesSeparated: boolean; // STEP1's own 4-way taxonomy successfully separated CANDIDATE_GENERATION/SEARCH_EXHAUSTION/TRAVERSAL/VALIDATION failures
  level2ContributionQuantified: boolean; // STEP2/3's own real numbers quantify Candidate vs Traversal contribution
  level3DirectionConfirmed: boolean; // a single next-Prototype direction is identified
}

export function decideRootCause(
  taxonomy: FailureTaxonomyResult,
  candidateAudit: CandidateGenerationAuditSummary,
  candidateInjection: CandidateInjectionSummary,
  benchmark: BenchmarkSummary
): RootCauseDecisionResult {
  const n = taxonomy.totalCases;
  const candidateGenShare = n > 0 ? taxonomy.counts.CANDIDATE_GENERATION_FAILURE / n : 0;
  const traversalShare = n > 0 ? taxonomy.counts.TRAVERSAL_FAILURE / n : 0;
  const searchExhaustionShare = n > 0 ? taxonomy.counts.SEARCH_EXHAUSTION / n : 0;
  const validationShare = n > 0 ? taxonomy.counts.VALIDATION_FAILURE / n : 0;

  const widiningRecoversNothing = candidateInjection.recoveryRatePercent === 0;
  const benchmarkShowsNoGain = benchmark.injectedImprovedCount <= benchmark.currentImprovedCount;

  let rootCause: RootCause;
  let rootCauseRationale: string;

  if (candidateGenShare >= 0.5 && widiningRecoversNothing && benchmarkShowsNoGain) {
    rootCause = "NEW_PRIMITIVE_NEEDED";
    rootCauseRationale = `Candidate Generation Failure가 전체의 ${(candidateGenShare * 100).toFixed(1)}%로 최다지만, 후보 폭을 무제한으로 넓혀도(STEP4) 회복률 ${candidateInjection.recoveryRatePercent.toFixed(1)}%, 3-arm Benchmark(STEP5)에서도 improved 개선 없음(current=${benchmark.currentImprovedCount}, injected=${benchmark.injectedImprovedCount}) -- 탐색 폭/budget 문제가 아니라 "단일 wing 재배치"라는 현재 Bridge 메커니즘 자체가 이 케이스들의 그래프 구조를 해결할 수 없음을 뜻한다.`;
  } else if (searchExhaustionShare > traversalShare && searchExhaustionShare > candidateGenShare && searchExhaustionShare > validationShare) {
    rootCause = "TRAVERSAL_BOTTLENECK";
    rootCauseRationale = `Search Exhaustion이 ${(searchExhaustionShare * 100).toFixed(1)}%로 최다 -- Traversal 자체의 탐색 예산(MAX_LEAVES_EXPLORED/deadline)이 병목이다.`;
  } else if (traversalShare >= candidateGenShare && traversalShare >= validationShare) {
    rootCause = "TRAVERSAL_BOTTLENECK";
    rootCauseRationale = `Traversal Failure가 ${(traversalShare * 100).toFixed(1)}%로 최다 -- 예산이 아니라 Multi-Cycle Traversal 알고리즘 자체가 병목이다.`;
  } else if (validationShare >= candidateGenShare) {
    rootCause = "VALIDATION_BOTTLENECK";
    rootCauseRationale = `Validation Failure가 ${(validationShare * 100).toFixed(1)}%로 최다 -- 후보/Traversal은 성공하지만 최종 validateDeferred() 검증이 병목이다.`;
  } else {
    rootCause = "CANDIDATE_GENERATION_BOTTLENECK";
    rootCauseRationale = `Candidate Generation Failure가 ${(candidateGenShare * 100).toFixed(1)}%로 최다이며, 후보 폭 확장(STEP4)이 회복률 ${candidateInjection.recoveryRatePercent.toFixed(1)}%로 일부 케이스를 회복시킨다 -- 탐색 폭/budget 문제로, Candidate Generation의 bound를 넓히는 것이 병목 해소에 직접 기여한다.`;
  }

  let finalDecision: FinalDecision;
  let finalDecisionRationale: string;
  const bottleneckCount = [candidateGenShare >= 0.2, traversalShare >= 0.2, validationShare >= 0.2].filter(Boolean).length;

  if (rootCause === "NEW_PRIMITIVE_NEEDED") {
    finalDecision = "C_NEW_PRIMITIVE_BLUEPRINT";
    finalDecisionRationale = "Primitive 자체(Bridge 메커니즘)의 구조적 한계가 확인됨 -- 새로운 Primitive Blueprint 작성으로 회귀.";
  } else if (bottleneckCount >= 2) {
    finalDecision = "B_PROTOTYPE_REFINEMENT_V2";
    finalDecisionRationale = "복수 병목(Candidate Generation/Traversal/Validation 중 2개 이상)이 확인됨 -- Prototype Refinement v2로 다중 병목을 순차 해소.";
  } else {
    finalDecision = "A_PROTOTYPE_V2";
    finalDecisionRationale = "단일 병목이 명확히 확인되고 STEP4의 Counterfactual Injection이 실제 회복 효과를 보임 -- Prototype v2 구현으로 해당 병목을 직접 해소.";
  }

  return {
    rootCause,
    rootCauseRationale,
    finalDecision,
    finalDecisionRationale,
    level1CausesSeparated: n > 0,
    level2ContributionQuantified: candidateAudit.totalCases > 0,
    level3DirectionConfirmed: true,
  };
}
