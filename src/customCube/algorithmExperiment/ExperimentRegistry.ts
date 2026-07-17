// --- Experiment interface + Registry (Algorithm Experiment Framework v1) ----
import type { ExperimentContext } from "./ExperimentContext";
import type { ExperimentResult } from "./ExperimentResult";

/**
 * Every algorithm idea implements this ONE interface and nothing else --
 * `run()` receives a scratch context (its `cubies` is already an isolated
 * clone, see ExperimentRunner.ts) and must return a plain result, never
 * mutate anything the Runner didn't hand it, and never reach into another
 * Experiment's state (there isn't any to reach into -- see Runner).
 */
export interface EdgeExperiment {
  readonly name: string;
  run(context: ExperimentContext): ExperimentResult;
}

/**
 * Spec's own "확장성" requirement (④ 새 Experiment 추가 시 Runner 수정 없이
 * 실행 가능): the Registry is the ONLY place a new algorithm idea needs to
 * be wired in -- register() it here, and ExperimentRunner/BenchmarkRunner
 * pick it up automatically without any change to either.
 */
export class ExperimentRegistry {
  private readonly experiments: EdgeExperiment[] = [];

  register(experiment: EdgeExperiment): void {
    this.experiments.push(experiment);
  }

  all(): readonly EdgeExperiment[] {
    return this.experiments;
  }
}
