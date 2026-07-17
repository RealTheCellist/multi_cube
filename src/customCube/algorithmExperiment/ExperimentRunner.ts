// --- ExperimentRunner (Algorithm Experiment Framework v1) -------------------
// Runs ALL registered experiments against ONE ExperimentContext, always in
// registration order (spec: "순서는 항상 동일해야 한다").
//
// Isolation is enforced HERE, at the framework level, not left to each
// Experiment's own discipline: every experiment gets its OWN fresh
// cloneCubies() of the context's cube, so even a carelessly-written
// experiment that forgets to clone before mutating can never corrupt
// another experiment's run or the original Replay state -- this directly
// forecloses the spec's own two explicit failure conditions ("Experiment
// 간 상태 공유", "Scratch Clone 누락") at the infrastructure level instead
// of trusting every future experiment author to remember them.
import { cloneCubies } from "../cubeState";
import type { ExperimentContext } from "./ExperimentContext";
import type { ExperimentResult } from "./ExperimentResult";
import type { EdgeExperiment, ExperimentRegistry } from "./ExperimentRegistry";

export interface RunOutcome {
  experimentName: string;
  result: ExperimentResult;
}

export function runExperiments(baseContext: ExperimentContext, registry: ExperimentRegistry): RunOutcome[] {
  return registry.all().map((experiment) => {
    const isolatedContext: ExperimentContext = { ...baseContext, cubies: cloneCubies(baseContext.cubies) };
    return { experimentName: experiment.name, result: experiment.run(isolatedContext) };
  });
}

/**
 * Spec's own "결정성 검증": run ONE experiment against the SAME context 3
 * times (each getting its own fresh clone, exactly like a real run) and
 * compare the outcome fields that are supposed to be deterministic --
 * elapsedMs is deliberately excluded from the comparison (wall-clock timing
 * noise is expected and is not what "determinism" means here).
 */
export interface DeterminismCheckResult {
  experimentName: string;
  deterministic: boolean;
  runs: ExperimentResult[];
}

function resultFingerprint(r: ExperimentResult): string {
  return JSON.stringify({
    solved: r.solved,
    wrongWingBefore: r.wrongWingBefore,
    wrongWingAfter: r.wrongWingAfter,
    pairBefore: r.pairBefore,
    pairAfter: r.pairAfter,
    moveCount: r.moveCount,
  });
}

export function verifyDeterminism(experiment: EdgeExperiment, baseContext: ExperimentContext, times = 3): DeterminismCheckResult {
  const runs: ExperimentResult[] = [];
  for (let i = 0; i < times; i++) {
    const isolatedContext: ExperimentContext = { ...baseContext, cubies: cloneCubies(baseContext.cubies) };
    runs.push(experiment.run(isolatedContext));
  }
  const fingerprints = new Set(runs.map(resultFingerprint));
  return { experimentName: experiment.name, deterministic: fingerprints.size === 1, runs };
}
