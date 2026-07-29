// --- PrimitiveContractVerification (Gate Production Integration Sprint v1,
// RQ-2, Deliverable "Contract Verification") ---------------------------------
// Same verification every prior Integration Sprint in this arc has used:
// every case where a MIXED_COMMUTATOR candidate is actually generated
// (post-Gate-change) must have non-empty moves, expectedWrongWingDelta<0
// (matches tryMixedCommutatorPrototype's own validateDeferred guarantee --
// untouched this Sprint), and zero exceptions anywhere.
import type { FlowMeasurementRow } from "./RecoveryFlowMeasurement";

export interface ContractVerificationResult {
  n: number;
  nonEmptyMovesCount: number;
  negativeWrongWingDeltaCount: number;
  throwCount: number;
  fullyCompliant: boolean;
  rationale: string;
}

export function verifyPrimitiveContract(rows: readonly FlowMeasurementRow[]): ContractVerificationResult {
  const withCandidate = rows.filter((r) => r.mixedCandidate !== null);
  const nonEmptyMovesCount = withCandidate.filter((r) => r.mixedCandidate!.moves.length > 0).length;
  const negativeWrongWingDeltaCount = withCandidate.filter((r) => r.mixedCandidate!.expectedWrongWingDelta < 0).length;
  const throwCount = rows.filter((r) => r.threw).length;
  const fullyCompliant = withCandidate.length === nonEmptyMovesCount && withCandidate.length === negativeWrongWingDeltaCount && throwCount === 0;

  return {
    n: withCandidate.length,
    nonEmptyMovesCount,
    negativeWrongWingDeltaCount,
    throwCount,
    fullyCompliant,
    rationale: fullyCompliant
      ? `${withCandidate.length}건의 MIXED_COMMUTATOR 후보 전원이 non-empty moves, expectedWrongWingDelta<0, 예외 발생 0건 -- Gate 변경 후에도 Primitive 계약 완전 유지.`
      : `계약 불일치 발견: n=${withCandidate.length}, nonEmptyMoves=${nonEmptyMovesCount}, negativeDelta=${negativeWrongWingDeltaCount}, throwCount=${throwCount}.`,
  };
}
