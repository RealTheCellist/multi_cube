// --- BudgetSensitivityCheck (Solver Primitive Discovery Sprint #5 --
// Unresolved Mechanism Validation Sprint v1, STEP3.5) ------------------------
// For cases that remain unresolved after STEP2 (single-Primitive) and
// STEP3 (2-step combination), re-tries every real Primitive at a much
// longer deadline to test the Directive's own "Existing Primitive Budget"
// residual hypothesis: maybe the mechanism IS there, it's just starved of
// time under the 400ms deadline both prior Sprints used.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { PRIMITIVE_NAMES, PRIMITIVE_REGISTRY, type PrimitiveName } from "./PrimitiveRegistry";

export const EXTENDED_DEADLINE_MS = 3000; // 7.5x the 400ms both Refinement Sprints used

export interface BudgetCheckResult {
  label: string;
  solvedAtExtendedBudget: boolean;
  improvedAtExtendedBudget: boolean;
  primitiveThatHelped: PrimitiveName | null;
}

export function checkBudgetSensitivity(label: string, cubies: Cubie[], lib: WingLibrary): BudgetCheckResult {
  const before = wrongWingCount5(cubies);
  for (const name of PRIMITIVE_NAMES) {
    const working = cloneCubies(cubies);
    const moves = PRIMITIVE_REGISTRY[name](working, lib, Date.now() + EXTENDED_DEADLINE_MS);
    if (!moves) continue;
    const after = cloneCubies(working);
    applySeq(after, moves);
    const wrongWingAfter = wrongWingCount5(after);
    if (wrongWingAfter < before) {
      return { label, solvedAtExtendedBudget: wrongWingAfter === 0, improvedAtExtendedBudget: true, primitiveThatHelped: name };
    }
  }
  return { label, solvedAtExtendedBudget: false, improvedAtExtendedBudget: false, primitiveThatHelped: null };
}
