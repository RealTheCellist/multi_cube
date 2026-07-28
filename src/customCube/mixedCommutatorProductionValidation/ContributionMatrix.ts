// --- ContributionMatrix (Mixed Commutator Production Validation Sprint v1,
// RQ-2, Required Measurement #6 "Primitive Contribution Matrix") -----------
// Directive's template names the rows BASE/PARITY/CCR/MIXED. This codebase's
// REAL RecoveryType taxonomy (fiveByFiveEdgeSolverTypes.ts) is
// DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR -- there is no "PARITY"
// RecoveryType (PARITY is a Task type in the main pipeline, unrelated to
// Recovery). Rather than guess what row the Directive intended, this module
// reports every REAL RecoveryType individually (real measured data only,
// per this whole research arc's own "실측 데이터만 사용, 추측 금지"
// convention) and ALSO reports a "BASE" aggregate row (DISRUPT|SETUP|REPAIR
// combined -- the recovery types that existed before CCR/MIXED_COMMUTATOR
// were added), which is the most defensible real-data mapping onto the
// Directive's own row names. The requested "PARITY" row is reported as
// N/A with an explicit note, not fabricated.
import type { CounterfactualRow } from "./RecoveryLayerCounterfactual";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export interface ContributionRow {
  primitive: string;
  solved: number; // case-repeats where this primitive/group offered an improving candidate
  unique: number; // ... and no other primitive/group also offered one
  shared: number; // ... and at least one other primitive/group also offered one
}

const BASE_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR"];

function tally(rows: readonly CounterfactualRow[], isMember: (t: RecoveryType) => boolean, othersMember: (t: RecoveryType) => boolean): { solved: number; unique: number; shared: number } {
  let solved = 0;
  let unique = 0;
  let shared = 0;
  for (const r of rows) {
    const memberSolved = Object.entries(r.perTypeImproving).some(([t, v]) => v && isMember(t as RecoveryType));
    if (!memberSolved) continue;
    solved++;
    const anyOtherSolved = Object.entries(r.perTypeImproving).some(([t, v]) => v && othersMember(t as RecoveryType));
    if (anyOtherSolved) shared++;
    else unique++;
  }
  return { solved, unique, shared };
}

export function buildContributionMatrix(rows: readonly CounterfactualRow[]): ContributionRow[] {
  const perType: ContributionRow[] = (["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR"] as RecoveryType[]).map((t) => {
    const r = tally(
      rows,
      (x) => x === t,
      (x) => x !== t
    );
    return { primitive: t, ...r };
  });

  const base = tally(
    rows,
    (t) => BASE_TYPES.includes(t),
    (t) => !BASE_TYPES.includes(t)
  );

  return [
    { primitive: "BASE (DISRUPT+SETUP+REPAIR)", ...base },
    { primitive: "PARITY (해당 RecoveryType 없음 -- N/A, 추측 없이 보고)", solved: -1, unique: -1, shared: -1 },
    ...perType.filter((r) => r.primitive === "CCR" || r.primitive === "MIXED_COMMUTATOR"),
    ...perType.filter((r) => r.primitive === "DISRUPT" || r.primitive === "SETUP" || r.primitive === "REPAIR"),
  ];
}
