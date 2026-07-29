// --- AdditiveSubstitutiveSimulation (CONFLICT_DEEP_DEPENDENCY Architecture
// Revision Sprint v1, STEP2) --------------------------------------------------
// Tests the Reserved Slice Production Integration Sprint v1's own root-cause
// hypothesis (Sprint 4's docs, section 5) directly, on fresh data: the prior
// Budget & Scheduling Validation Sprint v1 (Shadow Scheduler) measured an
// ADDITIVE arm -- REAL Baseline candidates (useSetupReservedSlice=false)
// PLUS one extra SYNTHETIC SETUP candidate built under its own reserved
// budget (buildSyntheticReservedCandidate, unchanged since that Sprint),
// competing in the REAL unmodified chooseBestRecovery(). Because the
// Additive candidate set is Baseline's own real set plus one addition, it
// can never score worse than Baseline by construction. The REAL Production
// Integration (Sprint 4) instead made SETUP's OWN candidate-generation step
// SUBSTITUTIVE -- genSetup() always runs (no genDeadline gate) and offers
// its candidate as an ordinary, always-present competitor, which can win
// chooseBestRecovery()'s single-winner slot away from a real CCR/
// MIXED_COMMUTATOR candidate in the SAME round.
//
// This module runs all THREE arms on the SAME cases/repeats so their
// improvedRate/regression/winner-type distributions are directly comparable:
//   BASELINE:     generateRecoveryStrategies(..., useSetupReservedSlice=false)
//   ADDITIVE:     BASELINE's own candidates + synthetic SETUP candidate (Shadow's exact method)
//   SUBSTITUTIVE: generateRecoveryStrategies(..., useSetupReservedSlice=true) (today's real production)
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { buildSyntheticReservedCandidate } from "../conflictDeepDependencyBudgetScheduling/SyntheticReservedCandidate";
import { SETUP_RESERVED_SLICE_MS_FOR_REPORT } from "../reservedSliceProductionIntegration/ProductionContractConstants";

export const CALL_DEADLINE_MS = 1000;

// Disclosed duplicate of RecoveryLevelCollector.ts's own endgameRetryTask --
// this arc's established convention (each Production Integration Sprint's
// collector is self-contained rather than cross-importing an unexported
// function); reuses only EXISTING exported search functions.
function endgameRetryTask(cubies: Cubie[], libs: ExecutorLibraries, deadline: number): Move[] {
  const { lib, flipLib, caseLib } = libs;
  const applied: Move[] = [];
  let guard = 0;
  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline && guard < 50) {
    guard++;
    const fix = bestFixOverall(cubies, lib, flipLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      applied.push(...fix);
      continue;
    }
    if (wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD) {
      const endgameFix = tryEndgameMultiPly(cubies, lib, flipLib, deadline);
      if (endgameFix && endgameFix.length > 0) {
        applySeq(cubies, endgameFix);
        applied.push(...endgameFix);
        continue;
      }
    }
    break;
  }
  if (wrongWingCount5(cubies) > 0 && wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD && Date.now() < deadline) {
    const disruptionFix = tryEndgameThroughDisruption(cubies, lib, flipLib, deadline, undefined, undefined, caseLib);
    if (disruptionFix && disruptionFix.length > 0) {
      applySeq(cubies, disruptionFix);
      applied.push(...disruptionFix);
    }
  }
  return applied;
}

function applyChosenAndRetry(cubies: Cubie[], libs: ExecutorLibraries, chosen: RecoveryStrategy | null, deadline: number): { succeeded: boolean; wrongWingAfter: number } {
  const before = wrongWingCount5(cubies);
  if (!chosen) return { succeeded: false, wrongWingAfter: before };
  const scratch = cloneCubies(cubies);
  applySeq(scratch, chosen.moves);
  const retryDeadline = Math.min(deadline, Date.now() + 150);
  const retryMoves = endgameRetryTask(scratch, libs, retryDeadline);
  applySeq(scratch, retryMoves);
  const after = wrongWingCount5(scratch);
  return { succeeded: after < before, wrongWingAfter: after };
}

export const ARM_NAMES = ["BASELINE", "ADDITIVE", "SUBSTITUTIVE"] as const;
export type ArmName = (typeof ARM_NAMES)[number];

export interface ArmRoundOutcome {
  succeeded: boolean;
  chosenType: RecoveryType | "none";
}

