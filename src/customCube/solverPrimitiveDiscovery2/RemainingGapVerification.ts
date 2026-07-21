// --- RemainingGapVerification (Primitive Discovery Sprint #3) --------------
// STEP1. The 335-snapshot dataset (failureAnalysis/data/failures.json) was
// collected BEFORE Integration Sprint v2 shipped the REPAIR Gate
// relaxation (conflictEdgeCount>0 removed from runSuccessV2's own Gate) --
// every snapshot here may now be stale under the CURRENT production
// solver. Reuses failureAnalysis/failureReplay.ts's replayFailure()
// UNMODIFIED (same single-solve()-call staleness check pattern Primitive
// Discovery Sprint #2's own RevalidationCheck.ts already established) to
// find which snapshots the current pipeline now resolves outright, then
// recomputes structural features (primitiveDiscoverySprint2/
// StructuralRepresentation.ts's own computeStructuralFeatures, UNMODIFIED)
// to define the CURRENT Gate's reach and isolate what's still a genuine,
// unaddressed gap.
import { replayFailure } from "../failureAnalysis/failureReplay";
import type { FailureDatabase } from "../failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { computeStructuralFeatures, type StructuralFeatures } from "../primitiveDiscoverySprint2/StructuralRepresentation";

export interface GapVerificationRecord {
  hash: string;
  nowResolved: boolean; // current production solve() now fully resolves this in one call
  features: StructuralFeatures; // NOTE: this type's own `gateEligible` field is the STALE pre-relaxation definition (cycleLength 2~4 AND conflictEdgeCount>0) -- use currentGateEligible below instead
  currentGateEligible: boolean; // REPAIR's CURRENT (relaxed) Gate: cycleLength 2~4, regardless of conflictEdgeCount
}

export function verifyRemainingGap(db: FailureDatabase, snapshots: readonly FailureSnapshot[]): GapVerificationRecord[] {
  return snapshots.map((s) => {
    const replay = replayFailure(db, s.hash);
    const nowResolved = !!replay && replay.plan.score >= 0;
    const features = computeStructuralFeatures(s);
    const currentGateEligible = features.cycleLength >= 2 && features.cycleLength <= 4;
    return { hash: s.hash, nowResolved, features, currentGateEligible };
  });
}

export function cycleLengthBand(cycleLength: number): string {
  if (cycleLength === 0) return "no-cycle";
  if (cycleLength <= 4) return "2-4";
  if (cycleLength <= 6) return "5-6";
  return "7+";
}

export interface GapSummary {
  total: number;
  nowResolvedCount: number; // stale -- current pipeline (incl. relaxed REPAIR) already closes these
  currentGateEligibleCount: number; // REPAIR's own current territory (cycleLength 2~4) -- expected to mostly, but not entirely, overlap with nowResolved, since REPAIR's search can still fail Deferred Validation
  remainingGapCount: number; // !nowResolved && !currentGateEligible -- the genuine, still-open population
  byCycleLengthBand: Record<string, number>;
  conflictEdgeCountZeroInBand56: number; // the specific CCR target population size, freshly re-measured
}

export function summarizeGap(records: readonly GapVerificationRecord[]): GapSummary {
  const remaining = records.filter((r) => !r.nowResolved && !r.currentGateEligible);
  const byCycleLengthBand: Record<string, number> = {};
  for (const r of remaining) {
    const b = cycleLengthBand(r.features.cycleLength);
    byCycleLengthBand[b] = (byCycleLengthBand[b] ?? 0) + 1;
  }
  const conflictEdgeCountZeroInBand56 = remaining.filter(
    (r) => cycleLengthBand(r.features.cycleLength) === "5-6" && r.features.conflictEdgeCount === 0,
  ).length;
  return {
    total: records.length,
    nowResolvedCount: records.filter((r) => r.nowResolved).length,
    currentGateEligibleCount: records.filter((r) => r.currentGateEligible).length,
    remainingGapCount: remaining.length,
    byCycleLengthBand,
    conflictEdgeCountZeroInBand56,
  };
}

/** The CCR target population per the Blueprint: cycleLength 5-6, conflictEdgeCount=0, still genuinely open (not stale, not already REPAIR-eligible). */
export function selectCcrTarget(records: readonly GapVerificationRecord[]): GapVerificationRecord[] {
  return records.filter(
    (r) => !r.nowResolved && !r.currentGateEligible && cycleLengthBand(r.features.cycleLength) === "5-6" && r.features.conflictEdgeCount === 0,
  );
}
