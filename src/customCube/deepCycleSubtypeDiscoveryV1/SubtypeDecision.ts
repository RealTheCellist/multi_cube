// --- SubtypeDecision (Deep Cycle Subtype Discovery Sprint v1, STEP5) ------
// Directive's own success criteria:
//   PASS = 30 cases stably split into >=2 subtypes
//   FAIL = stays one mechanism
// Decision A (Subtype found -> Deep Cycle Refinement v2, per-subtype Gate)
// Decision B (No subtype -> BoundedResolver at current optimization limit)
//
// "Stably" is operationalized as: >=2 of the 3 independent clustering
// methods (STEP2) each find >=2 significant (n>=3) clusters, AND those
// clusters show a MEANINGFUL behavioral divergence (STEP4) -- i.e. the
// structural split is not just cosmetic, it predicts a real difference in
// which Gate configs rescue which cases.
import type { Cluster } from "./ClusteringMethods";
import { countSignificantClusters, hasMeaningfulDivergence, type BehavioralDivergence } from "./SubtypeStabilityAnalysis";

export interface SubtypeDecisionInput {
  structuralTaxonomyClusters: Cluster[];
  featureSimilarityClusters: Cluster[];
  graphTopologyClusters: Cluster[];
  pairwiseAgreementAvg: number;
  divergences: BehavioralDivergence[]; // computed over featureSimilarityClusters (the primary k=2 split)
}

export interface SubtypeDecisionResult {
  methodsWithMultipleSignificantClusters: number; // out of 3
  meaningfulDivergence: boolean;
  pass: boolean;
  decision: "A" | "B";
  rationale: string;
}

export function decideSubtype(input: SubtypeDecisionInput): SubtypeDecisionResult {
  const counts = [countSignificantClusters(input.structuralTaxonomyClusters), countSignificantClusters(input.featureSimilarityClusters), countSignificantClusters(input.graphTopologyClusters)];
  const methodsWithMultipleSignificantClusters = counts.filter((c) => c >= 2).length;
  const meaningfulDivergence = hasMeaningfulDivergence(input.divergences);

  const pass = methodsWithMultipleSignificantClusters >= 2 && meaningfulDivergence;
  const decision: "A" | "B" = pass ? "A" : "B";

  const rationale = pass
    ? `${methodsWithMultipleSignificantClusters}/3 클러스터링 방법이 유의미한(n>=3) 클러스터를 2개 이상 찾았고, 그 클러스터들이 실제로 서로 다른 Gate rescue rate를 보였다(최대 divergence >= 30%p) -- 구조적 분할이 행동적으로도 실재한다.`
    : `${methodsWithMultipleSignificantClusters}/3 클러스터링 방법만 유의미한 클러스터를 2개 이상 찾았거나(${methodsWithMultipleSignificantClusters < 2 ? "구조적 분할 자체가 불안정" : "구조는 나뉘지만"}), 클러스터 간 Gate rescue rate 차이가 30%p 미만이다 -- ${methodsWithMultipleSignificantClusters >= 2 ? "구조는 나뉘어도 행동은 사실상 동일" : "안정적인 2개 이상 subtype을 찾지 못함"} -- 단일 메커니즘으로 취급하는 것이 타당하다.`;

  return { methodsWithMultipleSignificantClusters, meaningfulDivergence, pass, decision, rationale };
}
