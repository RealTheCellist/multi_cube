// Solver Long-term Reliability Validation Sprint v1 -- capture driver.
//
// Usage:
//   npx tsx .../runLongTermReliabilityCaptureV1.ts <run1|run2>
//
// Runs one full, real, independent 142-case population replay (real
// solve() E2E, recoveryReserveMsOverride=250ms production default) and
// writes it to data/<run>.json. Called twice (run1, run2) to produce two
// independent real time-points under the current frozen production code,
// per TestDesign.ts's own disclosed methodology.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { runPopulationReplay } from "./solverLongTermReliabilityValidationV1/PopulationReplay";

const DATA_DIR = "src/customCube/solverLongTermReliabilityValidationV1/data";

function main() {
  const run = process.argv[2];
  if (run !== "run1" && run !== "run2") throw new Error("usage: <run1|run2>");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[${run}] Loading Hole Dataset (n=142)...`);
  const holes = loadRawHoleDataset();

  console.log(`[${run}] Running real population replay (recoveryReserveMsOverride=250ms)...`);
  const startedAt = new Date().toISOString();
  const rows = runPopulationReplay(holes);
  const finishedAt = new Date().toISOString();

  const improvedCount = rows.filter((r) => r.result.improved).length;
  const solvedCount = rows.filter((r) => r.result.solved).length;
  const trueRegressionCount = rows.filter((r) => r.result.wrongWingAfter > r.result.wrongWingBefore).length;
  console.log(`[${run}] improvedCount=${improvedCount}, solvedCount=${solvedCount}, trueRegressionCount=${trueRegressionCount}`);

  fs.writeFileSync(`${DATA_DIR}/${run}.json`, JSON.stringify({ run, startedAt, finishedAt, rows }, null, 2), "utf-8");
  console.log(`[${run}] written: ${DATA_DIR}/${run}.json`);
}

main();
