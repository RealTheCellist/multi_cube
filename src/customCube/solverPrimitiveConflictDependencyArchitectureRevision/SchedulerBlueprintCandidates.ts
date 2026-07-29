// --- SchedulerBlueprintCandidates (CONFLICT_DEEP_DEPENDENCY Architecture
// Revision Sprint v1, STEP5) --------------------------------------------------
// Describes the 4 Scheduler revision Options the Directive names, with a
// disclosed Risk/Production-impact/Regression/Runtime assessment for each --
// AND quantitatively tests the one candidate expressible as a pure SELECTION
// policy change (never touching chooseBestRecovery() itself, never touching
// fiveByFiveEdgeRecovery.ts): "SETUP as last resort" -- pick the best NON-
// SETUP candidate first; only fall back to SETUP if no other candidate was
// offered at all. This is Option A ("SETUP Reserved를 기존 후보와 별도 Queue로
//평가") and Option C ("chooseBestRecovery score 수정") combined into their
// simplest joint form: SETUP effectively gets its own last-priority queue,
// which is equivalent to demoting its score below every other real
// candidate without needing to guess a numeric score-adjustment scale (the
// Evaluator's score units were never disclosed/calibrated for this purpose,
// so a RANK-based demotion is the only assumption-free way to test "make
// SETUP less eager to win" quantitatively).
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

/** SETUP-as-last-resort selection: never touches chooseBestRecovery() itself
 * -- an independent selection function applied to the SAME real candidate
 * array generateRecoveryStrategies() already returned. */
function chooseWithSetupLastResort(candidates: readonly RecoveryStrategy[]): RecoveryStrategy | null {
  const nonSetup = candidates.filter((c) => c.type !== "SETUP");
  if (nonSetup.length > 0) return chooseBestRecovery(nonSetup);
  return chooseBestRecovery(candidates);
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

export const POLICY_NAMES = ["PRODUCTION_TODAY", "SETUP_LAST_RESORT"] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];

export interface PolicyRound {
  label: string;
  policies: Record<PolicyName, { succeeded: boolean; regressed: boolean; chosenType: RecoveryType | "none" }>;
}

export function runPolicyRound(cubies: Cubie[], libs: ExecutorLibraries, label: string): PolicyRound {
  const deadline = Date.now() + CALL_DEADLINE_MS;
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", undefined, true, true, true);

  const productionChosen = chooseBestRecovery(candidates);
  const lastResortChosen = chooseWithSetupLastResort(candidates);

  return {
    label,
    policies: {
      PRODUCTION_TODAY: applyChosenAndRetry(cubies, libs, productionChosen, deadline),
      SETUP_LAST_RESORT: applyChosenAndRetry(cubies, libs, lastResortChosen, deadline),
    },
  };
}

export function runPolicySimulation(cases: readonly HoleCase[], libs: ExecutorLibraries, repeats: number): PolicyRound[] {
  const rounds: PolicyRound[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    for (const c of cases) rounds.push(runPolicyRound(c.cubies, libs, `${c.label}#${rep}`));
  }
  return rounds;
}

export interface PolicySummary {
  policy: PolicyName;
  n: number;
  improvedRate: number;
  regressedCount: number;
}

export function summarizePolicySimulation(rounds: readonly PolicyRound[]): PolicySummary[] {
  const n = rounds.length;
  return POLICY_NAMES.map((policy) => {
    const outcomes = rounds.map((r) => r.policies[policy]);
    return {
      policy,
      n,
      improvedRate: n ? outcomes.filter((o) => o.succeeded).length / n : 0,
      regressedCount: outcomes.filter((o) => o.regressed).length,
    };
  });
}

export interface SchedulerOption {
  name: string;
  description: string;
  risk: "낮음" | "중간" | "높음";
  productionImpact: string;
  regressionPotential: string;
  runtimeImpact: string;
  quantitativelyTested: boolean;
}

/** Descriptive Option catalog -- Options A/D are structurally similar to the
 * quantitatively-tested SETUP_LAST_RESORT policy (A) or require deeper
 * Scheduler surgery this Sprint doesn't implement (D); B and C are evaluated
 * against this Sprint's OWN measured data (STEP1-4) where possible. */
