// --- PairPreservingExperiment (Solver Core Improvement Sprint v1) ----------
// The candidate: identical drive loop to RawBaselineExperiment, with ONLY
// tryFixWing swapped for tryFixWingPP (Pair-Preserving BFS v1, see
// fiveByFiveEdges.ts). This isolates exactly the one variable this Sprint
// is testing.
import { tryFixWingPP, wrongWingCount5 } from "../../fiveByFiveEdges";
import { driveFixLoop, pairCountOf } from "./rawFixLoop";
import type { EdgeExperiment } from "../ExperimentRegistry";
import type { ExperimentContext } from "../ExperimentContext";
import type { ExperimentResult } from "../ExperimentResult";

const DRIVE_DEADLINE_MS = 1000;

export class PairPreservingExperiment implements EdgeExperiment {
  readonly name = "PairPreserving";

  run(context: ExperimentContext): ExperimentResult {
    const cubies = context.cubies;
    const wrongWingBefore = wrongWingCount5(cubies);
    const pairBefore = pairCountOf(cubies);

    const t0 = Date.now();
    const { moveCount } = driveFixLoop(cubies, DRIVE_DEADLINE_MS, tryFixWingPP);
    const elapsedMs = Date.now() - t0;

    const wrongWingAfter = wrongWingCount5(cubies);
    const pairAfter = pairCountOf(cubies);

    return {
      solved: wrongWingAfter === 0,
      wrongWingBefore,
      wrongWingAfter,
      pairBefore,
      pairAfter,
      moveCount,
      elapsedMs,
      notes: ["tryFixWingPP drive loop -- no Planner/Executor/Recovery"],
    };
  }
}
