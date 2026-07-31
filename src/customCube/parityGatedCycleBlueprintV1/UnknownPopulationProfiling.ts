// --- UnknownPopulationProfiling (Solver Primitive Discovery Sprint #6 --
// Parity-Gated Cycle Blueprint Sprint v1, STEP1) -----------------------------
// Directive: "새 Dataset을 만들지 않는다." Loads the TRULY_UNKNOWN label set
// directly from Unresolved Mechanism Validation Sprint v1's own result JSON
// (unmodified), then re-derives each case's Cubie[] from the SAME 142-case
// raw-dataset-v4-holes.json this whole Refinement track has already used
// (mechanismAnalysis/RawDatasetLoader, unmodified). Structural features
// reuse StructuralFeatureExtractionV4.extractFeatures() (unmodified) plus
// deepCycleSubtypeDiscoveryV1's GraphTopologyAnalysis.computeGraphTopology()
// (unmodified, generically applicable to ANY cubies -- not Deep-Cycle-
// specific despite its directory name) for articulationPoint/
// biconnectedComponent/cycleOverlap/cycleDensity/conflictAdjacentToCycle/
// pairGraphDensity.
import * as fs from "fs";
import { loadRawHoleDataset } from "../mechanismAnalysis/RawDatasetLoader";
import { extractFeatures, type StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import { computeGraphTopology, type GraphTopologyFeatures } from "../deepCycleSubtypeDiscoveryV1/GraphTopologyAnalysis";
import type { HoleCase } from "../solverPrimitiveDiscovery4/HoleCollectionV4";

const RAW_DATASET_V4_PATH = "src/customCube/solverPrimitiveDiscovery4/data/raw-dataset-v4-holes.json";
const UNRESOLVED_RESULT_PATH = "src/customCube/unresolvedMechanismValidationV1/data/unresolved-mechanism-validation-v1-result.json";

interface ClassificationRecord {
  label: string;
  sourceBlueprint: string;
  category: string;
}
interface UnresolvedResult {
  classifications: ClassificationRecord[];
}

export interface UnknownCase {
  label: string;
  sourceBlueprint: string;
  hole: HoleCase;
  features: StructuralFeatureSetV4;
  topology: GraphTopologyFeatures;
}

export function loadUnknownPopulation(): UnknownCase[] {
  const resultRaw: UnresolvedResult = JSON.parse(fs.readFileSync(UNRESOLVED_RESULT_PATH, "utf-8"));
  const unknownRecords = resultRaw.classifications.filter((c) => c.category === "TRULY_UNKNOWN");
  const unknownLabels = new Map(unknownRecords.map((r) => [r.label, r.sourceBlueprint]));

  const allHoles = loadRawHoleDataset(RAW_DATASET_V4_PATH);
  const cases: UnknownCase[] = [];
  for (const hole of allHoles) {
    const sourceBlueprint = unknownLabels.get(hole.label);
    if (!sourceBlueprint) continue;
    const features = extractFeatures(hole);
    const topology = computeGraphTopology(hole.cubies);
    cases.push({ label: hole.label, sourceBlueprint, hole, features, topology });
  }
  return cases;
}
