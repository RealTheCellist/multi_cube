// --- PreconditionsRelaxation (Solver Primitive Blueprint Refinement
// Sprint v1) -------------------------------------------------------------
// STEP2: sweeps several relaxation levels of the two genuinely-novel
// candidates' Preconditions (Slot Perturbation Primitive/Low-Structure
// Multi-Hop Bridge, both from Blueprint Sprint v1) and measures Coverage
// at each level -- level 0 is always the ORIGINAL precondition (cited
// unmodified), later levels progressively widen it. The final level
// deliberately drops to near-triviality (a single clause) to show the
// diminishing-returns ceiling, not to recommend it as-is.
import type { GapReplayFeatures } from "../solverPrimitiveBlueprint/GapStructuralAnalysis";

export interface RelaxationLevel {
  candidateName: string;
  level: number;
  description: string;
  matches: (f: GapReplayFeatures) => boolean;
}

export const SLOT_PERTURBATION_LEVELS: RelaxationLevel[] = [
  { candidateName: "Slot Perturbation", level: 0, description: "cycle=0 & swap=0 & conflict=0 (원안, Blueprint Sprint v1)", matches: (f) => f.cycleCount === 0 && f.swapEdgeCount === 0 && f.conflictEdgeCount === 0 },
  { candidateName: "Slot Perturbation", level: 1, description: "cycle<=1 & swap<=1 & conflict<=1", matches: (f) => f.cycleCount <= 1 && f.swapEdgeCount <= 1 && f.conflictEdgeCount <= 1 },
  { candidateName: "Slot Perturbation", level: 2, description: "cycle<=1 & swap<=2 & conflict<=2", matches: (f) => f.cycleCount <= 1 && f.swapEdgeCount <= 2 && f.conflictEdgeCount <= 2 },
  { candidateName: "Slot Perturbation", level: 3, description: "swap=0 (Cycle/Conflict 조건 제거, 참고용 상한선)", matches: (f) => f.swapEdgeCount === 0 },
];

export const MULTI_HOP_BRIDGE_LEVELS: RelaxationLevel[] = [
  { candidateName: "Multi-Hop Bridge", level: 0, description: "WW 3-8 & cycle<=1 & swap=0 (원안, Blueprint Sprint v1)", matches: (f) => f.wrongWingCount >= 3 && f.wrongWingCount <= 8 && f.cycleCount <= 1 && f.swapEdgeCount === 0 },
  { candidateName: "Multi-Hop Bridge", level: 1, description: "WW 3-11 & cycle<=1 & swap=0", matches: (f) => f.wrongWingCount >= 3 && f.wrongWingCount <= 11 && f.cycleCount <= 1 && f.swapEdgeCount === 0 },
  { candidateName: "Multi-Hop Bridge", level: 2, description: "WW 3-11 & cycle<=2 & swap<=1", matches: (f) => f.wrongWingCount >= 3 && f.wrongWingCount <= 11 && f.cycleCount <= 2 && f.swapEdgeCount <= 1 },
  { candidateName: "Multi-Hop Bridge", level: 3, description: "cycle<=2 (WW/Swap 조건 제거, 참고용 상한선)", matches: (f) => f.cycleCount <= 2 },
];

export interface RelaxationResult {
  candidateName: string;
  level: number;
  description: string;
  matchedCount: number;
  gapTotal: number;
  coverageRate: number;
}

export function sweepRelaxation(levels: readonly RelaxationLevel[], gapFeatures: readonly GapReplayFeatures[]): RelaxationResult[] {
  const gapTotal = gapFeatures.length;
  return levels.map((lvl) => {
    const matchedCount = gapFeatures.filter((f) => lvl.matches(f)).length;
    return { candidateName: lvl.candidateName, level: lvl.level, description: lvl.description, matchedCount, gapTotal, coverageRate: gapTotal ? matchedCount / gapTotal : 0 };
  });
}
