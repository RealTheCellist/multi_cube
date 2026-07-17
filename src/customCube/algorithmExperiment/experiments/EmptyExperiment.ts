// --- EmptyExperiment (Algorithm Experiment Framework v1) --------------------
// Does nothing at all -- pure framework validation (spec: "Framework
// 검증용"). If this experiment's numbers ever show ANY change between
// before/after, or non-zero moves/time, that's a Runner bug, not a solver
// finding.
import type { EdgeExperiment } from "../ExperimentRegistry";
import type { ExperimentContext } from "../ExperimentContext";
import type { ExperimentResult } from "../ExperimentResult";

export class EmptyExperiment implements EdgeExperiment {
  readonly name = "Empty";

  run(context: ExperimentContext): ExperimentResult {
    return {
      solved: context.wrongWingCount === 0,
      wrongWingBefore: context.wrongWingCount,
      wrongWingAfter: context.wrongWingCount,
      pairBefore: context.pairCount,
      pairAfter: context.pairCount,
      moveCount: 0,
      elapsedMs: 0,
      notes: ["no-op -- framework validation baseline"],
    };
  }
}
