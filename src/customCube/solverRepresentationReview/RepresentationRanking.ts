// --- RepresentationRanking (Solver Representation Revalidation Sprint v1)
// STEP6: ranks the 3 representations on 6 axes, grounded in STEP1~5's own
// real numbers. Computes Shannon entropy for Exact/Coarse Shape directly
// (cheap -- no BP-1/2/3 testing needed, unlike Capability Fingerprint,
// which already exposes its own entropyBits from STEP3).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { histogramOf } from "../solverDatasetResearch/DatasetBiasReport";
import { computeShannonEntropy } from "../solverDatasetResearch/ReplayDiversityAnalysis";
import type { ExactShapeReviewResult } from "./ExactShapeReview";
import type { CoarseShapeReviewResult } from "./CoarseShapeReview";
import type { CapabilityFingerprintReviewResult } from "./CapabilityFingerprintReview";
import type { GeneralizationAssessment } from "./RepresentationGeneralizationReport";

export type PrimitiveDesignFit = "HIGH" | "MEDIUM" | "LOW";

export interface RepresentationScore {
  representation: string;
  singletonDecreasePercentagePoints: number; // vs 75-replay baseline, positive = improvement
  avgGroupSize: number;
  lookupFeasible: boolean;
  entropyBits: number; // lower = more reuse/repetition (per this project's own established framing)
  primitiveDesignFit: PrimitiveDesignFit;
  generalizationStatus: GeneralizationAssessment["generalizationStatus"];
  overallRank: number; // 1 = best
}

export function rankRepresentations(
  failuresDbPath: string,
  exact: ExactShapeReviewResult,
  coarse: CoarseShapeReviewResult,
  fingerprint: CapabilityFingerprintReviewResult,
  generalization: readonly GeneralizationAssessment[],
): RepresentationScore[] {
  const all150 = loadAll75(failuresDbPath).map((s) => deserializeCube(s.cubeState));
  const exactEntropy = computeShannonEntropy(histogramOf(all150.map((c) => ({ k: computeCycleShape(c).shapeKey })), (x) => x.k)).bits;
  const coarseEntropy = computeShannonEntropy(histogramOf(all150.map((c) => ({ k: computeCoarseShapeKey(c) })), (x) => x.k)).bits;

  const genByName = new Map(generalization.map((g) => [g.representation, g.generalizationStatus]));

  const scores: RepresentationScore[] = [
    {
      representation: "Exact Shape Key (BP-4)",
      singletonDecreasePercentagePoints: (exact.before.singletonRate - exact.after.singletonRate) * 100,
      avgGroupSize: exact.after.avgGroupSize,
      lookupFeasible: exact.crossesLookupThreshold,
      entropyBits: exactEntropy,
      primitiveDesignFit: "LOW", // still fine-grained, doesn't differentiate still-hard states meaningfully (Solver v3 Kickoff's own original finding)
      generalizationStatus: genByName.get("Exact Shape Key (BP-4)") ?? "STILL_INADEQUATE",
      overallRank: 0,
    },
    {
      representation: "Coarse Structural Shape",
      singletonDecreasePercentagePoints: (coarse.before75.singletonRate - coarse.after150.singletonRate) * 100,
      avgGroupSize: coarse.after150.avgGroupSize,
      lookupFeasible: coarse.crossesLookupThreshold,
      entropyBits: coarseEntropy,
      primitiveDesignFit: "HIGH", // Solver v3 Kickoff STEP3's own finding: still differentiates the "still hard" subset meaningfully, unlike Fingerprint
      generalizationStatus: genByName.get("Coarse Structural Shape") ?? "STILL_INADEQUATE",
      overallRank: 0,
    },
    {
      representation: "Capability Fingerprint",
      singletonDecreasePercentagePoints: (fingerprint.before75.singletonRate - fingerprint.after150.singletonRate) * 100,
      avgGroupSize: fingerprint.after150.avgGroupSize,
      lookupFeasible: fingerprint.after150.avgGroupSize >= 2,
      entropyBits: fingerprint.entropyBits,
      primitiveDesignFit: fingerprint.concentrationPersists ? "LOW" : "MEDIUM", // collapses the hardest states into one group -- Solver v3 Kickoff's own diagnosed weakness
      generalizationStatus: genByName.get("Capability Fingerprint") ?? "STILL_INADEQUATE",
      overallRank: 0,
    },
  ];

  // Composite score -- Primitive Design Fit is the DOMINANT term, not a
  // minor tiebreaker. Disclosed correction made during this Sprint: an
  // earlier version of this formula weighted lookupFeasible/entropy far
  // more heavily than fit, which let Capability Fingerprint rank #1 purely
  // because its avg Group Size and entropy looked good -- but BOTH of
  // those numbers were driven by the SAME degenerate mechanism this
  // Sprint's own STEP3 flagged as bad (concentrationPersists: 34.7% of
  // the dataset collapsed into the single "000000000" bucket). A generic
  // entropy/avg-group-size formula cannot distinguish "healthy repetition
  // across meaningfully similar states" from "one meaningless catch-all
  // bucket for everything unsolved" -- only fit (already set from the
  // real, disclosed reasoning in each STEP1~3 review) captures that
  // distinction, so it must dominate the score, not the other way around.
  const fitScore = (fit: PrimitiveDesignFit) => (fit === "HIGH" ? 10 : fit === "MEDIUM" ? 5 : 0);
  const composite = (s: RepresentationScore) => fitScore(s.primitiveDesignFit) + (s.lookupFeasible ? 2 : 0) + s.singletonDecreasePercentagePoints / 20 - s.entropyBits / 10;

  const ranked = [...scores].sort((a, b) => composite(b) - composite(a));
  ranked.forEach((s, i) => {
    s.overallRank = i + 1;
  });

  return scores.sort((a, b) => a.overallRank - b.overallRank);
}
