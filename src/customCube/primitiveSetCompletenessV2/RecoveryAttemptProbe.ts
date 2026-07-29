// --- RecoveryAttemptProbe (Solver Primitive Set Completeness Validation
// Sprint v2, Measurement requirement: solvedByRecovery/recoveryType/
// recoveryAttempts; Required Analysis #4 Primitive Coverage) -----------------
// Calls the REAL, unmodified, current-production generateRecoveryStrategies()
// / chooseBestRecovery() (Gate C, exactly as wired into fiveByFiveEdgeRecovery
// .ts by Gate Production Integration Sprint v1 -- no parameter here
// reconstructs an old Gate, this Sprint measures CURRENT production as-is)
// against each residual case, N repeats (this arc's own established N=10
// convention, since DISRUPT/SETUP draw from shuffle()-driven stochastic
// search -- a single pass cannot tell "never attempted" from "attempted but
// unlucky"). Per repeat, `onEvent`'s own existing instrumentation hook
// (SchedulingEvent, already used unmodified by every prior Sprint in this
// arc) records which of DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR reached
// "start" (ATTEMPTED) and which reached "generated" (PRODUCED a candidate) --
// no Recovery-layer code is touched, this only listens to an existing hook.
//
// Budget: BASE_CANDIDATE_BUDGET_MS=1000, matching Production Validation
// Sprint v2's own CaseMeasurement.ts convention for a single
// generateRecoveryStrategies() call (this arc's own established "realistic
// per-call budget" number) -- a FRESH Date.now()+budgetMs computed
// independently each repeat (per this arc's own established fix for the
// "shared/stale precomputed deadline" bug class hit twice before).
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { SchedulingEvent } from "../fiveByFiveEdgeRecovery";

export const RECOVERY_ATTEMPT_BUDGET_MS = 1000;
export const RECOVERY_ATTEMPT_REPEATS = 10;

export const RECOVERY_TYPES_V2: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR"];

export interface RecoveryAttemptResult {
  label: string;
  wrongWingBefore: number;
  attemptedBy: Record<RecoveryType, number>; // repeats (of N) where this type reached "start"
  producedBy: Record<RecoveryType, number>; // repeats (of N) where this type reached "generated" (produced >=1 candidate)
  solvedByRecoveryCount: number; // repeats (of N) where chooseBestRecovery's pick strictly improved wrongWingCount
  chosenTypeCounts: Record<RecoveryType, number>; // repeats where this type was chosen by chooseBestRecovery AND improved
  solvedByRecovery: boolean; // solvedByRecoveryCount > 0 -- did Recovery EVER solve this across N repeats
  recoveryType: RecoveryType | null; // the type most often responsible for a solving repeat (mode), null if never solved
  recoveryAttempts: number; // == RECOVERY_ATTEMPT_REPEATS, disclosed here for the report
}

function zeroRecord(): Record<RecoveryType, number> {
  return { DISRUPT: 0, SETUP: 0, REPAIR: 0, CCR: 0, MIXED_COMMUTATOR: 0 };
}

export function probeRecoveryAttempts(cubies: Cubie[], label: string, libs: ExecutorLibraries, nRepeats: number = RECOVERY_ATTEMPT_REPEATS): RecoveryAttemptResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  const attemptedBy = zeroRecord();
  const producedBy = zeroRecord();
  const chosenTypeCounts = zeroRecord();
  let solvedByRecoveryCount = 0;

  for (let r = 0; r < nRepeats; r++) {
    const seenStart = new Set<RecoveryType>();
    const seenGenerated = new Set<RecoveryType>();
    const onEvent = (e: SchedulingEvent) => {
      if (e.phase === "start") seenStart.add(e.candidateType);
      if (e.phase === "generated") seenGenerated.add(e.candidateType);
    };
    const deadline = Date.now() + RECOVERY_ATTEMPT_BUDGET_MS; // fresh per repeat -- avoids the shared/stale-deadline bug class
    const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true);
    for (const t of RECOVERY_TYPES_V2) {
      if (seenStart.has(t)) attemptedBy[t]++;
      if (seenGenerated.has(t)) producedBy[t]++;
    }

    const best = chooseBestRecovery(candidates);
    if (best) {
      const probe = cloneCubies(cubies);
      applySeq(probe, best.moves);
      const wrongWingAfter = wrongWingCount5(probe);
      if (wrongWingAfter < wrongWingBefore) {
        solvedByRecoveryCount++;
        chosenTypeCounts[best.type]++;
      }
    }
  }

  const solvedByRecovery = solvedByRecoveryCount > 0;
  let recoveryType: RecoveryType | null = null;
  if (solvedByRecovery) {
    recoveryType = RECOVERY_TYPES_V2.reduce((best, t) => (chosenTypeCounts[t] > (chosenTypeCounts[best] ?? -1) ? t : best), RECOVERY_TYPES_V2[0]);
    if (chosenTypeCounts[recoveryType] === 0) recoveryType = null;
  }

  return { label, wrongWingBefore, attemptedBy, producedBy, solvedByRecoveryCount, chosenTypeCounts, solvedByRecovery, recoveryType, recoveryAttempts: nRepeats };
}

export interface RecoveryCoverageSummary {
  n: number;
  solvedByRecoveryCount: number;
  solvedByRecoveryRate: number;
  attemptedRateByType: Record<RecoveryType, number>; // fraction of cases where type was EVER attempted (>=1 of N repeats)
  producedRateByType: Record<RecoveryType, number>; // fraction of cases where type EVER produced a candidate
}

export function summarizeRecoveryCoverage(results: RecoveryAttemptResult[]): RecoveryCoverageSummary {
  const n = results.length;
  const solvedByRecoveryCount = results.filter((r) => r.solvedByRecovery).length;
  const attemptedRateByType = zeroRecord();
  const producedRateByType = zeroRecord();
  for (const t of RECOVERY_TYPES_V2) {
    attemptedRateByType[t] = n ? results.filter((r) => r.attemptedBy[t] > 0).length / n : 0;
    producedRateByType[t] = n ? results.filter((r) => r.producedBy[t] > 0).length / n : 0;
  }
  return { n, solvedByRecoveryCount, solvedByRecoveryRate: n ? solvedByRecoveryCount / n : 0, attemptedRateByType, producedRateByType };
}
