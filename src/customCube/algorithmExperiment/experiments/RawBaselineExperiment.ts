// --- RawBaselineExperiment (Solver Core Improvement Sprint v1) --------------
// The FAIR baseline for comparing a raw BFS/fix-function change: the
// existing, unmodified tryFixWing, driven directly (bypassing Planner/
// Executor/Recovery entirely), so a candidate that changes ONLY the
// fix-function can be compared apples-to-apples -- ExistingSolverExperiment
// alone isn't sufficient for this because it goes through the full
// production pipeline, which would also change task ORDERING, not just the
// BFS itself.
import { tryFixWing, wrongWingCount5 } from "../../fiveByFiveEdges";
import { driveFixLoop, pairCountOf } from "./rawFixLoop";
import type { EdgeExperiment } from "../ExperimentRegistry";
import type { ExperimentContext } from "../ExperimentContext";
import type { ExperimentResult } from "../ExperimentResult";

const DRIVE_DEADLINE_MS = 1000;

export class RawBaselineExperiment implements EdgeExperiment {
  readonly name = "RawBaseline";

  run(context: ExperimentContext): ExperimentResult {
    const cubies = context.cubies;
    const wrongWingBefore = wrongWingCount5(cubies);
    const pairBefore = pairCountOf(cubies);

    const t0 = Date.now();
    const { moveCount } = driveFixLoop(cubies, DRIVE_DEADLINE_MS, tryFixWing);
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
      notes: ["raw tryFixWing drive loop -- no Planner/Executor/Recovery"],
    };
  }
}
