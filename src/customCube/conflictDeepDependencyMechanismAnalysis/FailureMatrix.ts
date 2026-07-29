// --- FailureMatrix (CONFLICT_DEEP_DEPENDENCY Structural Mechanism Analysis
// Sprint v1, Deliverable #1: Primitive x Failure Reason) ---------------------
import type { FailureReason, PrimitiveFailurePointResult, RecoveryPrimitiveName } from "./FailurePointProbe";

export const PRIMITIVE_ORDER: RecoveryPrimitiveName[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR"];
export const FAILURE_REASON_ORDER: FailureReason[] = ["GATE_REJECTED", "CANDIDATE_GENERATION_EMPTY", "SEARCH_EXHAUSTED_NO_IMPROVEMENT", "DEADLINE_HIT", "SOLVED"];

export type FailureMatrixRow = Record<FailureReason, number>;
export type FailureMatrix = Record<RecoveryPrimitiveName, FailureMatrixRow>;

function zeroRow(): FailureMatrixRow {
  return { GATE_REJECTED: 0, CANDIDATE_GENERATION_EMPTY: 0, SEARCH_EXHAUSTED_NO_IMPROVEMENT: 0, DEADLINE_HIT: 0, SOLVED: 0 };
}

export function buildFailureMatrix(allResults: readonly PrimitiveFailurePointResult[][]): FailureMatrix {
  const matrix: FailureMatrix = { DISRUPT: zeroRow(), SETUP: zeroRow(), REPAIR: zeroRow(), CCR: zeroRow(), MIXED_COMMUTATOR: zeroRow() };
  for (const caseResults of allResults) {
    for (const r of caseResults) matrix[r.primitive][r.failureReason]++;
  }
  return matrix;
}

export interface PrimitiveDominantReason {
  primitive: RecoveryPrimitiveName;
  dominantReason: FailureReason;
  dominantShare: number;
  n: number;
}

export function summarizeDominantReasonPerPrimitive(matrix: FailureMatrix, n: number): PrimitiveDominantReason[] {
  return PRIMITIVE_ORDER.map((primitive) => {
    const row = matrix[primitive];
    let dominantReason: FailureReason = FAILURE_REASON_ORDER[0];
    let dominantCount = -1;
    for (const reason of FAILURE_REASON_ORDER) {
      if (row[reason] > dominantCount) {
        dominantCount = row[reason];
        dominantReason = reason;
      }
    }
    return { primitive, dominantReason, dominantShare: n ? dominantCount / n : 0, n };
  });
}
