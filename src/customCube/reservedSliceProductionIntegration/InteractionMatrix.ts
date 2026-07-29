// --- InteractionMatrix (CONFLICT_DEEP_DEPENDENCY Reserved Slice Production
// Integration Sprint v1, STEP7) ---------------------------------------------
// Compares the CANDIDATE-CHOSEN-TYPE distribution between Baseline
// (useSetupReservedSlice=false) and Candidate (=true) across all real
// candidatesOffered/chosenType observations already collected by
// RecoveryLevelCollector -- no new probing, purely a re-aggregation of
// existing per-run records. Detects Starvation (a type's own win-share
// dropping once SETUP wins more often) and Duplicate Success (multiple
// types offered in the SAME round, only one chosen -- inherent to
// chooseBestRecovery()'s own single-winner design, reported as an observed
// rate here, not a bug).
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { RunRecord } from "./RecoveryLevelCollector";

const ALL_TYPES: readonly (RecoveryType | "none")[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR", "none"];

export interface ChosenTypeShare {
  type: RecoveryType | "none";
  baselineCount: number;
  baselineShare: number;
  candidateCount: number;
  candidateShare: number;
  shareDeltaPp: number; // candidateShare - baselineShare, in percentage points
}

export interface MultiOfferRow {
  offeredCount: number; // rows where >=2 distinct types were offered
  offeredTypes: string; // e.g. "DISRUPT+SETUP+REPAIR"
}

export interface InteractionMatrixResult {
  n: number;
  chosenTypeShares: ChosenTypeShare[];
  baselineMultiOfferRate: number; // fraction of rows where baseline offered >=2 distinct types
  candidateMultiOfferRate: number;
  starvationFlags: string[]; // human-readable notes for any type whose share dropped >5pp
}

export function buildInteractionMatrix(runs: readonly RunRecord[]): InteractionMatrixResult {
  const allRows = runs.flat();
  const n = allRows.length;

  const baselineCounts = new Map<string, number>();
  const candidateCounts = new Map<string, number>();
  for (const r of allRows) {
    baselineCounts.set(r.baselineChosenType, (baselineCounts.get(r.baselineChosenType) ?? 0) + 1);
    candidateCounts.set(r.candidateChosenType, (candidateCounts.get(r.candidateChosenType) ?? 0) + 1);
  }

  const chosenTypeShares: ChosenTypeShare[] = ALL_TYPES.map((type) => {
    const baselineCount = baselineCounts.get(type) ?? 0;
    const candidateCount = candidateCounts.get(type) ?? 0;
    const baselineShare = n ? baselineCount / n : 0;
    const candidateShare = n ? candidateCount / n : 0;
    return { type, baselineCount, baselineShare, candidateCount, candidateShare, shareDeltaPp: (candidateShare - baselineShare) * 100 };
  });

  const baselineMultiOfferRate = n ? allRows.filter((r) => new Set(r.baselineCandidatesOffered).size >= 2).length / n : 0;
  const candidateMultiOfferRate = n ? allRows.filter((r) => new Set(r.candidateCandidatesOffered).size >= 2).length / n : 0;

  const starvationFlags: string[] = [];
  for (const row of chosenTypeShares) {
    if (row.type === "SETUP" || row.type === "none") continue;
    if (row.shareDeltaPp < -5) {
      starvationFlags.push(`${row.type}: 채택률 ${(row.baselineShare * 100).toFixed(1)}% -> ${(row.candidateShare * 100).toFixed(1)}% (${row.shareDeltaPp.toFixed(1)}pp) -- SETUP이 더 자주 이겨서 밀려남`);
    }
  }

  return { n, chosenTypeShares, baselineMultiOfferRate, candidateMultiOfferRate, starvationFlags };
}
