// --- RecoveryInteractionMatrix (Production Integration Blueprint Sprint
// v1, Required Analysis #3) ----------------------------------------------
import type { InteractionRow } from "./RecoveryInteractionMeasurement";

export interface OutcomeTally {
  outcome: string;
  count: number;
}

export interface ExistingTypeBreakdown {
  existingBestType: string; // "null" for none
  count: number;
  mixedWouldWinCount: number;
}

export interface InteractionMatrixSummary {
  n: number;
  outcomeTally: OutcomeTally[];
  byExistingType: ExistingTypeBreakdown[];
  netNewCount: number; // ONLY_MIXED -- cases Recovery Layer solves NOTHING for today, but Mixed would
  redundantWinCount: number; // MIXED_WINS -- cases where existing ALSO has a candidate, but Mixed's is better
  neverDisplacesCount: number; // EXISTING_WINS + ONLY_EXISTING -- cases where adding Mixed changes nothing
}

export function buildInteractionMatrix(rows: InteractionRow[]): InteractionMatrixSummary {
  const outcomes = ["ONLY_EXISTING", "ONLY_MIXED", "BOTH_NONE", "MIXED_WINS", "EXISTING_WINS"] as const;
  const outcomeTally = outcomes.map((outcome) => ({ outcome, count: rows.filter((r) => r.outcome === outcome).length })).filter((t) => t.count > 0);

  const types = Array.from(new Set(rows.map((r) => r.existingBestType ?? "null")));
  const byExistingType = types.map((existingBestType) => {
    const members = rows.filter((r) => (r.existingBestType ?? "null") === existingBestType);
    return {
      existingBestType,
      count: members.length,
      mixedWouldWinCount: members.filter((r) => r.wouldMixedWin).length,
    };
  });

  return {
    n: rows.length,
    outcomeTally,
    byExistingType,
    netNewCount: rows.filter((r) => r.outcome === "ONLY_MIXED").length,
    redundantWinCount: rows.filter((r) => r.outcome === "MIXED_WINS").length,
    neverDisplacesCount: rows.filter((r) => r.outcome === "EXISTING_WINS" || r.outcome === "ONLY_EXISTING").length,
  };
}
