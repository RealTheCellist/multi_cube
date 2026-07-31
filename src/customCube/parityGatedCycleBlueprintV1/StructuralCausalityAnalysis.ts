// --- StructuralCausalityAnalysis (Solver Primitive Discovery Sprint #6
// -- Parity-Gated Cycle Blueprint Sprint v1, STEP2) --------------------------
// Directive: "parity/cycle/dependency 중 무엇이 원인인가, 혹은 둘 이상의
// 상호작용인가 -- 각 Feature를 하나씩 제거하는 Ablation Analysis." No solve()
// calls anywhere in this file -- purely a statistical comparison over
// already-computed structural features (StructuralFeatureExtractionV4 +
// GraphTopologyAnalysis, both unmodified, both reused).
//
// Operationalization: for each candidate feature F,
//   coverage(F)   = fraction of the Unknown(53) population that HAS F
//   baseline(F)   = fraction of the full 142-case population that has F
//   lift(F)       = coverage(F) / baseline(F) -- how over-represented F is
//                   in Unknown vs the general population (>1 = enriched)
//   ablationGap(F)= 1 - coverage(F) -- the fraction of Unknown that would
//                   remain UNEXPLAINED if F were the sole causal axis
//                   (directly answers "ablate this feature -- what's left?")
// A single feature with coverage near 100% and ablationGap near 0 is a
// strong standalone causal candidate. A feature with high coverage but
// unremarkable lift (baseline also high) is common but not distinctive.
// Interaction terms (feature AND feature) test the Directive's own
// "둘 이상의 상호작용인가" question directly.
import { loadRawHoleDataset } from "../mechanismAnalysis/RawDatasetLoader";
import { extractFeatures, type StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import { computeGraphTopology, type GraphTopologyFeatures } from "../deepCycleSubtypeDiscoveryV1/GraphTopologyAnalysis";
import type { UnknownCase } from "./UnknownPopulationProfiling";

const RAW_DATASET_V4_PATH = "src/customCube/solverPrimitiveDiscovery4/data/raw-dataset-v4-holes.json";

type CombinedFeatures = StructuralFeatureSetV4 & GraphTopologyFeatures;

export interface CausalFeatureSpec {
  name: string;
  test: (f: CombinedFeatures) => boolean;
}

export const CAUSAL_FEATURE_SPECS: CausalFeatureSpec[] = [
  { name: "parityState", test: (f) => f.parityState },
  { name: "cycleCount>=2(dependencyDepth proxy)", test: (f) => f.cycleCount >= 2 },
  { name: "cycleLength>=4", test: (f) => f.cycleLength >= 4 },
  { name: "conflictEdgeCount===0", test: (f) => f.conflictEdgeCount === 0 },
  { name: "articulationPointCount===0(single biconnected block)", test: (f) => f.articulationPointCount === 0 },
  { name: "componentCount===1", test: (f) => f.componentCount === 1 },
  { name: "parityState AND cycleCount>=2", test: (f) => f.parityState && f.cycleCount >= 2 },
  { name: "parityState AND cycleLength>=4", test: (f) => f.parityState && f.cycleLength >= 4 },
  { name: "parityState AND conflictEdgeCount===0", test: (f) => f.parityState && f.conflictEdgeCount === 0 },
  { name: "parityState AND cycleCount>=2 AND conflictEdgeCount===0", test: (f) => f.parityState && f.cycleCount >= 2 && f.conflictEdgeCount === 0 },
];

export interface CausalFeatureResult {
  name: string;
  coverageInUnknown: number;
  baselineInFullPopulation: number;
  lift: number;
  ablationGap: number; // 1 - coverageInUnknown
}

export function analyzeCausalFeatures(unknownCases: readonly UnknownCase[]): CausalFeatureResult[] {
  const allHoles = loadRawHoleDataset(RAW_DATASET_V4_PATH);
  const baselineCombined: CombinedFeatures[] = allHoles.map((h) => ({ ...extractFeatures(h), ...computeGraphTopology(h.cubies) }));
  const unknownCombined: CombinedFeatures[] = unknownCases.map((c) => ({ ...c.features, ...c.topology }));

  return CAUSAL_FEATURE_SPECS.map((spec) => {
    const coverageInUnknown = unknownCombined.filter(spec.test).length / unknownCombined.length;
    const baselineInFullPopulation = baselineCombined.filter(spec.test).length / baselineCombined.length;
    const lift = baselineInFullPopulation > 0 ? coverageInUnknown / baselineInFullPopulation : Infinity;
    return { name: spec.name, coverageInUnknown, baselineInFullPopulation, lift, ablationGap: 1 - coverageInUnknown };
  });
}
