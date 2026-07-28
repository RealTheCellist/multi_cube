// --- RecoveryInteractionMeasurement (Production Integration Blueprint
// Sprint v1, RQ-4, Required Analysis #3 groundwork) --------------------------
// Calls the REAL, unmodified generateRecoveryStrategies()/
// chooseBestRecovery() (production defaults: includeRepair=true,
// schedulingStrategy="reservedBudget", includeCCR=true) to get the
// EXISTING Recovery Layer's actual candidate set + winner for each case,
// then separately computes Mixed Commutator's own candidate (via the
// unmodified tryMixedCommutatorPrototype from Mixed Commutator Prototype
// Sprint v1) and scores it with the IDENTICAL formula
// (RecoveryScoreReplica) -- directly answering "would Mixed Commutator's
// candidate have won chooseBestRecovery() if it were in the pool?"
// without ever modifying fiveByFiveEdgeRecovery.ts itself (read-only
// import/call only).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, type WingLibrary } from "../fiveByFiveEdges";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingStrategy } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { runMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";
import { scoreLikeRecoveryLayer } from "./RecoveryScoreReplica";

export interface InteractionRow {
  label: string;
  populationTag: "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";
  existingBestType: string | null; // DISRUPT/SETUP/REPAIR/CCR/null
  existingBestScore: number | null;
  existingCandidateCount: number;
  mixedFound: boolean;
  mixedScore: number | null;
  mixedFootprintRatio: number | null;
  wouldMixedWin: boolean; // mixedScore > existingBestScore (or existing has no candidate at all)
  outcome: "ONLY_EXISTING" | "ONLY_MIXED" | "BOTH_NONE" | "MIXED_WINS" | "EXISTING_WINS";
}

export function measureInteraction(
  cubies: Cubie[],
  label: string,
  populationTag: InteractionRow["populationTag"],
  libs: ExecutorLibraries,
  deadline: number,
  mixedBudgetMs: number,
  schedulingStrategy: SchedulingStrategy = "reservedBudget"
): InteractionRow {
  const existing = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, schedulingStrategy, undefined, true);
  const existingBest = chooseBestRecovery(existing);

  // Mixed Commutator's budget is computed FRESH here, AFTER existing
  // generation has already run -- mirroring genRepair()'s own
  // reservedBudget design (REPAIR_RESERVED_SLICE_MS measured off the
  // CURRENT time, not a value pre-computed before the shared-genDeadline
  // steps ran) rather than a fixed absolute deadline that would silently
  // shrink if existing generation took real wall-clock time.
  const mixedDeadline = Date.now() + mixedBudgetMs;
  const mixedResult = runMixedCommutatorPrototype(cloneCubies(cubies), libs.lib as WingLibrary, mixedDeadline);
  let mixedScore: number | null = null;
  if (mixedResult.moves) {
    const after = cloneCubies(cubies);
    applySeq(after, mixedResult.moves);
    mixedScore = scoreLikeRecoveryLayer(cubies, after, mixedResult.moves);
  }

  const existingBestScore = existingBest?.score ?? null;
  const wouldMixedWin = mixedScore !== null && (existingBestScore === null || mixedScore > existingBestScore);

  let outcome: InteractionRow["outcome"];
  if (mixedScore === null && existingBestScore === null) outcome = "BOTH_NONE";
  else if (mixedScore === null) outcome = "ONLY_EXISTING";
  else if (existingBestScore === null) outcome = "ONLY_MIXED";
  else outcome = wouldMixedWin ? "MIXED_WINS" : "EXISTING_WINS";

  return {
    label,
    populationTag,
    existingBestType: existingBest?.type ?? null,
    existingBestScore,
    existingCandidateCount: existing.length,
    mixedFound: !!mixedResult.moves,
    mixedScore,
    mixedFootprintRatio: mixedResult.footprintRatio,
    wouldMixedWin,
    outcome,
  };
}
