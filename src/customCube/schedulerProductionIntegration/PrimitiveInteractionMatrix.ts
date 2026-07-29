// --- PrimitiveInteractionMatrix (CONFLICT_DEEP_DEPENDENCY Scheduler
// Production Integration Sprint v1, STEP5) ---------------------------------
// Answers "did SETUP Last-Resort ordering hurt DISRUPT/REPAIR/CCR/
// MIXED_COMMUTATOR" directly from the N>=30 Production Replay data
// already collected in STEP2/4 -- no new probing pass needed, since
// ProductionReplayCollector's PerCaseRunRecord already carries
// baselineChosenType/baselineCandidatesOffered and their candidate-arm
// counterparts per round. "Invocation" = type appeared in
// candidatesOffered (a real candidate was generated, whether or not
// chosen); "Selected" = type was the round's chosenType; "Success" =
// selected AND the round's overall wrongWingAfter improved.
import type { RunRecord } from "../schedulerPrototypeSprintV1/ProductionReplayCollector";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

const ALL_TYPES: readonly (RecoveryType | "none")[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR", "none"];

export interface PrimitiveInteractionRow {
  type: RecoveryType | "none";
  baselineInvocationCount: number;
  baselineInvocationRate: number;
  baselineSelectedCount: number;
  baselineSelectedRate: number;
  baselineSuccessCount: number;
  baselineSuccessRate: number; // success rate given selected
  candidateInvocationCount: number;
  candidateInvocationRate: number;
  candidateSelectedCount: number;
  candidateSelectedRate: number;
  candidateSuccessCount: number;
  candidateSuccessRate: number;
}

export function buildPrimitiveInteractionMatrix(runs: readonly RunRecord[]): PrimitiveInteractionRow[] {
  const flat = runs.flat();
  const n = flat.length;

  return ALL_TYPES.map((type) => {
    const isNone = type === "none";
    const baselineInvoked = flat.filter((r) => (isNone ? r.baselineCandidatesOffered.length === 0 : r.baselineCandidatesOffered.includes(type as RecoveryType)));
    const baselineSelected = flat.filter((r) => r.baselineChosenType === type);
    const baselineSelectedSucceeded = baselineSelected.filter((r) => r.baselineSucceeded);
    const candidateInvoked = flat.filter((r) => (isNone ? r.candidateCandidatesOffered.length === 0 : r.candidateCandidatesOffered.includes(type as RecoveryType)));
    const candidateSelected = flat.filter((r) => r.candidateChosenType === type);
    const candidateSelectedSucceeded = candidateSelected.filter((r) => r.candidateSucceeded);

    return {
      type,
      baselineInvocationCount: baselineInvoked.length,
      baselineInvocationRate: n ? baselineInvoked.length / n : 0,
      baselineSelectedCount: baselineSelected.length,
      baselineSelectedRate: n ? baselineSelected.length / n : 0,
      baselineSuccessCount: baselineSelectedSucceeded.length,
      baselineSuccessRate: baselineSelected.length ? baselineSelectedSucceeded.length / baselineSelected.length : 0,
      candidateInvocationCount: candidateInvoked.length,
      candidateInvocationRate: n ? candidateInvoked.length / n : 0,
      candidateSelectedCount: candidateSelected.length,
      candidateSelectedRate: n ? candidateSelected.length / n : 0,
      candidateSuccessCount: candidateSelectedSucceeded.length,
      candidateSuccessRate: candidateSelected.length ? candidateSelectedSucceeded.length / candidateSelected.length : 0,
    };
  });
}
