// --- SystemStability (Production Integration Validation Sprint v1, STEP7)
// -------------------------------------------------------------------------
// Determinism: the Directive asks whether "동일 입력 -> 동일 결과" holds.
// This whole research arc has already established, repeatedly, that
// solve() is genuinely stochastic (shuffle()-driven) -- literal
// determinism does not hold by design, not by defect. This module
// reconfirms that directly (small, cheap check) rather than assuming it,
// then reports the metrics that actually matter for release readiness:
// Retry Stability (how much does the solve/improve rate vary across
// repeated draws on the SAME state) and Primitive Stability (how much does
// each primitive's trigger rate vary across the same repeats).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { endToEndSolveProbe, type EndToEndSolveResult } from "../productionIntegrationFinalization/EndToEndSolveProbe";
import type { SolveTaskType, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export const STABILITY_REPEAT_TRIALS = 10;

export interface DeterminismCheckResult {
  hash: string;
  wrongWingAfterAcrossRepeats: number[];
  identical: boolean; // true iff every repeat produced the exact same wrongWingAfter
}

export function checkDeterminism(snapshot: FailureSnapshot, repeats = 5): DeterminismCheckResult {
  const results: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const r = endToEndSolveProbe(deserializeCube(snapshot.cubeState), snapshot.hash, undefined);
    results.push(r.wrongWingAfter);
  }
  return { hash: snapshot.hash, wrongWingAfterAcrossRepeats: results, identical: results.every((v) => v === results[0]) };
}

export interface RetryStabilityRow {
  hash: string;
  solvedRate: number; // fraction of N repeats that fully solved
  improvedRate: number; // fraction of N repeats that improved at all
}

export interface PrimitiveStabilityRow {
  primitive: SolveTaskType | RecoveryType;
  triggerRateMean: number; // mean across snapshots of (this primitive's per-snapshot trigger rate across repeats)
  triggerRateStddev: number; // stddev across snapshots of that same per-snapshot rate -- the actual "stability" metric
}

export interface SystemStabilityResult {
  determinism: DeterminismCheckResult[];
  retryStability: RetryStabilityRow[];
  avgSolvedRateVariance: number; // mean of per-snapshot Bernoulli variance p(1-p) across the sample -- summarizes RetryStabilityRow
  primitiveStability: PrimitiveStabilityRow[];
}

const ALL_PRIMITIVES: (SolveTaskType | RecoveryType)[] = ["PAIR", "FLIP", "PARITY", "ENDGAME", "DISRUPT", "SETUP", "REPAIR", "CCR"];

function present(r: EndToEndSolveResult, p: SolveTaskType | RecoveryType): boolean {
  if ((["PAIR", "FLIP", "PARITY", "ENDGAME"] as string[]).includes(p)) return r.plannedTaskTypes.includes(p as SolveTaskType);
  return !!r.recoveryOutcome?.candidatesOffered.includes(p as RecoveryType);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function measureSystemStability(snapshots: readonly FailureSnapshot[], determinismSampleSize = 5, repeats = STABILITY_REPEAT_TRIALS): SystemStabilityResult {
  const determinism = snapshots.slice(0, determinismSampleSize).map((s) => checkDeterminism(s));

  const retryStability: RetryStabilityRow[] = [];
  // per-snapshot, per-primitive trigger rate across repeats (for Primitive Stability's cross-snapshot stddev)
  const perSnapshotPrimitiveRate: Record<string, number[]> = {};
  for (const p of ALL_PRIMITIVES) perSnapshotPrimitiveRate[p] = [];

  for (const snap of snapshots) {
    const repeatsResults: EndToEndSolveResult[] = [];
    for (let i = 0; i < repeats; i++) repeatsResults.push(endToEndSolveProbe(deserializeCube(snap.cubeState), snap.hash, undefined));
    const solvedRate = repeatsResults.filter((r) => r.solved).length / repeats;
    const improvedRate = repeatsResults.filter((r) => r.improved).length / repeats;
    retryStability.push({ hash: snap.hash, solvedRate, improvedRate });

    for (const p of ALL_PRIMITIVES) {
      const rate = repeatsResults.filter((r) => present(r, p)).length / repeats;
      perSnapshotPrimitiveRate[p].push(rate);
    }
  }

  const avgSolvedRateVariance = mean(retryStability.map((r) => r.solvedRate * (1 - r.solvedRate)));

  const primitiveStability: PrimitiveStabilityRow[] = ALL_PRIMITIVES.map((p) => ({
    primitive: p,
    triggerRateMean: mean(perSnapshotPrimitiveRate[p]),
    triggerRateStddev: stddev(perSnapshotPrimitiveRate[p]),
  }));

  return { determinism, retryStability, avgSolvedRateVariance, primitiveStability };
}
