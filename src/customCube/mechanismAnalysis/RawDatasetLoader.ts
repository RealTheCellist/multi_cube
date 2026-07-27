// --- RawDatasetLoader (State Taxonomy Sprint v2: Structural Mechanism
// Analysis) ------------------------------------------------------------
// Loads the regenerated raw-dataset-v1-holes.json (produced by the now-
// fixed runCoverageHoleDiscoverySprintV1.ts driver) back into HoleCase[]
// with real Cubie[] states (both final and original pre-pipeline).
import * as fs from "fs";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const RAW_DATASET_PATH = "src/customCube/coverageAtlas/data/raw-dataset-v1-holes.json";

interface SerializedHoleCaseOnDisk extends Omit<HoleCase, "cubies" | "originalCubies"> {
  cubiesJson: string;
  originalCubiesJson: string;
}

export function loadRawHoleDataset(path: string = RAW_DATASET_PATH): HoleCase[] {
  const raw: SerializedHoleCaseOnDisk[] = JSON.parse(fs.readFileSync(path, "utf-8"));
  return raw.map((r) => {
    const { cubiesJson, originalCubiesJson, ...rest } = r;
    return { ...rest, cubies: deserializeCube(cubiesJson), originalCubies: deserializeCube(originalCubiesJson) };
  });
}
