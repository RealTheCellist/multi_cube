// --- SubtypeDiscovery (PURE_CYCLE_ISOLATION Structural Mechanism Analysis
// Sprint v1, RQ-4, Required Analysis #2) -------------------------------------
// Uses the Directive's own suggested bucket NAMES (Long Cycle / Nested
// Cycle / Locked Cycle / Dead Cycle / Unknown), but assignment is a
// disclosed, deterministic function of measured fields only -- first
// match wins, applied in this fixed priority order:
//   1. NESTED_CYCLE -- cycleCount > 1 (more than one disjoint cycle
//      coexists within this single component -- a structurally distinct
//      shape from a single clean cycle).
//   2. LOCKED_CYCLE -- (not already Nested) AND at least one of BP-1/CCR
//      terminates via LEAF_CAP_REACHED -- the search was artificially cut
//      short before exhausting its own reachable space; "locked" in the
//      sense that more search budget/breadth genuinely might still help.
//   3. LONG_CYCLE -- (not already classified) AND cycleLength >= 6 -- the
//      longer of the two lengths CCR's own Gate covers.
//   4. DEAD_CYCLE -- (not already classified) AND both BP-1 and CCR
//      terminate via SEARCH_EXHAUSTED -- a genuine, fully-explored dead
//      end at cycleLength 5.
//   5. UNKNOWN -- none of the above.
import type { CaseFailureMechanismRow } from "./FailureMechanismMatrix";

export type CycleFailureSubtype = "NESTED_CYCLE" | "LOCKED_CYCLE" | "LONG_CYCLE" | "DEAD_CYCLE" | "UNKNOWN";

export interface SubtypeClassification {
  label: string;
  subtype: CycleFailureSubtype;
  cycleCount: number;
  cycleLength: number;
}

export function classifySubtype(row: CaseFailureMechanismRow, cycleCount: number): CycleFailureSubtype {
  if (cycleCount > 1) return "NESTED_CYCLE";
  if (row.eitherLeafCapReached) return "LOCKED_CYCLE";
  if (row.cycleLength >= 6) return "LONG_CYCLE";
  if (row.bothSearchExhausted) return "DEAD_CYCLE";
  return "UNKNOWN";
}

export function classifyAllSubtypes(rows: CaseFailureMechanismRow[], cycleCountByLabel: Map<string, number>): SubtypeClassification[] {
  return rows.map((r) => {
    const cycleCount = cycleCountByLabel.get(r.label) ?? 1;
    return { label: r.label, subtype: classifySubtype(r, cycleCount), cycleCount, cycleLength: r.cycleLength };
  });
}

export interface SubtypeSummary {
  subtype: CycleFailureSubtype;
  n: number;
  labels: string[];
}

export function summarizeSubtypes(classified: SubtypeClassification[]): SubtypeSummary[] {
  const subtypes: CycleFailureSubtype[] = ["NESTED_CYCLE", "LOCKED_CYCLE", "LONG_CYCLE", "DEAD_CYCLE", "UNKNOWN"];
  return subtypes
    .map((subtype) => {
      const members = classified.filter((c) => c.subtype === subtype);
      return { subtype, n: members.length, labels: members.map((m) => m.label) };
    })
    .filter((s) => s.n > 0);
}
