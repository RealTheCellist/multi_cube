// --- GateDefinitions (Gate Refinement Sprint v1, Section 3 "Candidate
// Gates") -------------------------------------------------------------------
// Pure predicates over the same ConstraintStats fields genMixedCommutator's
// own real Gate check reads (analyzeConstraints(buildStateGraph(cubies)),
// unmodified). Nothing here touches fiveByFiveEdgeRecovery.ts -- these are
// shadow predicates evaluated against the same real structural stats.
import type { ConstraintStats } from "../capabilityAnalysis/capabilityTypes";

export type GateId = "A" | "B" | "C" | "D" | "E";

export interface GateDefinition {
  id: GateId;
  name: string;
  description: string;
  predicate: (stats: ConstraintStats) => boolean;
}

export const GATE_DEFINITIONS: GateDefinition[] = [
  {
    id: "A",
    name: "Current Production (Baseline)",
    description: "cycleCount===1 AND conflictCount===0 AND componentCount===1",
    predicate: (s) => s.cycleCount === 1 && s.conflictCount === 0 && s.componentCount === 1,
  },
  {
    id: "B",
    name: "Cycle relaxed",
    description: "cycleCount>=1 AND conflictCount===0 AND componentCount===1",
    predicate: (s) => s.cycleCount >= 1 && s.conflictCount === 0 && s.componentCount === 1,
  },
  {
    id: "C",
    name: "Conflict relaxed",
    description: "cycleCount===1 AND componentCount===1",
    predicate: (s) => s.cycleCount === 1 && s.componentCount === 1,
  },
  {
    id: "D",
    name: "Cycle + Conflict relaxed",
    description: "cycleCount>=1 AND componentCount===1",
    predicate: (s) => s.cycleCount >= 1 && s.componentCount === 1,
  },
  {
    id: "E",
    name: "Maximum relaxation",
    description: "cycleCount>=1",
    predicate: (s) => s.cycleCount >= 1,
  },
];
