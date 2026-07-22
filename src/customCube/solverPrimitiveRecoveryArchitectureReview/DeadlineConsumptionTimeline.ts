// --- DeadlineConsumptionTimeline (Recovery Architecture Review Sprint v1) --
// STEP2. Where does the real 1000ms budget actually go, on average, across
// the whole dataset? Built entirely from TaskTimeline.ts's own real trace
// parse -- no new measurement mechanism, just an aggregation.
import type { SolveTimeline } from "./TaskTimeline";

export interface DeadlineConsumptionSummary {
  n: number;
  avgPlanningMs: number; // 0 -> plan-tasks
  avgPreEndgameTaskMs: number; // plan-tasks -> the last non-ENDGAME task attempt (sum of PAIR/FLIP/PARITY)
  avgEndgameAndRecoveryMs: number; // last pre-ENDGAME attempt (or plan-tasks) -> the ENDGAME attempt itself finishing
  neverReachedEndgameRate: number; // budget ran out before the ENDGAME task attempt even started
  avgTotalMs: number;
}

export function summarizeDeadlineConsumption(timelines: readonly SolveTimeline[]): DeadlineConsumptionSummary {
  const n = timelines.length;
  let planningSum = 0;
  let preEndgameSum = 0;
  let endgameSum = 0;
  let planningCount = 0;
  let reachedEndgameCount = 0;
  let totalSum = 0;

  for (const t of timelines) {
    totalSum += t.totalMs;
    if (t.planTasksAtMs === null) continue;
    planningSum += t.planTasksAtMs;
    planningCount++;

    const endgameIdx = t.attempts.findIndex((a) => a.type === "ENDGAME");
    if (endgameIdx === -1) {
      // Budget ran out (or the plan had no ENDGAME task, e.g. already solved)
      // before the ENDGAME attempt itself ever started -- everything after
      // planning was spent on PAIR/FLIP/PARITY tasks.
      const lastAttempt = t.attempts[t.attempts.length - 1];
      preEndgameSum += (lastAttempt ? lastAttempt.atMs : t.planTasksAtMs) - t.planTasksAtMs;
      continue;
    }
    reachedEndgameCount++;
    const priorAttempt = endgameIdx > 0 ? t.attempts[endgameIdx - 1] : null;
    const preEndgameStart = t.planTasksAtMs;
    const preEndgameEnd = priorAttempt ? priorAttempt.atMs : t.planTasksAtMs;
    preEndgameSum += preEndgameEnd - preEndgameStart;
    endgameSum += t.attempts[endgameIdx].atMs - preEndgameEnd;
  }

  return {
    n,
    avgPlanningMs: planningCount ? planningSum / planningCount : 0,
    avgPreEndgameTaskMs: planningCount ? preEndgameSum / planningCount : 0,
    avgEndgameAndRecoveryMs: reachedEndgameCount ? endgameSum / reachedEndgameCount : 0,
    neverReachedEndgameRate: planningCount ? (planningCount - reachedEndgameCount) / planningCount : 0,
    avgTotalMs: n ? totalSum / n : 0,
  };
}
