// --- RepresentationGapMatrix (Move Representation Gap Analysis Sprint v1,
// Required Analysis #3, Deliverable #3) --------------------------------------
import type { MoveClassTally } from "./MoveCoverageMatrix";
import type { CaseCandidateSummary } from "./MoveCoverageMatrix";

export interface RepresentationGapResult {
  representableMoveClasses: string[]; // classes that DO appear at least once
  neverGeneratedMoveClasses: string[]; // classes that NEVER appear across the whole population
  casesWithNoImprovingCandidateAtAll: number; // RQ-2/RQ-4 core evidence
  totalCases: number;
  casesWithNoImprovingCandidateShare: number;
  representativeGapLabels: string[];
}

const ALL_POSSIBLE_CLASSES = ["COMPONENT_MERGE", "COMPONENT_SPLIT", "CYCLE_MERGE", "CYCLE_SPLIT", "CYCLE_ROTATION_IMPROVING", "LATERAL_NO_CHANGE", "REGRESSIVE"];

export function buildRepresentationGapMatrix(coverage: MoveClassTally[], caseSummaries: CaseCandidateSummary[]): RepresentationGapResult {
  const representable = coverage.map((c) => c.moveClass);
  const never = ALL_POSSIBLE_CLASSES.filter((c) => !representable.includes(c));
  const noImproving = caseSummaries.filter((s) => !s.anyImprovingCandidate);

  return {
    representableMoveClasses: representable,
    neverGeneratedMoveClasses: never,
    casesWithNoImprovingCandidateAtAll: noImproving.length,
    totalCases: caseSummaries.length,
    casesWithNoImprovingCandidateShare: caseSummaries.length ? noImproving.length / caseSummaries.length : 0,
    representativeGapLabels: noImproving.slice(0, 8).map((s) => s.label),
  };
}
