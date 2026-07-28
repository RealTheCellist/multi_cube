// --- RegressionAnalysis (Mixed Commutator Prototype Sprint v1, Required
// Analysis, Deliverable #5) --------------------------------------------------
// Same discipline Move Representation Prototype Sprint v1 established:
// run the Prototype, in isolation, against the 89 Union Covered cases and
// confirm it NEVER returns a result that makes wrongWingCount worse.
// Deferred Validation already guarantees this by construction -- this
// module measures it directly.
import type { CaseResult } from "./CapabilityEvaluation";

export interface RegressionSummary {
  n: number;
  regressionCount: number;
  incidentalSolveCount: number;
  cleanCount: number;
}

export function analyzeRegression(cases: CaseResult[]): RegressionSummary {
  let regressionCount = 0;
  let incidentalSolveCount = 0;
  let cleanCount = 0;
  for (const c of cases) {
    if (!c.result.moves) {
      cleanCount++;
      continue;
    }
    const before = c.result.wrongWingBefore;
    const after = c.result.wrongWingAfter;
    if (after !== null && after < before) incidentalSolveCount++;
    else regressionCount++;
  }
  return { n: cases.length, regressionCount, incidentalSolveCount, cleanCount };
}
