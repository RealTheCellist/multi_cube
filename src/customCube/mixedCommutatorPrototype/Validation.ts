// --- Validation (Mixed Commutator Prototype Sprint v1, Architecture
// STEP 5) --------------------------------------------------------------------
// Final gate before returning: reuses the SAME validateDeferred export
// every other Sprint in this arc uses -- only a genuinely net-improving,
// validated result is ever returned to the caller.
import type { Cubie } from "../cubeState";
import { validateDeferred, type DeferredValidationResult } from "../solverV2Prototype/DeferredValidator";

export function validateResult(before: Cubie[], after: Cubie[]): DeferredValidationResult {
  return validateDeferred(before, after);
}
