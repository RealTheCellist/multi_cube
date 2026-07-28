// --- StructureClassification (Novel Low-Footprint Move Existence
// Validation Sprint v1, RQ-4, Deliverable "Required Primitive
// Specification" groundwork) --------------------------------------------
// Disclosed classification rule, applied to each case's BEST found
// construction (if any), first match wins:
//   1. NONE_FOUND         -- no attempt improved wrongWingCount at all.
//   2. PURE_CYCLE_COMMUTATOR -- affectedWingCount <= cycleLength + 1 (the
//      "+1" tolerance accounts for measurement granularity around a single
//      shared commutator slot; this is the Blueprint's own original ideal:
//      footprint approximately equal to cycle length).
//   3. CONJUGATED_CYCLE   -- affectedWingCount > cycleLength + 1 but the
//      construction still achieved genuine net wrongWingCount improvement
//      (a real, if not minimal, low-footprint-relative-to-generator's-own-
//      baseline win).
//   4. MULTI_TARGET_EXCHANGE / UNKNOWN are reserved labels for future
//      Sprints that track WHICH specific wings were touched relative to
//      the detected cycle's own membership -- this Sprint's own measured
//      data (affectedWingCount only, not per-wing identity) cannot yet
//      distinguish those two, so any case that doesn't fit 1-3 is labeled
//      UNKNOWN rather than guessed.
import type { CatalogEntry } from "./MinimalFootprintCatalog";

export type StructureLabel = "NONE_FOUND" | "PURE_CYCLE_COMMUTATOR" | "CONJUGATED_CYCLE" | "UNKNOWN";

export interface ClassifiedEntry {
  label: string;
  cycleLength: number;
  structureLabel: StructureLabel;
}

function classifyOne(entry: CatalogEntry): StructureLabel {
  if (!entry.found || entry.bestAffectedWingCount === null) return "NONE_FOUND";
  if (entry.bestAffectedWingCount <= entry.cycleLength + 1) return "PURE_CYCLE_COMMUTATOR";
  return "CONJUGATED_CYCLE";
}

export interface StructureSummary {
  classified: ClassifiedEntry[];
  tally: { structureLabel: StructureLabel; count: number }[];
  dominantLabel: StructureLabel | null; // among FOUND cases only, if any single label >= 60% of found
  dominantShare: number | null;
}

export function classifyStructures(entries: CatalogEntry[]): StructureSummary {
  const classified: ClassifiedEntry[] = entries.map((e) => ({
    label: e.label,
    cycleLength: e.cycleLength,
    structureLabel: classifyOne(e),
  }));

  const labels: StructureLabel[] = ["NONE_FOUND", "PURE_CYCLE_COMMUTATOR", "CONJUGATED_CYCLE", "UNKNOWN"];
  const tally = labels.map((structureLabel) => ({ structureLabel, count: classified.filter((c) => c.structureLabel === structureLabel).length }));

  const found = classified.filter((c) => c.structureLabel !== "NONE_FOUND");
  let dominantLabel: StructureLabel | null = null;
  let dominantShare: number | null = null;
  if (found.length > 0) {
    const foundLabels: StructureLabel[] = ["PURE_CYCLE_COMMUTATOR", "CONJUGATED_CYCLE", "UNKNOWN"];
    for (const l of foundLabels) {
      const share = found.filter((c) => c.structureLabel === l).length / found.length;
      if (share >= 0.6) {
        dominantLabel = l;
        dominantShare = share;
        break;
      }
    }
  }

  return { classified, tally: tally.filter((t) => t.count > 0), dominantLabel, dominantShare };
}
