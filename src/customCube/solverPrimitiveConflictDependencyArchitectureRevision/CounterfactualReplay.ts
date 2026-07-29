// --- CounterfactualReplay (CONFLICT_DEEP_DEPENDENCY Architecture Revision
// Sprint v1, STEP4) -------------------------------------------------------
// Replays the 11 True Regression cases identified by the preceding Reserved
// Slice Production Integration Sprint v1 (its own regressionPerCase output,
// classification=TRUE_REGRESSION -- labels hardcoded here as a disclosed
// citation of that Sprint's own measured result, not re-derived) under 5
// arms to isolate WHICH mechanism actually causes each case's regression:
//   FULL:        today's real production (useSetupReservedSlice=true, all included) -- reproduces the regression
//   NO_SETUP:    SETUP's own candidate entirely removed (CounterfactualCandidateBuilder, this Sprint's only reconstruction)
//   NO_CCR:      generateRecoveryStrategies(..., includeCCR=false) -- real existing toggle
//   NO_MIXED:    generateRecoveryStrategies(..., includeMixedCommutator=false) -- real existing toggle
//   NO_RESERVED: generateRecoveryStrategies(..., useSetupReservedSlice=false) -- real existing toggle (= Sprint 4's own "Baseline")
// If NO_SETUP or NO_RESERVED alone recovers the pre-integration outcome for
// a given case while NO_CCR/NO_MIXED do not, that case's regression is
// directly attributable to SETUP's own reserved-slice candidate winning
// chooseBestRecovery() away from a genuinely better choice -- not to CCR or
// Mixed Commutator's own logic (both of which this Sprint's Directive
// forbids touching, and neither of which this Sprint modifies).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bestFixOverall, ENDGAME_MULTIPLY_THRESHOLD, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { buildCandidatesWithoutSetup } from "./CounterfactualCandidateBuilder";

// Reserved Slice Production Integration Sprint v1's own measured
// trueRegressionCount=11/142 result (reserved-slice-production-integration-
// v1-result.json, regressionPerCase[].classification==="TRUE_REGRESSION") --
// cited verbatim, not re-derived.
export const TRUE_REGRESSION_LABELS: readonly string[] = [
  "worstCase:e7a801fb",
  "worstCase:e5101f85",
  "worstCase:e9009e73",
  "worstCase:e8be823",
  "worstCase:42c89b9",
  "scrambleDepth10:8",
  "scrambleDepth30:0",
  "scrambleDepth30:4",
  "scrambleDepth50:2",
  "scrambleDepth50:8",
  "scrambleDepth100:9",
];

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

function applyChosenAndRetry(cubies: Cubie[], libs: ExecutorLibraries, chosen: RecoveryStrategy | null, deadline: number): { succeeded: boolean; regressed: boolean; chosenType: RecoveryType | "none" } {
  const before = wrongWingCount5(cubies);
  if (!chosen) return { succeeded: false, regressed: false, chosenType: "none" };
  const scratch = cloneCubies(cubies);
  applySeq(scratch, chosen.moves);
  const retryDeadline = Math.min(deadline, Date.now() + 150);
  const retryMoves = endgameRetryTask(scratch, libs, retryDeadline);
  applySeq(scratch, retryMoves);
  const after = wrongWingCount5(scratch);
  return { succeeded: after < before, regressed: after > before, chosenType: chosen.type };
}

export const ARM_NAMES = ["FULL", "NO_SETUP", "NO_CCR", "NO_MIXED", "NO_RESERVED"] as const;
export type ArmName = (typeof ARM_NAMES)[number];

export interface CounterfactualArmOutcome {
  succeeded: boolean;
  regressed: boolean;
  chosenType: RecoveryType | "none";
}

export interface CounterfactualRound {
  label: string;
  arms: Record<ArmName, CounterfactualArmOutcome>;
}

