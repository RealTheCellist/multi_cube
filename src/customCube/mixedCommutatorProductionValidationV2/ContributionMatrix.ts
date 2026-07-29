// --- ContributionMatrix (Mixed Commutator Production Validation Sprint
// v2, RQ-... "Primitive Contribution") ---------------------------------------
import type { CaseMeasurement } from "./CaseMeasurement";
import { RECOVERY_TYPES } from "./CaseMeasurement";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export interface ContributionRow {
  primitive: RecoveryType;
  solved: number; // case-repeats where this type offered an improving candidate (Gate C / real Integrated arm)
  unique: number;
  shared: number;
}

export function buildContributionMatrix(cases: readonly CaseMeasurement[]): ContributionRow[] {
  return RECOVERY_TYPES.map((t) => {
    let solved = 0;
    let unique = 0;
    let shared = 0;
    for (const c of cases) {
      for (const row of c.perTypeImprovingByRepeat) {
        if (!row[t]) continue;
        solved++;
        const anyOther = RECOVERY_TYPES.some((other) => other !== t && row[other]);
        if (anyOther) shared++;
        else unique++;
      }
    }
    return { primitive: t, solved, unique, shared };
  });
}
