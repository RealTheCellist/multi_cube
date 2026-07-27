// --- ConflictCauseEffect (State Taxonomy Sprint v2 STEP2) -----------------
// For each Conflict Dominant case, determines whether its CONFLICT edges
// (from Phase 1's ConflictAnalysis.ts) were already present in the ORIGINAL
// pre-pipeline state (a precondition -- the scramble/snapshot itself put
// two pieces in a one-sided relationship) or only appear in the FINAL
// stuck state (a byproduct -- the centers/wing-pairing pipeline's own
// moves manufactured the conflict that then trapped it). This distinction
// is only possible now that HoleCase carries originalCubies (added
// specifically for this Sprint -- see HoleDatasetBuilder.ts's Appendix
// note in the Coverage Hole Discovery docs).
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export type ConflictOrigin = "PRECONDITION" | "BYPRODUCT" | "MIXED";

export interface ConflictEdgeOrigin {
  from: string;
  to: string;
  existedOriginally: boolean; // was there ANY edge (of any type) between these two slots in the original state?
}

export interface ConflictCauseEffectAnalysis {
  label: string;
  finalConflictEdgeCount: number;
  edgeOrigins: ConflictEdgeOrigin[];
  preconditionCount: number;
  byproductCount: number;
  verdict: ConflictOrigin;
}

export function analyzeConflictCauseEffect(hole: HoleCase): ConflictCauseEffectAnalysis {
  const originalGraph = buildStateGraph(hole.originalCubies);
  const finalGraph = buildStateGraph(hole.cubies);

  const originalPairs = new Set(originalGraph.edges.map((e) => [e.from, e.to].sort().join("<->")));
  const finalConflictEdges = finalGraph.edges.filter((e) => e.type === "CONFLICT");

  const edgeOrigins: ConflictEdgeOrigin[] = finalConflictEdges.map((e) => ({
    from: e.from,
    to: e.to,
    existedOriginally: originalPairs.has([e.from, e.to].sort().join("<->")),
  }));

  const preconditionCount = edgeOrigins.filter((e) => e.existedOriginally).length;
  const byproductCount = edgeOrigins.filter((e) => !e.existedOriginally).length;

  let verdict: ConflictOrigin;
  if (byproductCount === 0) verdict = "PRECONDITION";
  else if (preconditionCount === 0) verdict = "BYPRODUCT";
  else verdict = "MIXED";

  return {
    label: hole.label,
    finalConflictEdgeCount: finalConflictEdges.length,
    edgeOrigins,
    preconditionCount,
    byproductCount,
    verdict,
  };
}

export interface ConflictCauseEffectSummary {
  totalCases: number;
  verdictCounts: Record<ConflictOrigin, number>;
}

export function summarizeConflictCauseEffect(analyses: ConflictCauseEffectAnalysis[]): ConflictCauseEffectSummary {
  const verdictCounts: Record<ConflictOrigin, number> = { PRECONDITION: 0, BYPRODUCT: 0, MIXED: 0 };
  for (const a of analyses) verdictCounts[a.verdict]++;
  return { totalCases: analyses.length, verdictCounts };
}
