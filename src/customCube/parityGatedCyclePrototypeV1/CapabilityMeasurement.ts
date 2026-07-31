// --- CapabilityMeasurement (Parity-Gated Cycle Prototype Sprint v1,
// STEP2/3/4 shared) ----------------------------------------------------------
// One uniform per-case evaluation loop reused by the Baseline pass, the
// Prototype pass, and every Ablation variant -- same metric definitions
// throughout so results are directly comparable. Structurally identical to
// deepCycleRefinementV1/EvaluationRunner.ts and
// bridgeInjectionRefinementV1/EvaluationRunner.ts (same metric vocabulary
// across this whole Refinement/Discovery track), re-declared here (not
// imported) since it binds to this Sprint's own UnknownCase type
// (parityGatedCycleBlueprintV1/UnknownPopulationProfiling.ts, STEP2's
// "no new dataset" population, reused unmodified).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import type { UnknownCase } from "../parityGatedCycleBlueprintV1/UnknownPopulationProfiling";

export interface TrialFn {
  (cubies: Cubie[], lib: WingLibrary, deadline: number): { gateMatched: boolean; moves: Move[] | null; leavesExplored: number };
}

export interface CaseOutcome {
  label: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  gateMatched: boolean;
  solved: boolean;
  improved: boolean;
  trueRegression: boolean;
  wallMs: number;
  leavesExplored: number;
}

export const NO_OP_BASELINE: TrialFn = () => ({ gateMatched: false, moves: null, leavesExplored: 0 });

export function evaluateOneCase(uc: UnknownCase, lib: WingLibrary, deadlineMs: number, trial: TrialFn): CaseOutcome {
  const cubies = cloneCubies(uc.hole.cubies);
  const wrongWingBefore = wrongWingCount5(cubies);
  const start = Date.now();
  const result = trial(cubies, lib, Date.now() + deadlineMs);
  const wallMs = Date.now() - start;

  let wrongWingAfter = wrongWingBefore;
  if (result.moves) {
    const after = cloneCubies(cubies);
    applySeq(after, result.moves);
    wrongWingAfter = wrongWingCount5(after);
  }

  return {
    label: uc.label,
    wrongWingBefore,
    wrongWingAfter,
    gateMatched: result.gateMatched,
    solved: wrongWingAfter === 0,
    improved: wrongWingAfter < wrongWingBefore,
    trueRegression: wrongWingAfter > wrongWingBefore,
    wallMs,
    leavesExplored: result.leavesExplored,
  };
}

export function evaluatePopulation(cases: readonly UnknownCase[], lib: WingLibrary, deadlineMs: number, trial: TrialFn): CaseOutcome[] {
  return cases.map((uc) => evaluateOneCase(uc, lib, deadlineMs, trial));
}

export interface EvaluationSummary {
  configLabel: string;
  n: number;
  gateMatchedCount: number;
  coverage: number;
  solvedCount: number;
  improvedCount: number;
  rescueRate: number; // improvedCount / n -- this Sprint's "rescue rate" per the Directive's own STEP3 wording
  trueRegressionCount: number;
  avgRuntimeMs: number;
}

export function summarizeOutcomes(configLabel: string, outcomes: readonly CaseOutcome[]): EvaluationSummary {
  const n = outcomes.length;
  const matched = outcomes.filter((o) => o.gateMatched);
  const solved = outcomes.filter((o) => o.solved);
  const improved = outcomes.filter((o) => o.improved);
  const regressed = outcomes.filter((o) => o.trueRegression);
  const avgRuntimeMs = n ? outcomes.reduce((s, o) => s + o.wallMs, 0) / n : 0;

  return {
    configLabel,
    n,
    gateMatchedCount: matched.length,
    coverage: n ? matched.length / n : 0,
    solvedCount: solved.length,
    improvedCount: improved.length,
    rescueRate: n ? improved.length / n : 0,
    trueRegressionCount: regressed.length,
    avgRuntimeMs,
  };
}
