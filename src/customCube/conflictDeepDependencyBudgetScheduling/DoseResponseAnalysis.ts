// --- DoseResponseAnalysis (CONFLICT_DEEP_DEPENDENCY Budget & Scheduling
// Validation Sprint v1, RQ-4, Deliverable #2) --------------------------------
// Aggregates ShadowScheduler's per-repeat outcomes across all case-repeats,
// per Arm per reservation size, into: Improved Count (this arc's own
// established "wrongWingCount net decrease" definition), Capability Delta
// (ONLY_EXISTING/ONLY_RESERVED/BOTH/NONE, mirroring Mixed Commutator
// Production Validation Sprint v2's own convention), Runtime, Budget
// Utilization (elapsed/reservationMs), and Timeout Rate (>=90% of
// reservationMs consumed).
import type { ArmName, RepeatOutcome } from "./ShadowScheduler";
import { ARM_NAMES } from "./ShadowScheduler";

export interface ArmSummaryAtSize {
  reservationMs: number;
  arm: ArmName;
  n: number;
  improvedCount: number;
  improvedRate: number;
  onlyExisting: number;
  onlyReserved: number;
  both: number;
  none: number;
  avgElapsedMs: number; // relevant primitive's own isolated elapsed time (DISRUPT for Arm A, SETUP for Arm B, avg of both for Arm C; n/a for Baseline)
  avgBudgetUtilization: number;
  timeoutRate: number;
}

function primitiveElapsedFor(arm: ArmName, r: RepeatOutcome): number | null {
  if (arm === "ARM_A_DISRUPT") return r.disruptElapsedMs;
  if (arm === "ARM_B_SETUP") return r.setupElapsedMs;
  if (arm === "ARM_C_BOTH") return (r.disruptElapsedMs + r.setupElapsedMs) / 2;
  return null;
}

function primitiveTimeoutFor(arm: ArmName, r: RepeatOutcome): boolean | null {
  if (arm === "ARM_A_DISRUPT") return r.disruptHitReservation;
  if (arm === "ARM_B_SETUP") return r.setupHitReservation;
  if (arm === "ARM_C_BOTH") return r.disruptHitReservation || r.setupHitReservation;
  return null;
}

export function summarizeArmAtSize(reservationMs: number, arm: ArmName, allRepeats: readonly RepeatOutcome[]): ArmSummaryAtSize {
  const n = allRepeats.length;
  let improvedCount = 0;
  let onlyExisting = 0;
  let onlyReserved = 0;
  let both = 0;
  let none = 0;
  const elapsedSamples: number[] = [];
  let timeoutCount = 0;
  let timeoutSamples = 0;

  for (const r of allRepeats) {
    const existingImproving = r.wrongWingAfter.BASELINE !== null && r.wrongWingAfter.BASELINE < r.wrongWingBefore;
    const armImproving = r.wrongWingAfter[arm] !== null && (r.wrongWingAfter[arm] as number) < r.wrongWingBefore;
    if (armImproving) improvedCount++;

    if (arm !== "BASELINE") {
      if (existingImproving && armImproving) both++;
      else if (existingImproving && !armImproving) onlyExisting++;
      else if (!existingImproving && armImproving) onlyReserved++;
      else none++;
    }

    const elapsed = primitiveElapsedFor(arm, r);
    if (elapsed !== null) elapsedSamples.push(elapsed);
    const timeout = primitiveTimeoutFor(arm, r);
    if (timeout !== null) {
      timeoutSamples++;
      if (timeout) timeoutCount++;
    }
  }

  const avgElapsedMs = elapsedSamples.length ? elapsedSamples.reduce((a, b) => a + b, 0) / elapsedSamples.length : 0;
  return {
    reservationMs,
    arm,
    n,
    improvedCount,
    improvedRate: n ? improvedCount / n : 0,
    onlyExisting,
    onlyReserved,
    both,
    none,
    avgElapsedMs,
    avgBudgetUtilization: reservationMs ? avgElapsedMs / reservationMs : 0,
    timeoutRate: timeoutSamples ? timeoutCount / timeoutSamples : 0,
  };
}

export function summarizeAllArmsAtSize(reservationMs: number, allRepeats: readonly RepeatOutcome[]): ArmSummaryAtSize[] {
  return ARM_NAMES.map((arm) => summarizeArmAtSize(reservationMs, arm, allRepeats));
}
