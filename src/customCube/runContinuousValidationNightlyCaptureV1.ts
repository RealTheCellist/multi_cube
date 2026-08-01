// Continuous Validation Framework Sprint v1 -- nightly capture driver.
//
// Usage:
//   npx tsx .../runContinuousValidationNightlyCaptureV1.ts <runId>
//
// Runs ONE real Nightly Validation pass and writes it to data/<runId>.json.
// This is the actual unit of work a real recurring scheduler would invoke
// -- this Sprint runs it manually 1 additional time (run3) to seed the
// Regression Dashboard with a 3rd real data point alongside run1/run2
// reused from the Long-term Reliability Validation Sprint.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { runNightlyValidation } from "./solverContinuousValidationFrameworkV1/NightlyValidationRunner";

const DATA_DIR = "src/customCube/solverContinuousValidationFrameworkV1/data";

function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error("usage: <runId>");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[${runId}] Loading Hole Dataset (n=142)...`);
  const holes = loadRawHoleDataset();

  console.log(`[${runId}] Running Nightly Validation (real solve() E2E population replay)...`);
  const result = runNightlyValidation(holes, runId);
  console.log(`[${runId}] improvedCount=${result.improvedCount}, solvedCount=${result.solvedCount}, runtimeP95Ms=${result.runtimeP95Ms}, deadlineMissCount=${result.deadlineMissCount}`);

  fs.writeFileSync(`${DATA_DIR}/${runId}.json`, JSON.stringify(result, null, 2), "utf-8");
  console.log(`[${runId}] written: ${DATA_DIR}/${runId}.json`);
}

main();
