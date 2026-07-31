// --- CapabilityOverlapAnalysis (Parity-Gated Cycle Hybrid Primitive
// Blueprint Sprint v1, STEP1) --------------------------------------------------
// Design-only -- no new Replay is run here. Reuses the Comparative
// Prototype Sprint v1's own real per-case Replay result (its result
// JSON's `perCase` array, dualImproved/multiImproved booleans for all
// 142 real Hole Dataset cases), cited verbatim, to classify Capability
// overlap between the two Primitives per the Directive's own principle:
// judge Hybrid viability by Overlap/Exclusive Capability, NOT by the
// raw 11-vs-13 improved counts alone.
export interface CaseOverlapInput {
  label: string;
  dualImproved: boolean;
  multiImproved: boolean;
}

export type OverlapCategory = "DUAL_ONLY" | "MULTI_ONLY" | "BOTH" | "NEITHER";

export interface CaseOverlapResult {
  label: string;
  category: OverlapCategory;
}

export interface OverlapSummary {
  totalCases: number;
  dualOnlyCount: number;
  multiOnlyCount: number;
  bothCount: number;
  neitherCount: number;
  dualTotalSuccessCount: number; // |D| = dualOnly + both
  multiTotalSuccessCount: number; // |M| = multiOnly + both
  unionSuccessCount: number; // |D union M| = dualOnly + multiOnly + both
  jaccardIndex: number; // |D intersect M| / |D union M|
  overlapRatioOfSmaller: number; // |D intersect M| / min(|D|, |M|) -- how much of the SMALLER primitive's own capability is redundant with the other
  exclusiveCapabilityCount: number; // dualOnly + multiOnly -- cases only ONE primitive can rescue, the real additive opportunity
  exclusiveCapabilityPercentOfUnion: number;
}

export function classifyOverlap(cases: readonly CaseOverlapInput[]): CaseOverlapResult[] {
  return cases.map((c) => {
    let category: OverlapCategory;
    if (c.dualImproved && c.multiImproved) category = "BOTH";
    else if (c.dualImproved) category = "DUAL_ONLY";
    else if (c.multiImproved) category = "MULTI_ONLY";
    else category = "NEITHER";
    return { label: c.label, category };
  });
}

export function summarizeOverlap(perCase: readonly CaseOverlapResult[]): OverlapSummary {
  const totalCases = perCase.length;
  const dualOnlyCount = perCase.filter((c) => c.category === "DUAL_ONLY").length;
  const multiOnlyCount = perCase.filter((c) => c.category === "MULTI_ONLY").length;
  const bothCount = perCase.filter((c) => c.category === "BOTH").length;
  const neitherCount = perCase.filter((c) => c.category === "NEITHER").length;

  const dualTotalSuccessCount = dualOnlyCount + bothCount;
  const multiTotalSuccessCount = multiOnlyCount + bothCount;
  const unionSuccessCount = dualOnlyCount + multiOnlyCount + bothCount;
  const jaccardIndex = unionSuccessCount > 0 ? bothCount / unionSuccessCount : 0;
  const smaller = Math.min(dualTotalSuccessCount, multiTotalSuccessCount);
  const overlapRatioOfSmaller = smaller > 0 ? bothCount / smaller : 0;
  const exclusiveCapabilityCount = dualOnlyCount + multiOnlyCount;
  const exclusiveCapabilityPercentOfUnion = unionSuccessCount > 0 ? (exclusiveCapabilityCount / unionSuccessCount) * 100 : 0;

  return {
    totalCases,
    dualOnlyCount,
    multiOnlyCount,
    bothCount,
    neitherCount,
    dualTotalSuccessCount,
    multiTotalSuccessCount,
    unionSuccessCount,
    jaccardIndex,
    overlapRatioOfSmaller,
    exclusiveCapabilityCount,
    exclusiveCapabilityPercentOfUnion,
  };
}
