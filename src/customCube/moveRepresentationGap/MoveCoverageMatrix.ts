// --- MoveCoverageMatrix (Move Representation Gap Analysis Sprint v1,
// Required Analysis #1, Deliverable #2 "Generated Move Taxonomy") ----------
import type { CandidateMeasurement, MoveClass } from "./MoveCandidateCapture";

const ALL_CLASSES: MoveClass[] = ["COMPONENT_MERGE", "COMPONENT_SPLIT", "CYCLE_MERGE", "CYCLE_SPLIT", "CYCLE_ROTATION_IMPROVING", "LATERAL_NO_CHANGE", "REGRESSIVE"];

export interface MoveClassTally {
  moveClass: MoveClass;
  count: number;
  share: number;
  avgAffectedWingCount: number;
  avgMoveLength: number;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function buildMoveCoverageMatrix(measurements: CandidateMeasurement[]): MoveClassTally[] {
  const total = measurements.length;
  return ALL_CLASSES.map((moveClass) => {
    const members = measurements.filter((m) => m.moveClass === moveClass);
    return {
      moveClass,
      count: members.length,
      share: total ? members.length / total : 0,
      avgAffectedWingCount: avg(members.map((m) => m.affectedWingCount)),
      avgMoveLength: avg(members.map((m) => m.moveLength)),
    };
  }).filter((t) => t.count > 0);
}

export interface CaseCandidateSummary {
  label: string;
  totalCandidates: number;
  anyImprovingCandidate: boolean; // did ANY first-hop candidate, at any cycle node, ever reduce wrongWingCount?
  bestWrongWingDelta: number | null; // most-negative wrongWingDelta observed, null if no candidates
  avgAffectedWingCount: number;
}

export function summarizeCaseCandidates(label: string, measurements: CandidateMeasurement[]): CaseCandidateSummary {
  const deltas = measurements.map((m) => m.wrongWingDelta);
  return {
    label,
    totalCandidates: measurements.length,
    anyImprovingCandidate: measurements.some((m) => m.wrongWingDelta < 0),
    bestWrongWingDelta: deltas.length ? Math.min(...deltas) : null,
    avgAffectedWingCount: avg(measurements.map((m) => m.affectedWingCount)),
  };
}
