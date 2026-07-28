// --- CapabilityDeltaClassification (Mixed Commutator Production Validation
// Sprint v1, RQ-5) -----------------------------------------------------------
// Per case (aggregated across all N repeats -- DISRUPT/SETUP's own internal
// search is stochastic, so "capable" is OR'd across repeats: if ANY repeat
// finds an improving candidate for a type-group, that type-group is
// considered capable for this case), classifies:
//   ONLY_EXISTING -- existing (DISRUPT/SETUP/REPAIR/CCR) found an improving
//                    candidate in >=1 repeat, MIXED_COMMUTATOR never did
//   ONLY_MIXED    -- MIXED_COMMUTATOR found one in >=1 repeat, existing never did
//   BOTH          -- both found one in >=1 repeat (not necessarily the same repeat)
//   NONE          -- neither ever did
import type { CounterfactualRow } from "./RecoveryLayerCounterfactual";

export type CapabilityDeltaClass = "ONLY_EXISTING" | "ONLY_MIXED" | "BOTH" | "NONE";

export interface CapabilityDeltaRow {
  label: string;
  populationTag: CounterfactualRow["populationTag"];
  existingCapable: boolean;
  mixedCapable: boolean;
  classification: CapabilityDeltaClass;
}

export function classifyCapabilityDelta(rowsByLabel: Map<string, CounterfactualRow[]>): CapabilityDeltaRow[] {
  const out: CapabilityDeltaRow[] = [];
  for (const [label, rows] of rowsByLabel) {
    const existingCapable = rows.some((r) => r.perTypeImproving.DISRUPT || r.perTypeImproving.SETUP || r.perTypeImproving.REPAIR || r.perTypeImproving.CCR);
    const mixedCapable = rows.some((r) => r.perTypeImproving.MIXED_COMMUTATOR);
    const classification: CapabilityDeltaClass = existingCapable && mixedCapable ? "BOTH" : existingCapable ? "ONLY_EXISTING" : mixedCapable ? "ONLY_MIXED" : "NONE";
    out.push({ label, populationTag: rows[0].populationTag, existingCapable, mixedCapable, classification });
  }
  return out;
}

export interface CapabilityDeltaSummary {
  n: number;
  ONLY_EXISTING: number;
  ONLY_MIXED: number;
  BOTH: number;
  NONE: number;
}

export function summarizeCapabilityDelta(rows: readonly CapabilityDeltaRow[]): CapabilityDeltaSummary {
  return {
    n: rows.length,
    ONLY_EXISTING: rows.filter((r) => r.classification === "ONLY_EXISTING").length,
    ONLY_MIXED: rows.filter((r) => r.classification === "ONLY_MIXED").length,
    BOTH: rows.filter((r) => r.classification === "BOTH").length,
    NONE: rows.filter((r) => r.classification === "NONE").length,
  };
}
