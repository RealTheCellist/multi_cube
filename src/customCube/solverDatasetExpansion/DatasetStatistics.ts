// --- DatasetStatistics (Solver Failure Dataset Expansion Sprint v2) ------
// STEP5a: computes Dataset 크기/Shape 재등장률/Singleton 비율/평균 Group
// Size/Shannon Entropy/Hard Gap 비율 -- reusing solverDatasetResearch's
// already-defined, reusable metric functions (histogramOf,
// computeShannonEntropy, existing/unmodified) rather than reimplementing
// them. Cluster 안정성 is NOT recomputed here (Dataset Roadmap Sprint's
// own finding: it's a function of Primitive-internal randomness, not
// Dataset size -- recomputing it costs ~10 minutes for a metric this
// Sprint's own prior research already showed won't move with N).
import { histogramOf } from "../solverDatasetResearch/DatasetBiasReport";
import { computeShannonEntropy } from "../solverDatasetResearch/ReplayDiversityAnalysis";
import type { ReplayMetadata } from "./MetadataBuilder";

export interface DatasetSnapshot {
  size: number;
  shapeReentryRate: number; // Coarse Shape
  singletonRate: number; // Coarse Shape
  avgGroupSize: number; // Coarse Shape
  shannonEntropyBits: number; // over Coarse Shape distribution
  hardGapRate: number;
  clusterStabilityCitedValue: number; // not recomputed -- cited from Solver v3 Kickoff (88.5%)
}

export function computeDatasetSnapshot(metadata: readonly ReplayMetadata[]): DatasetSnapshot {
  const shapeKeys = metadata.map((m) => m.coarseShapeKey);
  const hist = histogramOf(shapeKeys.map((k) => ({ k })), (x) => x.k);
  const singletonGroups = hist.filter((h) => h.count === 1).length;
  const multiMemberReplays = shapeKeys.filter((k) => (hist.find((h) => h.bucketLabel === k)?.count ?? 0) >= 2).length;

  const entropy = computeShannonEntropy(hist);
  const hardGapCount = metadata.filter((m) => m.isHardGap).length;

  return {
    size: metadata.length,
    shapeReentryRate: metadata.length ? multiMemberReplays / metadata.length : 0,
    singletonRate: hist.length ? singletonGroups / hist.length : 0,
    avgGroupSize: hist.length ? metadata.length / hist.length : 0,
    shannonEntropyBits: entropy.bits,
    hardGapRate: metadata.length ? hardGapCount / metadata.length : 0,
    clusterStabilityCitedValue: 0.885,
  };
}
