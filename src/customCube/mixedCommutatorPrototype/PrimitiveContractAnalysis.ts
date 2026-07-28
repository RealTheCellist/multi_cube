// --- PrimitiveContractAnalysis (Mixed Commutator Prototype Sprint v1,
// Required Analysis #3, Deliverable #3) --------------------------------------
// Verifies, empirically over every evaluated case (not just by reading the
// type signature), that tryMixedCommutatorPrototype's actual RUNTIME
// behavior matches every existing Primitive's contract:
//   (Cubie[], WingLibrary, deadline) -> Move[] | null
// Specifically: moves is null exactly when returnedNull is true; moves is
// a non-empty array exactly when validated is true; no exception was
// thrown during any call (tracked by the driver's own try/catch,
// passed in as throwCount).
import type { CaseResult } from "./CapabilityEvaluation";

export interface ContractComplianceResult {
  n: number;
  nullConsistentCount: number; // moves===null <=> returnedNull===true
  validatedConsistentCount: number; // moves!==null && moves.length>0 <=> validated===true
  throwCount: number;
  fullyCompliant: boolean;
  rationale: string;
}

export function analyzeContractCompliance(cases: CaseResult[], throwCount: number): ContractComplianceResult {
  let nullConsistentCount = 0;
  let validatedConsistentCount = 0;

  for (const c of cases) {
    const isNull = c.result.moves === null;
    if (isNull === c.result.returnedNull) nullConsistentCount++;

    const isValidatedShape = c.result.moves !== null && c.result.moves.length > 0;
    if (isValidatedShape === c.result.validated) validatedConsistentCount++;
  }

  const fullyCompliant = nullConsistentCount === cases.length && validatedConsistentCount === cases.length && throwCount === 0;

  return {
    n: cases.length,
    nullConsistentCount,
    validatedConsistentCount,
    throwCount,
    fullyCompliant,
    rationale: fullyCompliant
      ? `모든 ${cases.length}건에서 (Cubie[], WingLibrary, deadline) -> Move[] | null 계약을 만족: null 반환/validated 플래그 일관성 100%, 예외 발생 0건.`
      : `계약 불일치 발견: nullConsistent=${nullConsistentCount}/${cases.length}, validatedConsistent=${validatedConsistentCount}/${cases.length}, throwCount=${throwCount}.`,
  };
}
