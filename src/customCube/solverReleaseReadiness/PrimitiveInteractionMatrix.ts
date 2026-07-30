// --- PrimitiveInteractionMatrix (Solver Release Readiness Validation
// Sprint v1, STEP4) -----------------------------------------------------
// Extends productionIntegrationFinalization/PrimitiveAttribution.ts's
// pattern (disclosed duplicate, since that file's ALL_RECOVERY_TYPES
// predates MIXED_COMMUTATOR): Task-layer (PAIR/FLIP/PARITY/ENDGAME -- the
// real production SolveTaskType union) and Recovery-layer (DISRUPT/SETUP/
// REPAIR/CCR/MIXED_COMMUTATOR -- the real production RecoveryType union)
// invocation/selection/success, PLUS two additional checks this Sprint's
// own Directive asks for that no prior Sprint measured:
//   - Duplicate: how often the SAME RecoveryType appears more than once in
//     one round's own candidatesOffered list (a structural invariant that
//     should never legitimately happen -- each gen*() function runs at
//     most once per round).
//   - Starvation: a RecoveryType that IS offered a meaningful number of
//     times but is essentially never selected when it competes (disclosed
//     threshold: offered >=5 times AND selectedRate-when-offered < 5%) --
//     flags any candidate the Scheduler/Evaluator combination might be
//     systematically starving out.
//
// Note on the Directive's own "BASE/FLIP/CASE/PARITY/BP-1" naming: per
// docs/ARCHITECTURE.md section 2 (its own explicit disclosure), that
// five-way label set is `AllowedPrimitive` from
// solverRepresentationPrototype/RepresentationPrimitiveSelector.ts -- a
// RESEARCH-ONLY classification predating the Planner/Executor/Recovery
// architecture, used only to tag snapshots for an old benchmark's "Gap"
// concept. It has no live production dispatch meaning today. This Sprint
// therefore measures the REAL production task/recovery taxonomy instead
// (SolveTaskType + RecoveryType) -- the only classification that actually
// governs what code runs.
import type { EndToEndSolveResult } from "./EndToEndSolveProbe";
import type { SolveTaskType, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export interface TaskTypeStats {
  taskType: SolveTaskType;
  plannedCount: number;
  completedCount: number;
  successRate: number;
}

export interface RecoveryTypeStats {
  recoveryType: RecoveryType;
  offeredCount: number;
  chosenCount: number;
  succeededCount: number;
  chosenRate: number;
  successRateWhenChosen: number;
  duplicateCount: number; // rounds where this type appeared >1x in candidatesOffered
  starved: boolean; // offeredCount>=STARVATION_MIN_OFFERED && chosenRate<STARVATION_MAX_CHOSEN_RATE
}

export interface PrimitiveInteractionSummary {
  n: number;
  taskStats: TaskTypeStats[];
  recoveryStats: RecoveryTypeStats[];
  recoveryTriggeredCount: number;
  recoveryNoCandidatesCount: number;
  recoveryLoopDetectedCount: number;
}

const ALL_TASK_TYPES: SolveTaskType[] = ["PAIR", "FLIP", "PARITY", "ENDGAME"];
const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR"];

const STARVATION_MIN_OFFERED = 5;
const STARVATION_MAX_CHOSEN_RATE = 0.05;

export function summarizePrimitiveInteraction(results: readonly EndToEndSolveResult[]): PrimitiveInteractionSummary {
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
    let duplicateCount = 0;
    for (const r of results) {
      const outcome = r.recoveryOutcome;
      if (!outcome) continue;
      const occurrences = outcome.candidatesOffered.filter((t) => t === recoveryType).length;
      if (occurrences > 0) offeredCount++;
      if (occurrences > 1) duplicateCount++;
      if (outcome.chosenType === recoveryType) {
        chosenCount++;
        if (outcome.succeeded) succeededCount++;
      }
    }
    const chosenRate = offeredCount ? chosenCount / offeredCount : 0;
    return {
      recoveryType,
      offeredCount,
      chosenCount,
      succeededCount,
      chosenRate,
      successRateWhenChosen: chosenCount ? succeededCount / chosenCount : 0,
      duplicateCount,
      starved: offeredCount >= STARVATION_MIN_OFFERED && chosenRate < STARVATION_MAX_CHOSEN_RATE,
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
