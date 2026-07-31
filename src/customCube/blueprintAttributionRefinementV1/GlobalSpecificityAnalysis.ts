// --- GlobalSpecificityAnalysis (Solver Primitive Discovery Sprint #4 --
// Blueprint Attribution Refinement Sprint v1, STEP2/3) -----------------------
// Computes each Blueprint's global match rate over the FULL 142-case
// population (not just a single ambiguous cluster) -- this is the
// "specificity" signal STEP3's counterfactual reasoning relies on: within
// any one Feature-Similarity cluster every member is structurally
// identical on the bucketed key (confirmed: matchRatesByBlueprint is
// always exactly 0 or 1, never fractional, for every one of Discovery
// Sprint #4's 49 clusters), so there is no within-cluster population split
// to exploit -- the disambiguating signal has to come from how RESTRICTIVE
// each tied Blueprint's full precondition is across the whole population.
// A Blueprint whose precondition is satisfied by a LARGE fraction of all
// 142 holes is a weak, low-specificity match (its gate does little
// filtering); one satisfied by only a SMALL fraction is highly specific --
// per Occam's-razor-style reasoning already used elsewhere in this arc
// (e.g. CycleIsolationSubtypes.ts's PURE_STRUCTURAL_ISOLATION vs
// BUDGET_RECOVERABLE split), the rarer/more restrictive match is the more
// credible originating mechanism when two Blueprints are tied on one
// cluster.
//
// Reuses mechanismAnalysis/RawDatasetLoader.ts's loadRawHoleDataset()
// (accepts a path override) to load Discovery Sprint #4's own regenerated
// raw-dataset-v4-holes.json, and solverPrimitiveDiscovery4/
// StructuralFeatureExtractionV4.ts's extractAllFeatures() -- both
// unmodified. No solve() calls; pure in-memory graph analysis, same as
// Discovery Sprint #4's own STEP3.
import { loadRawHoleDataset } from "../mechanismAnalysis/RawDatasetLoader";
import { extractAllFeatures } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import type { HoleCaseV4 } from "../solverPrimitiveDiscovery4/HoleCollectionV4";
import { BLUEPRINT_GATES, evaluateFullPrecondition, evaluateAblatedPrecondition, type BlueprintGateSpec } from "./BlueprintGateDefinitions";

export const DISCOVERY4_RAW_DATASET_PATH = "src/customCube/solverPrimitiveDiscovery4/data/raw-dataset-v4-holes.json";

export interface BlueprintGlobalSpecificity {
  name: string;
  conditionCount: number;
  globalMatchCount: number;
  globalMatchRate: number; // fraction of the full 142-population satisfying the FULL precondition
  specificity: number; // 1 - globalMatchRate; higher = rarer/more restrictive = more credible when tied
  conditionRestrictiveness: { conditionName: string; ablatedMatchRate: number; restrictiveness: number }[]; // restrictiveness = ablatedMatchRate - globalMatchRate
}

export function computeGlobalSpecificity(populationSize: number): BlueprintGlobalSpecificity[] {
  const holes = loadRawHoleDataset(DISCOVERY4_RAW_DATASET_PATH) as unknown as HoleCaseV4[];
  const features = extractAllFeatures(holes);

  return BLUEPRINT_GATES.map((gate: BlueprintGateSpec) => {
    const globalMatchCount = features.filter((f) => evaluateFullPrecondition(gate, f)).length;
    const globalMatchRate = globalMatchCount / populationSize;

    const conditionRestrictiveness = gate.conditions.map((c) => {
      const ablatedMatchCount = features.filter((f) => evaluateAblatedPrecondition(gate, c.name, f)).length;
      const ablatedMatchRate = ablatedMatchCount / populationSize;
      return { conditionName: c.name, ablatedMatchRate, restrictiveness: ablatedMatchRate - globalMatchRate };
    });

    return {
      name: gate.name,
      conditionCount: gate.conditions.length,
      globalMatchCount,
      globalMatchRate,
      specificity: 1 - globalMatchRate,
      conditionRestrictiveness,
    };
  });
}
