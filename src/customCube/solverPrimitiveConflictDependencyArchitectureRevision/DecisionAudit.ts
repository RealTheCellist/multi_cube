// --- DecisionAudit (CONFLICT_DEEP_DEPENDENCY Architecture Revision Sprint
// v1, STEP3) -------------------------------------------------------------
// For each round's REAL candidate list (today's real production config,
// useSetupReservedSlice=true), applies the chosen candidate (chooseBestRecovery,
// UNMODIFIED) + retryTask to determine actual success/failure -- then, from
// the SAME pre-decision scratch state, independently applies + retries EVERY
// OTHER offered candidate to check whether a genuinely better choice existed.
// This requires no reconstruction: every candidate's `.moves` already came
// from the same real generateRecoveryStrategies() call, so replaying each one
// is just an ordinary apply+retry using the same endgameRetryTask duplicate
// this arc's every Recovery-level collector already relies on. Directly
// answers the Directive's own named question: "SETUP 선택 -> 실패 -> CCR가
// 성공 가능했는가?"
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const CALL_DEADLINE_MS = 1000;

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

function tryOneCandidate(before: Cubie[], libs: ExecutorLibraries, candidate: RecoveryStrategy, deadline: number): boolean {
  const beforeWrong = wrongWingCount5(before);
  const scratch = cloneCubies(before);
  applySeq(scratch, candidate.moves);
  const retryDeadline = Math.min(deadline, Date.now() + 150);
  const retryMoves = endgameRetryTask(scratch, libs, retryDeadline);
  applySeq(scratch, retryMoves);
  return wrongWingCount5(scratch) < beforeWrong;
}

export interface DecisionAuditRound {
  label: string;
  chosenType: RecoveryType | "none";
  chosenSucceeded: boolean;
  betterAlternativeExisted: boolean; // some OTHER candidate, tried independently, would have succeeded
  betterAlternativeTypes: RecoveryType[]; // which type(s) would have succeeded instead
}

export function runDecisionAuditRound(cubies: Cubie[], libs: ExecutorLibraries, label: string): DecisionAuditRound {
  const deadline = Date.now() + CALL_DEADLINE_MS;
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, true, true);
  const chosen = chooseBestRecovery(candidates);

  if (!chosen) {
    return { label, chosenType: "none", chosenSucceeded: false, betterAlternativeExisted: false, betterAlternativeTypes: [] };
  }

  const chosenSucceeded = tryOneCandidate(cubies, libs, chosen, deadline);

  const betterAlternativeTypes: RecoveryType[] = [];
  if (!chosenSucceeded) {
    for (const c of candidates) {
      if (c === chosen) continue;
      if (tryOneCandidate(cubies, libs, c, deadline)) betterAlternativeTypes.push(c.type);
    }
  }

  return {
    label,
    chosenType: chosen.type,
    chosenSucceeded,
    betterAlternativeExisted: betterAlternativeTypes.length > 0,
    betterAlternativeTypes: [...new Set(betterAlternativeTypes)],
  };
}

export function runDecisionAudit(cases: readonly HoleCase[], libs: ExecutorLibraries, repeats: number): DecisionAuditRound[] {
  const rounds: DecisionAuditRound[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    for (const c of cases) rounds.push(runDecisionAuditRound(c.cubies, libs, `${c.label}#${rep}`));
  }
  return rounds;
}

export interface DecisionAuditSummary {
  n: number;
  setupChosenCount: number;
  setupChosenFailedCount: number;
  setupFailedWithBetterAlternativeCount: number;
  setupFailedBetterAlternativeRate: number; // of setupChosenFailedCount
  betterAlternativeTypeCounts: Partial<Record<RecoveryType, number>>;
}

export function summarizeDecisionAudit(rounds: readonly DecisionAuditRound[]): DecisionAuditSummary {
  const setupRounds = rounds.filter((r) => r.chosenType === "SETUP");
  const setupFailed = setupRounds.filter((r) => !r.chosenSucceeded);
  const setupFailedWithBetter = setupFailed.filter((r) => r.betterAlternativeExisted);

  const betterAlternativeTypeCounts: Partial<Record<RecoveryType, number>> = {};
  for (const r of setupFailedWithBetter) {
    for (const t of r.betterAlternativeTypes) betterAlternativeTypeCounts[t] = (betterAlternativeTypeCounts[t] ?? 0) + 1;
  }

  return {
    n: rounds.length,
    setupChosenCount: setupRounds.length,
    setupChosenFailedCount: setupFailed.length,
    setupFailedWithBetterAlternativeCount: setupFailedWithBetter.length,
    setupFailedBetterAlternativeRate: setupFailed.length ? setupFailedWithBetter.length / setupFailed.length : 0,
    betterAlternativeTypeCounts,
  };
}
