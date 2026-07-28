// --- RegressionAnalysis (Move Representation Prototype Sprint v1,
// Deliverable #4) ------------------------------------------------------------
// Since this Prototype is a standalone module (never wired into
// Recovery/Executor), "regression" here means: run it, in isolation,
// against every one of the 89 already-solved (Union Covered) cases, and
// confirm it NEVER returns a result that makes wrongWingCount worse.
// Deferred Validation already guarantees this by construction (a
// worse-or-equal result is rejected and null is returned instead) -- this
// module measures it directly rather than assuming the guarantee holds.
import type { CaseResult } from "./CapabilityEvaluation";

export interface RegressionSummary {
  n: number;
  regressionCount: number; // cases where the Prototype returned a result that did NOT improve wrongWingCount
  incidentalSolveCount: number; // cases already solved elsewhere where this Prototype ALSO found an (extra, harmless) improvement
  cleanCount: number; // cases where the Prototype correctly returned null (no interference)
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
