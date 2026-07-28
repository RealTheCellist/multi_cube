// --- PrimitiveContractVerification (Mixed Commutator Production
// Integration Sprint v1, RQ-2, Deliverable #5) -------------------------------
// Verifies, over every case where a MIXED_COMMUTATOR candidate was
// actually generated (post-integration, via the real genMixedCommutator()
// wired into generateRecoveryStrategies()), that the RecoveryStrategy
// object add() built is internally consistent: non-empty moves,
// expectedWrongWingDelta<0 (matches tryMixedCommutatorPrototype's own
// validateDeferred guarantee), and no exception occurred anywhere in the
// measurement pass (tracked externally by the driver's own try/catch).
import type { FlowMeasurementRow } from "./RecoveryFlowMeasurement";

export interface ContractVerificationResult {
  n: number; // cases where mixedCandidate is non-null
  nonEmptyMovesCount: number;
  negativeWrongWingDeltaCount: number;
  throwCount: number;
  fullyCompliant: boolean;
  rationale: string;
}

export function verifyPrimitiveContract(rows: FlowMeasurementRow[], throwCount: number): ContractVerificationResult {
  const withCandidate = rows.filter((r) => r.mixedCandidate !== null);
  const nonEmptyMovesCount = withCandidate.filter((r) => r.mixedCandidate!.moves.length > 0).length;
  const negativeWrongWingDeltaCount = withCandidate.filter((r) => r.mixedCandidate!.expectedWrongWingDelta < 0).length;
  const fullyCompliant = withCandidate.length === nonEmptyMovesCount && withCandidate.length === negativeWrongWingDeltaCount && throwCount === 0;

  return {
    n: withCandidate.length,
    nonEmptyMovesCount,
    negativeWrongWingDeltaCount,
    throwCount,
    fullyCompliant,
    rationale: fullyCompliant
      ? `${withCandidate.length}건의 MIXED_COMMUTATOR 후보 전원이 non-empty moves, expectedWrongWingDelta<0 (validateDeferred 보장과 일치), 예외 발생 0건 -- Primitive 계약 완전 유지.`
      : `계약 불일치 발견: n=${withCandidate.length}, nonEmptyMoves=${nonEmptyMovesCount}, negativeDelta=${negativeWrongWingDeltaCount}, throwCount=${throwCount}.`,
  };
}
