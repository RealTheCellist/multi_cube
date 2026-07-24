// --- PrimitiveAttribution (Production Integration Finalization Sprint v1,
// STEP3) --------------------------------------------------------------------
// Aggregates per-primitive invocation/success across a population of real
// EndToEndSolveResult -- both Task-layer (PAIR/FLIP/PARITY/ENDGAME, the
// Planner's own SolveTask types) and Recovery-layer (DISRUPT/SETUP/REPAIR/
// CCR, only ever reached for ENDGAME tasks).
import type { EndToEndSolveResult } from "./EndToEndSolveProbe";
import type { SolveTaskType, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export interface TaskTypeStats {
  taskType: SolveTaskType;
  plannedCount: number;
  completedCount: number;
  successRate: number; // completedCount / plannedCount
}

export interface RecoveryTypeStats {
  recoveryType: RecoveryType;
  offeredCount: number; // how many recovery events included this type as a candidate
  chosenCount: number; // how many times chooseBestRecovery picked this type
  succeededCount: number; // how many times a choice of this type led to overall recovery success
  chosenRate: number; // chosenCount / offeredCount -- "when offered, how often does it win?"
  successRateWhenChosen: number; // succeededCount / chosenCount
}

export interface PrimitiveAttributionSummary {
  n: number;
  taskStats: TaskTypeStats[];
  recoveryStats: RecoveryTypeStats[];
  recoveryTriggeredCount: number;
  recoveryNoCandidatesCount: number;
  recoveryLoopDetectedCount: number;
}

const ALL_TASK_TYPES: SolveTaskType[] = ["PAIR", "FLIP", "PARITY", "ENDGAME"];
const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR"];

export function summarizePrimitiveAttribution(results: readonly EndToEndSolveResult[]): PrimitiveAttributionSummary {
  const n = results.length;

  const taskStats: TaskTypeStats[] = ALL_TASK_TYPES.map((taskType) => {
    const plannedCount = results.reduce((a, r) => a + r.plannedTaskTypes.filter((t) => t === taskType).length, 0);
    const completedCount = results.reduce((a, r) => a + r.completedTaskTypes.filter((t) => t === taskType).length, 0);
    return { taskType, plannedCount, completedCount, successRate: plannedCount ? completedCount / plannedCount : 0 };
  });

  const recoveryStats: RecoveryTypeStats[] = ALL_RECOVERY_TYPES.map((recoveryType) => {
    let offeredCount = 0;
    let chosenCount = 0;
    let succeededCount = 0;
    for (const r of results) {
      const outcome = r.recoveryOutcome;
      if (!outcome) continue;
      if (outcome.candidatesOffered.includes(recoveryType)) offeredCount++;
      if (outcome.chosenType === recoveryType) {
        chosenCount++;
        if (outcome.succeeded) succeededCount++;
      }
    }
    return {
      recoveryType,
      offeredCount,
      chosenCount,
      succeededCount,
      chosenRate: offeredCount ? chosenCount / offeredCount : 0,
      successRateWhenChosen: chosenCount ? succeededCount / chosenCount : 0,
    };
  });

  return {
    n,
    taskStats,
    recoveryStats,
    recoveryTriggeredCount: results.filter((r) => r.recoveryTriggered).length,
    recoveryNoCandidatesCount: results.filter((r) => r.recoveryOutcome?.chosenType === null && r.recoveryTriggered).length,
    recoveryLoopDetectedCount: results.filter((r) => r.recoveryOutcome?.loopDetected).length,
  };
}
