// --- BudgetContractEvaluation (CCR Integration Blueprint Sprint v1) --------
// STEP3. Evaluates whether CCR's own budget (CCR Prototype Sprint v1 found
// 1000ms gives the best match rate, 53.2%) should be a FIXED budget, an
// ADAPTIVE budget, or a REMAINING-TIME-BASED budget -- grounded in the
// REAL architecture constants this Sprint is only allowed to READ
// (PLAN_TIME_BUDGET_MS from fiveByFiveEdgeSolverEngine.ts;
// RECOVERY_GEN_BUDGET_MS/RECOVERY_RETRY_BUDGET_MS/MAX_RECOVERY_RETRIES
// from fiveByFiveEdgeRecovery.ts), never modified.
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import { RECOVERY_GEN_BUDGET_MS, RECOVERY_RETRY_BUDGET_MS, MAX_RECOVERY_RETRIES } from "../fiveByFiveEdgeRecovery";
import type { BudgetSummary } from "../solverPrimitiveCCRPrototype/CCRBudgetComparison";

// Mirrors fiveByFiveEdgeExecutor.ts's own unexported RECOVERY_RESERVE_MS --
// redeclared here (not importable) as the SAME arithmetic over the real,
// imported constants above, not a new invented number.
export const RECOVERY_RESERVE_MS = RECOVERY_GEN_BUDGET_MS + MAX_RECOVERY_RETRIES * RECOVERY_RETRY_BUDGET_MS;

// The Planner+Simulation reservation fiveByFiveEdgeSolverEngine.ts's own
// solve() takes off PLAN_TIME_BUDGET_MS before the task-execution loop
// even starts (`planDeadline = Math.min(deadline, Date.now() + 200)`) --
// cited as a disclosed, hardcoded 200 (matching that file's own literal),
// since it isn't exported as a named constant.
const PLANNER_RESERVATION_MS = 200;

export type BudgetPolicy = "fixed" | "adaptive" | "remainingTime";

export interface BudgetPolicyVerdict {
  policy: BudgetPolicy;
  feasible: boolean;
  reasoning: string;
}

export interface BudgetContractEvaluation {
  planTimeBudgetMs: number;
  plannerReservationMs: number;
  recoveryReserveMs: number;
  worstCaseAvailableForRecoveryMs: number; // PLAN_TIME_BUDGET_MS - plannerReservationMs, upper bound BEFORE any PAIR/FLIP/PARITY task consumption
  ccrIdealBudgetMs: number; // CCR Prototype Sprint v1's own chosen budget
  budgetCurve: readonly BudgetSummary[];
  verdicts: BudgetPolicyVerdict[];
  recommendedPolicy: BudgetPolicy;
  recommendedFloorMs: number;
}

export function evaluateBudgetContract(budgetCurve: readonly BudgetSummary[], ccrIdealBudgetMs: number): BudgetContractEvaluation {
  const worstCaseAvailableForRecoveryMs = PLAN_TIME_BUDGET_MS - PLANNER_RESERVATION_MS;

  const verdicts: BudgetPolicyVerdict[] = [
    {
      policy: "fixed",
      feasible: false,
      reasoning:
        `CCR Prototype Sprint v1의 최선 budget(${ccrIdealBudgetMs}ms)을 고정으로 그대로 쓰면, 이는 Recovery 전체에 예약된 시간(RECOVERY_RESERVE_MS=${RECOVERY_RESERVE_MS}ms = RECOVERY_GEN_BUDGET_MS ${RECOVERY_GEN_BUDGET_MS}ms + MAX_RECOVERY_RETRIES(${MAX_RECOVERY_RETRIES})×RECOVERY_RETRY_BUDGET_MS ${RECOVERY_RETRY_BUDGET_MS}ms)의 ${(ccrIdealBudgetMs / RECOVERY_RESERVE_MS).toFixed(1)}배이고, PAIR/FLIP/PARITY 태스크가 하나도 시간을 쓰지 않는다는 비현실적 가정 하에서도 Planner 예약(${PLANNER_RESERVATION_MS}ms) 이후 남는 전체 여유(${worstCaseAvailableForRecoveryMs}ms)보다도 크다. 고정 예산은 구조적으로 성립하지 않는다.`,
    },
    {
      policy: "adaptive",
      feasible: true,
      reasoning:
        "STEP5의 Integration Simulation이 실측한 실제 잔여 시간 분포를 기준으로, 사전에 정해둔 몇 단계(예: 500/750/1000ms) 중 그 순간 감당 가능한 가장 큰 값을 고르는 방식 -- fixed보다는 현실적이지만, remainingTime 방식과 달리 여전히 '몇 단계 중 하나'라는 임의성이 남는다.",
    },
    {
      policy: "remainingTime",
      feasible: true,
      reasoning:
        "ENDGAME 기본 파이프라인이 이미 쓰는 것과 동일한 패턴(`while (Date.now() < deadline)`, fiveByFiveEdgeExecutor.ts의 runPrimaryPipeline ENDGAME 분기) -- CCR도 '그 순간 실제로 남은 deadline - Date.now()'를 그대로 예산으로 쓴다. 새 메커니즘이 아니라 기존 코드베이스 전역에 이미 있는 패턴의 재사용이다. 다만 STEP3의 Budget Contract 곡선(150ms→19.1%, 250ms→31.2%, 500ms→46.2%, 1000ms→53.2%, CCR Prototype Sprint v1 실측)에 따르면 500ms 미만으로 떨어지면 match율이 급격히 낮아지므로, 최소 확보 목표(floor)를 함께 명세해야 한다.",
    },
  ];

  return {
    planTimeBudgetMs: PLAN_TIME_BUDGET_MS,
    plannerReservationMs: PLANNER_RESERVATION_MS,
    recoveryReserveMs: RECOVERY_RESERVE_MS,
    worstCaseAvailableForRecoveryMs,
    ccrIdealBudgetMs,
    budgetCurve,
    verdicts,
    recommendedPolicy: "remainingTime",
    recommendedFloorMs: 500,
  };
}