export function buildSchedulerOptionCatalog(policySummaries: readonly PolicySummary[]): SchedulerOption[] {
  const production = policySummaries.find((p) => p.policy === "PRODUCTION_TODAY")!;
  const lastResort = policySummaries.find((p) => p.policy === "SETUP_LAST_RESORT")!;

  return [
    {
      name: "Option A -- SETUP Reserved를 별도 Queue로 평가 (Last-Resort)",
      description: `SETUP을 다른 후보와 동일한 chooseBestRecovery() argmax 경쟁에 넣지 않고, 다른 타입이 전혀 없을 때만 마지막 수단으로 시도. 이 Sprint에서 실측: improvedRate ${(production.improvedRate * 100).toFixed(1)}% (Production Today) -> ${(lastResort.improvedRate * 100).toFixed(1)}% (SETUP Last-Resort), regressedCount ${production.regressedCount} -> ${lastResort.regressedCount}.`,
      risk: "낮음",
      productionImpact: "chooseBestRecovery() 자체는 수정하지 않고 그 앞에 얇은 selection 레이어만 추가 -- 기존 코드 재사용률 높음.",
      regressionPotential: lastResort.regressedCount < production.regressedCount ? "실측상 감소 확인" : "실측상 개선 없음 또는 악화",
      runtimeImpact: "SETUP이 이미 생성된 후보 중 하나이므로 추가 생성 비용 없음 -- Runtime 영향 없음.",
      quantitativelyTested: true,
    },
    {
      name: "Option B -- CCR Winner 이후 SETUP 재도전",
      description: "CCR이 성공 후보를 못 찾았을 때만 SETUP을 시도하도록 순서를 뒤집는 방안. Option A(Last-Resort)와 유사한 방향이나 CCR 전용으로 더 좁게 적용 -- 이번 Sprint는 Option A로 통합 테스트했으므로 별도 수치 없음, Option A 결과가 이 방향의 타당성에 대한 근거 자료로 대체 가능.",
      risk: "중간",
      productionImpact: "CCR의 remainingTime 예산 계산이 SETUP의 실행 여부에 의존하게 되어 스케줄링 순서 변경이 REPAIR/MIXED_COMMUTATOR에도 파급될 수 있음.",
      regressionPotential: "Option A와 유사한 개선 방향 기대되나 별도 실측 필요.",
      runtimeImpact: "SETUP이 조건부로만 실행되므로 Runtime 절감 가능성 있음(항상 500ms 소진하지 않음).",
      quantitativelyTested: false,
    },
    {
      name: "Option C -- chooseBestRecovery score 수정",
      description: "SETUP 후보의 score에 페널티를 적용해 실제 성공 가능성을 반영. Evaluator score의 단위가 이 Sprint 범위에서 보정되지 않아 임의의 배율/상수를 고르는 대신, Rank 기반 최하위 우선순위(Option A의 Last-Resort 정책)로 대체 테스트함 -- 결과는 Option A 항목과 동일.",
      risk: "중간",
      productionImpact: "chooseBestRecovery() 자체를 수정해야 하므로 이번 Sprint의 '계측만 수행' 범위를 벗어남 -- 다음 Prototype Sprint에서 실제 코드 변경 필요.",
      regressionPotential: "Option A의 실측 결과가 방향성의 근거.",
      runtimeImpact: "없음 (선택 로직만 변경).",
      quantitativelyTested: false,
    },
    {
      name: "Option D -- Hybrid Additive Scheduler",
      description: "SETUP을 Shadow Sprint처럼 기존 후보에 추가만 하되(대체하지 않고), chooseBestRecovery()가 아니라 '기존 최선 후보가 실패할 때만' SETUP을 추가 시도하는 2단계 파이프라인. STEP2의 ADDITIVE arm이 이 방향의 예비 데이터에 해당.",
      risk: "높음",
      productionImpact: "attemptRecovery()의 MAX_RECOVERY_RETRIES 루프 구조 자체를 변경해야 할 가능성 -- 가장 큰 구조 변경.",
      regressionPotential: "STEP2 ADDITIVE arm 참조 -- 이론상 회귀 없음(상위집합 특성)이나 Runtime 비용 증가.",
      runtimeImpact: "최선 후보 실패 후 SETUP을 추가로 시도하므로 Worst-case Runtime 증가(최대 500ms 추가).",
      quantitativelyTested: false,
    },
  ];
}
