// --- EvaluationRunner (Solver Primitive Refinement Sprint #2 -- Deep
// Cycle Refinement Sprint v1, STEP1/2/3/4 shared) ----------------------------
// One uniform per-case evaluation loop reused by Baseline reproduction, the
// Gate Sweep, and the Search Contract Sweep -- same metric definitions
// throughout so results are directly comparable. Structurally identical to
// bridgeInjectionRefinementV1/EvaluationRunner.ts (same metric vocabulary
// across this whole Refinement track), re-declared here (not imported)
// since it binds to this Sprint's own TaggedCase type.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import type { TaggedCase } from "./TargetPopulation";

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

export function evaluateOneCase(tc: TaggedCase, lib: WingLibrary, deadlineMs: number, trial: TrialFn): CaseOutcome {
  const cubies = cloneCubies(tc.hole.cubies);
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
    label: tc.hole.label,
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

export function evaluatePopulation(cases: readonly TaggedCase[], lib: WingLibrary, deadlineMs: number, trial: TrialFn): CaseOutcome[] {
  return cases.map((tc) => evaluateOneCase(tc, lib, deadlineMs, trial));
}

export interface EvaluationSummary {
  configLabel: string;
  n: number;
  gateMatchedCount: number;
  coverage: number;
  improvedCount: number;
  precision: number; // improvedCount / gateMatchedCount
  gapRescueRate: number; // improvedCount / n
  avgRuntimeMsAmongMatched: number;
  trueRegressionCount: number;
}

export function summarizeOutcomes(configLabel: string, outcomes: readonly CaseOutcome[]): EvaluationSummary {
  const n = outcomes.length;
  const matched = outcomes.filter((o) => o.gateMatched);
  const improved = outcomes.filter((o) => o.improved);
  const regressed = outcomes.filter((o) => o.trueRegression);
  const avgRuntimeMsAmongMatched = matched.length ? matched.reduce((s, o) => s + o.wallMs, 0) / matched.length : 0;

  return {
    configLabel,
    n,
    gateMatchedCount: matched.length,
    coverage: n ? matched.length / n : 0,
    improvedCount: improved.length,
    precision: matched.length ? improved.length / matched.length : 0,
    gapRescueRate: n ? improved.length / n : 0,
    avgRuntimeMsAmongMatched,
    trueRegressionCount: regressed.length,
  };
}
