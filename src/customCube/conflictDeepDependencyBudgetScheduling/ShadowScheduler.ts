// --- ShadowScheduler (CONFLICT_DEEP_DEPENDENCY Budget & Scheduling
// Validation Sprint v1, RQ-1/RQ-2/RQ-3) --------------------------------------
// Compares current Production's shared-slice scheduling (Baseline: the
// REAL, unmodified generateRecoveryStrategies()/chooseBestRecovery(), which
// already gives DISRUPT/SETUP a shared genDeadline-divided slice) against
// 3 hypothetical Reserved-Slice Arms, WITHOUT ever modifying
// fiveByFiveEdgeRecovery.ts:
//   - Arm A: DISRUPT gets an ADDITIONAL synthetic candidate computed under
//     its own reserved-slice budget (off the OUTER deadline, matching
//     REPAIR/MIXED_COMMUTATOR's own established reserved-slice pattern),
//     competing alongside the real Baseline candidates in the REAL,
//     unmodified chooseBestRecovery().
//   - Arm B: same, but for SETUP.
//   - Arm C: both DISRUPT and SETUP get their own reserved-slice synthetic
//     candidate simultaneously.
// This measures the MARGINAL benefit of reserved-slice scheduling: since
// each Arm's candidate set is Baseline's own real candidates PLUS one (or
// two) extra synthetic reserved candidates, chooseBestRecovery() can only
// pick the reserved candidate if it is genuinely better -- an Arm can never
// score worse than Baseline by construction (its candidate set is a
// superset), so any measured difference is a real capability gain, not an
// artifact of removing something Baseline had.
//
// OUTER_DEADLINE_MS=1000 matches this arc's own established "realistic
// per-call budget" convention (BASE_CANDIDATE_BUDGET_MS in Production
// Validation Sprint v2's CaseMeasurement.ts / RECOVERY_ATTEMPT_BUDGET_MS in
// Primitive Set Completeness Validation Sprint v2's RecoveryAttemptProbe.ts).
// RESERVATION_SIZES_MS=[75,150,300,500] matches the Directive's own
// requested dose-response sizes -- 75 is REPAIR_RESERVED_SLICE_MS's own
// real value, 300 is MIXED_COMMUTATOR_RESERVED_SLICE_MS's own real value,
// both already validated in production.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import { buildSyntheticReservedCandidate } from "./SyntheticReservedCandidate";

export const OUTER_DEADLINE_MS = 1000;
export const RESERVATION_SIZES_MS: readonly number[] = [75, 150, 300, 500];
export const SHADOW_REPEATS = 10;

export const ARM_NAMES = ["BASELINE", "ARM_A_DISRUPT", "ARM_B_SETUP", "ARM_C_BOTH"] as const;
export type ArmName = (typeof ARM_NAMES)[number];

export interface RepeatOutcome {
  wrongWingBefore: number;
  wrongWingAfter: Record<ArmName, number | null>;
  chosenType: Record<ArmName, RecoveryType | null>;
  baselineElapsedMs: number;
  disruptElapsedMs: number;
  setupElapsedMs: number;
  disruptHitReservation: boolean; // elapsed >= 90% of reservationMs
  setupHitReservation: boolean;
}

function applyAndMeasure(cubies: Cubie[], best: RecoveryStrategy | null): number | null {
  if (!best) return null;
  const clone = cloneCubies(cubies);
  applySeq(clone, best.moves);
  return wrongWingCount5(clone);
}

export function measureRepeat(cubies: Cubie[], libs: ExecutorLibraries, reservationMs: number, outerDeadlineMs: number = OUTER_DEADLINE_MS): RepeatOutcome {
  const wrongWingBefore = wrongWingCount5(cubies);

  const baselineDeadline = Date.now() + outerDeadlineMs;
  const baselineStart = Date.now();
  const baselineCandidates: RecoveryStrategy[] = generateRecoveryStrategies(cloneCubies(cubies), libs, baselineDeadline, undefined, true, "reservedBudget", undefined, true, true);
  const baselineElapsedMs = Date.now() - baselineStart;

  const disruptDeadline = Date.now() + reservationMs;
  const disruptStart = Date.now();
  const disruptMoves = tryEndgameThroughDisruption(cloneCubies(cubies), libs.lib, libs.flipLib, disruptDeadline, 2, 1, libs.caseLib);
  const disruptElapsedMs = Date.now() - disruptStart;
  const disruptHitReservation = disruptElapsedMs >= reservationMs * 0.9;
  const syntheticDisrupt = disruptMoves ? buildSyntheticReservedCandidate(cubies, disruptMoves, "DISRUPT", reservationMs) : null;

  const setupDeadline = Date.now() + reservationMs;
  const setupStart = Date.now();
  const setupMoves = tryEndgameMultiPly(cloneCubies(cubies), libs.lib, libs.flipLib, setupDeadline);
  const setupElapsedMs = Date.now() - setupStart;
  const setupHitReservation = setupElapsedMs >= reservationMs * 0.9;
  const syntheticSetup = setupMoves ? buildSyntheticReservedCandidate(cubies, setupMoves, "SETUP", reservationMs) : null;

  const armCandidates: Record<ArmName, RecoveryStrategy[]> = {
    BASELINE: baselineCandidates,
    ARM_A_DISRUPT: syntheticDisrupt ? [...baselineCandidates, syntheticDisrupt] : baselineCandidates,
    ARM_B_SETUP: syntheticSetup ? [...baselineCandidates, syntheticSetup] : baselineCandidates,
    ARM_C_BOTH: [...baselineCandidates, ...(syntheticDisrupt ? [syntheticDisrupt] : []), ...(syntheticSetup ? [syntheticSetup] : [])],
  };

  const wrongWingAfter = {} as Record<ArmName, number | null>;
  const chosenType = {} as Record<ArmName, RecoveryType | null>;
  for (const arm of ARM_NAMES) {
    const best = chooseBestRecovery(armCandidates[arm]);
    wrongWingAfter[arm] = applyAndMeasure(cubies, best);
    chosenType[arm] = best?.type ?? null;
  }

  return { wrongWingBefore, wrongWingAfter, chosenType, baselineElapsedMs, disruptElapsedMs, setupElapsedMs, disruptHitReservation, setupHitReservation };
}

export function measureCaseAtReservation(cubies: Cubie[], libs: ExecutorLibraries, reservationMs: number, nRepeats: number = SHADOW_REPEATS): RepeatOutcome[] {
  const repeats: RepeatOutcome[] = [];
  for (let r = 0; r < nRepeats; r++) repeats.push(measureRepeat(cubies, libs, reservationMs));
  return repeats;
}
