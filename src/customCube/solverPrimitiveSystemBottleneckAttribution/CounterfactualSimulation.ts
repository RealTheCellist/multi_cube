// --- CounterfactualSimulation (Solver System Bottleneck Attribution
// Sprint v1, STEP5) ----------------------------------------------------------
// READ-ONLY simulation, zero Production changes. Runs the real, unmodified
// PAIR/FLIP/PARITY tasks up to the point an ENDGAME task would run (using
// StageInstrumentedMirror's own mirrorRunPrimaryPipeline, byte-identical to
// production), captures that intermediate state + the real remaining
// deadline, then branches into 3 counterfactual arms on a CLONE (never the
// real solve() path) to see which destination for PAIR's saved time
// (BudgetSavingsFlow.ts's own measured avg) yields the largest wrongWingCount
// improvement:
//   ENDGAME-extended: bestFixOverall/tryEndgameMultiPly/
//     tryEndgameThroughDisruption loop (same as runPrimaryPipeline's real
//     ENDGAME branch) with the real remaining deadline EXTENDED by the
//     measured PAIR savings.
//   RECOVERY-extended: generateRecoveryStrategies + chooseBestRecovery (the
//     real Recovery candidate generation, unmodified), same extension.
//   CCR-only-extended: runCCRPrototype alone (the real CCR primitive,
//     unmodified), same extension -- isolates CCR's own marginal value from
//     DISRUPT/SETUP/REPAIR's combined Recovery candidate pool.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import {
  applySeq,
  bestFixOverall,
  ENDGAME_MULTIPLY_THRESHOLD,
  tryEndgameMultiPly,
  tryEndgameThroughDisruption,
  wrongWingCount5,
  type Move,
} from "../fiveByFiveEdges";
import type { SolveTask } from "../fiveByFiveEdgeSolverTypes";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import { mirrorRunPrimaryPipeline, type StageEvent } from "./StageInstrumentedMirror";

function runEndgameLoop(cubies: Cubie[], libs: ExecutorLibraries, deadline: number): void {
  const { lib, flipLib, caseLib } = libs;
  let guard = 0;
  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline && guard < 50) {
    guard++;
    const fix = bestFixOverall(cubies, lib, flipLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      continue;
    }
    if (wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD) {
      const endgameFix = tryEndgameMultiPly(cubies, lib, flipLib, deadline);
      if (endgameFix && endgameFix.length > 0) {
        applySeq(cubies, endgameFix);
        continue;
      }
    }
    break;
  }
  if (wrongWingCount5(cubies) > 0 && wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD && Date.now() < deadline) {
    const disruptionFix = tryEndgameThroughDisruption(cubies, lib, flipLib, deadline, undefined, undefined, caseLib);
    if (disruptionFix && disruptionFix.length > 0) applySeq(cubies, disruptionFix);
  }
}

export interface CounterfactualResult {
  hash: string;
  wrongWingAtBranch: number;
  baselineWrongAfter: number;
  endgameExtendedWrongAfter: number;
  recoveryExtendedWrongAfter: number;
  ccrExtendedWrongAfter: number;
}

/** Runs real PAIR/FLIP/PARITY tasks up to (not including) the first ENDGAME task, then branches. Returns null if no ENDGAME task exists for this snapshot (nothing to simulate). */
export function simulateRedirection(hash: string, cubies: Cubie[], libs: ExecutorLibraries, extensionMs: number): CounterfactualResult | null {
  const working = cloneCubies(cubies);
  const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);
  const events: StageEvent[] = [];

  let endgameTask: SolveTask | null = null;
  for (const task of tasks) {
    if (Date.now() > deadline) break;
    if (wrongWingCount5(working) === 0) break;
    if (task.type === "ENDGAME") {
      endgameTask = task;
      break;
    }
    mirrorRunPrimaryPipeline(hash, working, task, libs, deadline, events);
  }
  if (!endgameTask || wrongWingCount5(working) === 0) return null;

  const wrongWingAtBranch = wrongWingCount5(working);
  const remainingMs = Math.max(0, deadline - Date.now());

  const baseline = cloneCubies(working);
  runEndgameLoop(baseline, libs, Date.now() + remainingMs);

  const endgameExtended = cloneCubies(working);
  runEndgameLoop(endgameExtended, libs, Date.now() + remainingMs + extensionMs);

  const recoveryExtended = cloneCubies(working);
  {
    const recDeadline = Date.now() + remainingMs + extensionMs;
    const candidates = generateRecoveryStrategies(recoveryExtended, libs, recDeadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true);
    const best = chooseBestRecovery(candidates);
    if (best) applySeq(recoveryExtended, best.moves as Move[]);
  }

  const ccrExtended = cloneCubies(working);
  {
    const ccrDeadline = Date.now() + remainingMs + extensionMs;
    const result = runCCRPrototype(ccrExtended, libs.lib, ccrDeadline, "singleCycle");
    if (result.matched && result.moves) applySeq(ccrExtended, result.moves);
  }

  return {
    hash,
    wrongWingAtBranch,
    baselineWrongAfter: wrongWingCount5(baseline),
    endgameExtendedWrongAfter: wrongWingCount5(endgameExtended),
    recoveryExtendedWrongAfter: wrongWingCount5(recoveryExtended),
    ccrExtendedWrongAfter: wrongWingCount5(ccrExtended),
  };
}

export interface CounterfactualSummary {
  n: number;
  avgBaselineImprovement: number;
  avgEndgameExtendedImprovement: number;
  avgRecoveryExtendedImprovement: number;
  avgCcrExtendedImprovement: number;
  bestRedirection: "ENDGAME" | "RECOVERY" | "CCR" | "none";
}

export function summarizeCounterfactual(results: readonly CounterfactualResult[]): CounterfactualSummary {
  const n = results.length;
  const avg = (f: (r: CounterfactualResult) => number) => (n ? results.reduce((a, r) => a + f(r), 0) / n : 0);
  const avgBaselineImprovement = avg((r) => r.wrongWingAtBranch - r.baselineWrongAfter);
  const avgEndgameExtendedImprovement = avg((r) => r.wrongWingAtBranch - r.endgameExtendedWrongAfter);
  const avgRecoveryExtendedImprovement = avg((r) => r.wrongWingAtBranch - r.recoveryExtendedWrongAfter);
  const avgCcrExtendedImprovement = avg((r) => r.wrongWingAtBranch - r.ccrExtendedWrongAfter);

  const options: [CounterfactualSummary["bestRedirection"], number][] = [
    ["ENDGAME", avgEndgameExtendedImprovement],
    ["RECOVERY", avgRecoveryExtendedImprovement],
    ["CCR", avgCcrExtendedImprovement],
  ];
  const best = options.reduce((a, b) => (b[1] > a[1] ? b : a), ["none", -Infinity] as [CounterfactualSummary["bestRedirection"], number]);

  return {
    n,
    avgBaselineImprovement,
    avgEndgameExtendedImprovement,
    avgRecoveryExtendedImprovement,
    avgCcrExtendedImprovement,
    bestRedirection: best[0],
  };
}