export function runCounterfactualRound(cubies: Cubie[], libs: ExecutorLibraries, label: string): CounterfactualRound {
  // Each arm gets its OWN fresh Date.now()+CALL_DEADLINE_MS deadline for BOTH
  // its own candidate generation AND its own retry -- generating/retrying all
  // 5 arms sequentially against one SHARED, continuously-ticking deadline
  // (this function's own earlier version) systematically starves whichever
  // arms are processed LATER in ARM_NAMES order (NO_RESERVED, last in the
  // list, was starved the most and showed a uniform 0% success artifact
  // across every one of the 11 True Regression cases -- an ordering bug, not
  // a real finding). Mirrors Sprint 4's own RecoveryLevelCollector
  // convention (each arm's own attemptRecovery() call gets an independent
  // fresh deadline).
  const armBuilders: Record<ArmName, () => RecoveryStrategy[]> = {
    FULL: () => generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + CALL_DEADLINE_MS, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, true, true),
    NO_SETUP: () => buildCandidatesWithoutSetup(cloneCubies(cubies), libs, Date.now() + CALL_DEADLINE_MS, DEFAULT_EVALUATOR_WEIGHTS),
    NO_CCR: () => generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + CALL_DEADLINE_MS, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, false, true, true),
    NO_MIXED: () => generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + CALL_DEADLINE_MS, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, false, true),
    NO_RESERVED: () => generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + CALL_DEADLINE_MS, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, true, false),
  };

  const arms = {} as Record<ArmName, CounterfactualArmOutcome>;
  for (const arm of ARM_NAMES) {
    const armDeadline = Date.now() + CALL_DEADLINE_MS;
    const candidates = armBuilders[arm]();
    const chosen = chooseBestRecovery(candidates);
    arms[arm] = applyChosenAndRetry(cubies, libs, chosen, armDeadline);
  }

  return { label, arms };
}

export function runCounterfactualReplay(cases: readonly HoleCase[], libs: ExecutorLibraries, repeats: number): CounterfactualRound[] {
  const targets = cases.filter((c) => TRUE_REGRESSION_LABELS.includes(c.label));
  const rounds: CounterfactualRound[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    for (const c of targets) rounds.push(runCounterfactualRound(c.cubies, libs, `${c.label}#${rep}`));
  }
  return rounds;
}

export interface CounterfactualCaseSummary {
  label: string;
  n: number;
  armRegressedRate: Record<ArmName, number>;
  armSucceededRate: Record<ArmName, number>;
  rootCauseArms: ArmName[]; // non-FULL arms whose regressedRate is materially lower than FULL's (removing this restores non-regression)
}

const MATERIAL_IMPROVEMENT_THRESHOLD = 0.3; // regressedRate must drop by >=30pp vs FULL to count as "this arm explains the regression" (disclosed before running)

export function summarizeCounterfactualReplay(rounds: readonly CounterfactualRound[]): CounterfactualCaseSummary[] {
  const byLabel = new Map<string, CounterfactualRound[]>();
  for (const r of rounds) {
    const caseLabel = r.label.split("#")[0];
    const list = byLabel.get(caseLabel) ?? [];
    list.push(r);
    byLabel.set(caseLabel, list);
  }

  return [...byLabel.entries()].map(([label, caseRounds]) => {
    const n = caseRounds.length;
    const armRegressedRate = {} as Record<ArmName, number>;
    const armSucceededRate = {} as Record<ArmName, number>;
    for (const arm of ARM_NAMES) {
      armRegressedRate[arm] = n ? caseRounds.filter((r) => r.arms[arm].regressed).length / n : 0;
      armSucceededRate[arm] = n ? caseRounds.filter((r) => r.arms[arm].succeeded).length / n : 0;
    }
    // "회귀"는 이 라운드-단위 프레이밍에서는 armRegressedRate(원래보다 wrongWing이 늘어남)로
    // 거의 나타나지 않는다 -- 모든 arm에서 관측된 값이 항상 0%에 가까움. Sprint 4가 정의한
    // True Regression은 "원래보다 나빠짐"이 아니라 "Baseline이 Candidate보다 더 자주
    // 성공함"(평균 비교)이었으므로, 여기서도 동일한 정의를 따라 armSucceededRate가 FULL보다
    // 얼마나 높은지로 root cause를 판정한다 -- 특정 arm을 제거했을 때 성공률이 크게 회복되면
    // 그 arm(SETUP/CCR/MIXED_COMMUTATOR/Reserved)이 이 케이스의 회귀에 직접 기여한 것.
    const fullSucceededRate = armSucceededRate.FULL;
    const rootCauseArms = ARM_NAMES.filter((arm) => arm !== "FULL" && armSucceededRate[arm] - fullSucceededRate >= MATERIAL_IMPROVEMENT_THRESHOLD);

    return { label, n, armRegressedRate, armSucceededRate, rootCauseArms };
  });
}
