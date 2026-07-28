// --- StructureClassification (Mixed Commutator Design Space Validation
// Sprint v1, RQ-4) --------------------------------------------------------
// Disclosed classification, applied to each case's SINGLE best-found
// candidate (lowest affectedWingCount across the whole expanded design
// space -- L1 same/mixed pattern + L2/L3 setup-length probes), first
// match wins:
//   1. NONE_FOUND    -- no improving candidate at all.
//   2. MIXED_PATTERN -- best candidate's patternA != patternB.
//   3. DEEP_SETUP    -- best candidate used a setup with length >= 2 on
//      either side (a longer fragment chain, from the SetupLengthSearch
//      probes).
//   4. WIDE_SETUP    -- best candidate has BOTH sides using a non-trivial
//      setup (length >= 1 on both A and B), same-pattern, length < 2 --
//      i.e. what Novel Low-Footprint Move Existence Validation Sprint v1
//      already called CONJUGATED_CYCLE.
//   5. SAME_PATTERN  -- fallback: same pattern, at most one side has a
//      non-trivial (length 1) setup, the other is IDENTITY.
//   6. UNKNOWN       -- anything not captured above.
export type StructureLabel = "NONE_FOUND" | "MIXED_PATTERN" | "DEEP_SETUP" | "WIDE_SETUP" | "SAME_PATTERN" | "UNKNOWN";

export interface BestCandidateSummary {
  label: string;
  found: boolean;
  mixedPattern: boolean;
  setupALength: number; // 0-3
  setupBLength: number; // 0-3
}

function classifyOne(c: BestCandidateSummary): StructureLabel {
  if (!c.found) return "NONE_FOUND";
  if (c.mixedPattern) return "MIXED_PATTERN";
  if (c.setupALength >= 2 || c.setupBLength >= 2) return "DEEP_SETUP";
  if (c.setupALength >= 1 && c.setupBLength >= 1) return "WIDE_SETUP";
  if (c.setupALength >= 0 && c.setupBLength >= 0) return "SAME_PATTERN";
  return "UNKNOWN";
}

export interface ClassifiedCase {
  label: string;
  structureLabel: StructureLabel;
}

export interface StructureSummary {
  classified: ClassifiedCase[];
  tally: { structureLabel: StructureLabel; count: number }[];
  dominantLabel: StructureLabel | null; // among FOUND cases only, if any single label >= 60%
  dominantShare: number | null;
}

export function classifyStructures(candidates: BestCandidateSummary[]): StructureSummary {
  const classified: ClassifiedCase[] = candidates.map((c) => ({ label: c.label, structureLabel: classifyOne(c) }));
  const labels: StructureLabel[] = ["NONE_FOUND", "MIXED_PATTERN", "DEEP_SETUP", "WIDE_SETUP", "SAME_PATTERN", "UNKNOWN"];
  const tally = labels.map((structureLabel) => ({ structureLabel, count: classified.filter((c) => c.structureLabel === structureLabel).length })).filter((t) => t.count > 0);

  const found = classified.filter((c) => c.structureLabel !== "NONE_FOUND");
  let dominantLabel: StructureLabel | null = null;
  let dominantShare: number | null = null;
  if (found.length > 0) {
    const foundLabels: StructureLabel[] = ["MIXED_PATTERN", "DEEP_SETUP", "WIDE_SETUP", "SAME_PATTERN", "UNKNOWN"];
    for (const l of foundLabels) {
      const share = found.filter((c) => c.structureLabel === l).length / found.length;
      if (share >= 0.6) {
        dominantLabel = l;
        dominantShare = share;
        break;
      }
    }
  }

  return { classified, tally, dominantLabel, dominantShare };
}
