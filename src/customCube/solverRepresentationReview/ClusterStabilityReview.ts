// --- ClusterStabilityReview (Solver Representation Revalidation Sprint v1)
// STEP4: re-measures Cluster 안정성 on the now-150-replay Dataset --
// Dataset Expansion Sprint v2 explicitly left this UNMEASURED (cost +
// "not a function of Dataset size" per Roadmap Sprint's own finding).
// This Sprint tests that claim directly by reusing
// `evaluateDatasetAdequacy()` (solverV3Research/FailureDatasetAdequacy.ts,
// existing/unmodified) -- the SAME multi-run Hard-Gap-classification-
// agreement measurement Solver v3 Kickoff's own STEP0 Gate used, just
// pointed at the current (150-replay) failures.json instead of the
// original 75.
import { evaluateDatasetAdequacy, type GateVerdict } from "../solverV3Research/FailureDatasetAdequacy";

// Cited from Solver v3 Kickoff's own committed STEP0 Gate run
// (solverV3Research/data/kickoff-report.txt).
export const CLUSTER_STABILITY_AT_75 = 0.885;

export interface ClusterStabilityReviewResult {
  before75: number;
  after150: number;
  delta: number;
  direction: "MAINTAINED_OR_IMPROVED" | "DEGRADED";
  gateVerdict: GateVerdict;
  verdict: string;
}

export function reviewClusterStability(failuresDbPath: string): ClusterStabilityReviewResult {
  const gateVerdict = evaluateDatasetAdequacy(failuresDbPath);
  const after150 = gateVerdict.metrics.clusterStabilityRate;
  const delta = after150 - CLUSTER_STABILITY_AT_75;
  const direction: ClusterStabilityReviewResult["direction"] = delta >= -0.02 ? "MAINTAINED_OR_IMPROVED" : "DEGRADED"; // small negative tolerance -- this is a noisy, randomness-driven metric

  const verdict =
    direction === "MAINTAINED_OR_IMPROVED"
      ? `Cluster 안정성 ${(CLUSTER_STABILITY_AT_75 * 100).toFixed(1)}% -> ${(after150 * 100).toFixed(1)}% -- Dataset Roadmap Sprint의 예측(Dataset 크기와 무관, Primitive 내부 randomness의 함수)이 실측으로도 확인됐다: 크기가 2배가 됐지만 안정성은 유지/소폭 변화 수준이다.`
      : `Cluster 안정성 ${(CLUSTER_STABILITY_AT_75 * 100).toFixed(1)}% -> ${(after150 * 100).toFixed(1)}% -- 예상보다 크게 하락했다. Dataset 크기와 무관하다는 Roadmap Sprint의 가정을 재검토할 필요가 있다.`;

  return { before75: CLUSTER_STABILITY_AT_75, after150, delta, direction, gateVerdict, verdict };
}
