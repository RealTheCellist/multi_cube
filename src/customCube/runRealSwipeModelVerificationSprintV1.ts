// Cube Model Experiment -- Real Swipe Verification.
//   npx tsx src/customCube/runRealSwipeModelVerificationSprintV1.ts <turns.json>
//
// Reads (axis, layer, sign) turns that were actually decided by the real
// production swipe-gesture logic (customSwipeControls.ts, captured live via
// Playwright driving the real 3-face camera view -- see
// scratchpad capture_real_swipes.mjs) and, for each one independently,
// applies it to a fresh solved 3x3x3 on the production model and on all 3
// experimental models, then checks the resulting facelet map matches.
// This is deliberately NOT a re-run of Sprint v1's random-turn correctness
// check -- it verifies specifically that turns as real users' swipes on the
// real 3-face camera actually decide them (not synthetic uniform sampling)
// still rotate identically across every candidate model.
import { readFileSync } from "node:fs";
import { buildSolvedCube, applyRawQuarterTurn } from "./cubeState";
import { compareFaceletMaps, computeFaceletMap } from "./customCubeExperiments/FaceletSnapshot";
import { deltaLogModel } from "./customCubeExperiments/DeltaLogModel";
import { discreteTwistModel } from "./customCubeExperiments/DiscreteTwistModel";
import { slotCycleModel } from "./customCubeExperiments/SlotCycleModel";
import type { CubeModel, Turn } from "./customCubeExperiments/ExperimentTypes";

const GRID_SIZE = 3;
const CANDIDATES: CubeModel<unknown>[] = [deltaLogModel, discreteTwistModel, slotCycleModel] as CubeModel<unknown>[];

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx runRealSwipeModelVerificationSprintV1.ts <turns.json>");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as { committed: { axis: "x" | "y" | "z"; layer: number; sign: number }[] };
  const turns: Turn[] = data.committed.map((t) => ({ axis: t.axis, layer: t.layer, sign: t.sign as 1 | -1 }));

  console.log(`=== Real Swipe Model Verification (${turns.length} real production swipe-decided turns, 3x3x3) ===`);

  const perModelFailures = new Map<string, number>();
  for (const model of CANDIDATES) perModelFailures.set(model.name, 0);

  turns.forEach((turn, i) => {
    const groundTruth = buildSolvedCube(GRID_SIZE);
    applyRawQuarterTurn(groundTruth, turn.axis, turn.layer, turn.sign);
    const expected = computeFaceletMap(groundTruth);

    const results: string[] = [];
    for (const model of CANDIDATES) {
      const state = model.buildSolved(GRID_SIZE);
      model.applyTurn(state, turn);
      const actual = computeFaceletMap(model.toCubies(state));
      const diff = compareFaceletMaps(expected, actual);
      if (!diff.matches) {
        perModelFailures.set(model.name, (perModelFailures.get(model.name) ?? 0) + 1);
        results.push(`${model.name}=FAIL(${diff.mismatchedSlots} mismatched)`);
      } else {
        results.push(`${model.name}=OK`);
      }
    }
    console.log(`[${i + 1}/${turns.length}] axis=${turn.axis} layer=${turn.layer} sign=${turn.sign} -- ${results.join(", ")}`);
  });

  console.log("\n=== Summary ===");
  for (const [name, failures] of perModelFailures) {
    console.log(`${name}: ${turns.length - failures}/${turns.length} real-swipe turns correct`);
  }
}

main();