export interface SimulationRound {
  label: string;
  wrongWingBefore: number;
  arms: Record<ArmName, ArmRoundOutcome>;
}

export function runSimulationRound(cubies: Cubie[], libs: ExecutorLibraries, label: string): SimulationRound {
  const wrongWingBefore = wrongWingCount5(cubies);

  // Each arm gets its OWN fresh Date.now()+CALL_DEADLINE_MS deadline, computed
  // immediately before that arm's own candidate generation -- generating all
  // 3 arms' candidates against a single SHARED, continuously-ticking deadline
  // (this function's own earlier version) systematically starves whichever
  // arm is generated/retried LAST of real wall-clock budget, which is not a
  // real Production difference between the arms, just an artifact of
  // measurement order. Every arm here mirrors Sprint 4's own RecoveryLevelCollector
  // convention (each of Baseline/Candidate gets an independent fresh deadline).
  const baselineDeadline = Date.now() + CALL_DEADLINE_MS;
  const baselineCandidates = generateRecoveryStrategies(cloneCubies(cubies), libs, baselineDeadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, true, false);
  const baselineChosen = chooseBestRecovery(baselineCandidates);
  const baselineOutcome = applyChosenAndRetry(cubies, libs, baselineChosen, baselineDeadline);

  const additiveDeadline = Date.now() + CALL_DEADLINE_MS;
  const additiveBaseCandidates = generateRecoveryStrategies(cloneCubies(cubies), libs, additiveDeadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, true, false);
  const setupDeadline = Date.now() + SETUP_RESERVED_SLICE_MS_FOR_REPORT;
  const setupMoves = tryEndgameMultiPly(cloneCubies(cubies), libs.lib, libs.flipLib, setupDeadline);
  const syntheticSetup = setupMoves ? buildSyntheticReservedCandidate(cubies, setupMoves, "SETUP", SETUP_RESERVED_SLICE_MS_FOR_REPORT) : null;
  const additiveCandidates = syntheticSetup ? [...additiveBaseCandidates, syntheticSetup] : additiveBaseCandidates;
  const additiveChosen = chooseBestRecovery(additiveCandidates);
  const additiveOutcome = applyChosenAndRetry(cubies, libs, additiveChosen, additiveDeadline);

  const substitutiveDeadline = Date.now() + CALL_DEADLINE_MS;
  const substitutiveCandidates = generateRecoveryStrategies(cloneCubies(cubies), libs, substitutiveDeadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, true, true);
  const substitutiveChosen = chooseBestRecovery(substitutiveCandidates);
  const substitutiveOutcome = applyChosenAndRetry(cubies, libs, substitutiveChosen, substitutiveDeadline);

  return {
    label,
    wrongWingBefore,
    arms: {
      BASELINE: { succeeded: baselineOutcome.succeeded, chosenType: baselineChosen?.type ?? "none" },
      ADDITIVE: { succeeded: additiveOutcome.succeeded, chosenType: additiveChosen?.type ?? "none" },
      SUBSTITUTIVE: { succeeded: substitutiveOutcome.succeeded, chosenType: substitutiveChosen?.type ?? "none" },
    },
  };
}

export function runSimulation(cases: readonly HoleCase[], libs: ExecutorLibraries, repeats: number): SimulationRound[] {
  const rounds: SimulationRound[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    for (const c of cases) rounds.push(runSimulationRound(c.cubies, libs, `${c.label}#${rep}`));
  }
  return rounds;
}

export interface ArmSummary {
  arm: ArmName;
  improvedRate: number;
  chosenTypeShare: Partial<Record<RecoveryType | "none", number>>;
}

export function summarizeSimulation(rounds: readonly SimulationRound[]): ArmSummary[] {
  const n = rounds.length;
  return ARM_NAMES.map((arm) => {
    const outcomes = rounds.map((r) => r.arms[arm]);
    const improvedRate = n ? outcomes.filter((o) => o.succeeded).length / n : 0;
    const counts = new Map<string, number>();
    for (const o of outcomes) counts.set(o.chosenType, (counts.get(o.chosenType) ?? 0) + 1);
    const chosenTypeShare: Partial<Record<RecoveryType | "none", number>> = {};
    for (const [type, count] of counts) chosenTypeShare[type as RecoveryType | "none"] = n ? count / n : 0;
    return { arm, improvedRate, chosenTypeShare };
  });
}
