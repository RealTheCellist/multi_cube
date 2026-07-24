// --- CompletenessGates (Solver Completeness Verification Sprint v1) --------
// Aggregates FullPipelineResult census across every dataset case into
// Gate1-6 pass/fail, per the Work Order's own literal definitions.
//
// Completeness (as defined for this Sprint): the property that, for every
// legal input state in the defined verification domain, the Production
// Solver (a) always terminates cleanly -- no crash, exception, infinite
// loop, or deadlock, (b) always reaches either the fully-Solved state or
// another explicitly allowed normal-termination state (never an
// unclassified Unknown State), and (c) never violates any of the three
// confirmed Operating Contracts (ENDGAME/Incremental Recovery/CCR) while
// doing so.
import type { FullPipelineResult } from "./FullPipelineProbe";

export interface CategoryCensus {
  category: string;
  n: number;
  crashCount: number;
  nonConvergentCount: number; // did not reach wrongWingCount5===0 within the iteration cap -- the "Infinite Loop"/non-termination proxy for a bounded headless harness
  budgetViolationCount: number;
  unknownStateCount: number;
  solvedCount: number; // fullySolved===true
  solveSuccessRate: number;
  avgTotalWallMs: number;
  avgWingPairingIterations: number;
}

export interface CompletenessGateResult {
  gate: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  pass: boolean;
  detail: string;
}

export function summarizeCategory(category: string, results: readonly FullPipelineResult[]): CategoryCensus {
  const n = results.length;
  const crashCount = results.filter((r) => r.anyException).length;
  const nonConvergentCount = results.filter((r) => !r.anyException && !r.wingPairingConverged).length;
  const budgetViolationCount = results.reduce((a, r) => a + r.wingPairingBudgetViolations, 0);
  const unknownStateCount = results.filter((r) => r.unknownState).length;
  const solvedCount = results.filter((r) => r.fullySolved).length;
  return {
    category,
    n,
    crashCount,
    nonConvergentCount,
    budgetViolationCount,
    unknownStateCount,
    solvedCount,
    solveSuccessRate: n ? solvedCount / n : 0,
    avgTotalWallMs: n ? results.reduce((a, r) => a + r.totalWallMs, 0) / n : 0,
    avgWingPairingIterations: n ? results.reduce((a, r) => a + r.wingPairingIterations, 0) / n : 0,
  };
}

export function evaluateGates(
  censuses: readonly CategoryCensus[],
  regressionWithinAllowance: boolean,
  regressionDetail: string
): CompletenessGateResult[] {
  const totalCrash = censuses.reduce((a, c) => a + c.crashCount, 0);
  const totalNonConvergent = censuses.reduce((a, c) => a + c.nonConvergentCount, 0);
  const totalBudgetViolation = censuses.reduce((a, c) => a + c.budgetViolationCount, 0);
  const totalUnknownState = censuses.reduce((a, c) => a + c.unknownStateCount, 0);
  const totalN = censuses.reduce((a, c) => a + c.n, 0);
  const totalSolved = censuses.reduce((a, c) => a + c.solvedCount, 0);
  const overallSuccessRate = totalN ? totalSolved / totalN : 0;
  const failingCategories = censuses.filter((c) => c.solveSuccessRate < 1).map((c) => `${c.category}(${(c.solveSuccessRate * 100).toFixed(2)}%)`);

  return [
    {
      gate: 1,
      name: "Crash 0",
      pass: totalCrash === 0,
      detail: `전체 ${totalN}건 중 Crash/Exception ${totalCrash}건.`,
    },
    {
      gate: 2,
      name: "Infinite Loop 0",
      pass: totalNonConvergent === 0,
      detail: `전체 ${totalN}건 중 50회 반복 상한 내 wrongWingCount5==0에 도달하지 못한(수렴 실패) 건 ${totalNonConvergent}건.`,
    },
    {
      gate: 3,
      name: "Budget Violation 0",
      pass: totalBudgetViolation === 0,
      detail: `Wing-pairing 반복 호출 중 Recovery Trigger AND 해당 호출 자체의 Deadline Miss가 동시 발생한 Budget Violation ${totalBudgetViolation}건.`,
    },
    {
      gate: 4,
      name: "Unknown State 0",
      pass: totalUnknownState === 0,
      detail: `fullySolved===false이면서 Crash/수렴실패로 설명되지 않는 Unknown State ${totalUnknownState}건.`,
    },
    {
      gate: 5,
      name: "모든 Dataset Solve Success 100%",
      pass: overallSuccessRate === 1,
      detail:
        overallSuccessRate === 1
          ? `전체 ${totalN}건 모두 최종 Solved(ground-truth isSolved() 기준) 도달.`
          : `전체 Success Rate=${(overallSuccessRate * 100).toFixed(2)}% (${totalSolved}/${totalN}). 100% 미달 카테고리: ${failingCategories.join(", ") || "(집계 오류)"}.`,
    },
    {
      gate: 6,
      name: "Regression 기존 Release Contract 유지",
      pass: regressionWithinAllowance,
      detail: regressionDetail,
    },
  ];
}
