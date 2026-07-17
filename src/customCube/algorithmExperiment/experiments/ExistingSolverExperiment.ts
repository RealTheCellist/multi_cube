// --- ExistingSolverExperiment (Algorithm Experiment Framework v1) -----------
// Baseline: runs the REAL, unmodified FiveByFiveEdgeSolverEngine against
// the Replay state exactly once, via its existing public API
// (solve()) -- same call shape customSolvePlayback.ts and every prior
// research engine in this project already use. Never touches the engine's
// internals, never reaches past its public surface.
import { applySeq, wrongWingCount5 } from "../../fiveByFiveEdges";
import { analyzeEdgeSlots } from "../../fiveByFiveHumanEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../../fiveByFiveEdgeSolverEngine";
import type { EdgeExperiment } from "../ExperimentRegistry";
import type { ExperimentContext } from "../ExperimentContext";
import type { ExperimentResult } from "../ExperimentResult";

let warmed = false;

function pairCount(cubies: ExperimentContext["cubies"]): number {
  return analyzeEdgeSlots(cubies).filter((s) => s.pairedCount === 2).length;
}

export class ExistingSolverExperiment implements EdgeExperiment {
  readonly name = "ExistingSolver";

  run(context: ExperimentContext): ExperimentResult {
    if (!warmed) {
      warmupFiveByFiveEdgeLibraries();
      warmed = true;
    }

    // `context.cubies` is already an isolated clone (see ExperimentRunner.ts) --
    // mutated freely here, never touching the Replay's own stored state.
    const cubies = context.cubies;
    const wrongWingBefore = wrongWingCount5(cubies);
    const pairBefore = pairCount(cubies);

    const t0 = Date.now();
    const engine = new FiveByFiveEdgeSolverEngine();
    const plan = engine.solve(cubies);
    applySeq(cubies, plan.moveQueue);
    const elapsedMs = Date.now() - t0;

    const wrongWingAfter = wrongWingCount5(cubies);
    const pairAfter = pairCount(cubies);

    return {
      solved: wrongWingAfter === 0,
      wrongWingBefore,
      wrongWingAfter,
      pairBefore,
      pairAfter,
      moveCount: plan.moveQueue.length,
      elapsedMs,
      notes: [`plan tasks: ${plan.tasks.length}`, `plan score: ${plan.score}`],
    };
  }
}
