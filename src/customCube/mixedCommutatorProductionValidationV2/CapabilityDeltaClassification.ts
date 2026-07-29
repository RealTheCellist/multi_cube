// --- CapabilityDeltaClassification (Mixed Commutator Production
// Validation Sprint v2, RQ-2) -----------------------------------------------
import type { CaseMeasurement } from "./CaseMeasurement";

export type CapabilityDeltaClass = "ONLY_EXISTING" | "ONLY_MIXED" | "BOTH" | "NONE";

export interface CapabilityDeltaRow {
  label: string;
  existingCapable: boolean;
  mixedCapable: boolean;
  classification: CapabilityDeltaClass;
}

export function classifyCapabilityDelta(cases: readonly CaseMeasurement[]): CapabilityDeltaRow[] {
  return cases.map((c) => {
    const existingCapable = c.perTypeImprovingByRepeat.some((row) => row.DISRUPT || row.SETUP || row.REPAIR || row.CCR);
    const mixedCapable = c.perTypeImprovingByRepeat.some((row) => row.MIXED_COMMUTATOR);
    const classification: CapabilityDeltaClass = existingCapable && mixedCapable ? "BOTH" : existingCapable ? "ONLY_EXISTING" : mixedCapable ? "ONLY_MIXED" : "NONE";
    return { label: c.label, existingCapable, mixedCapable, classification };
  });
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
