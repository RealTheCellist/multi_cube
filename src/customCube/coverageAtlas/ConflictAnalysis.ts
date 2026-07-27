// --- ConflictAnalysis (Coverage Hole Discovery Sprint v1, Phase 1 STEP4) --
// Disclosed gap: no PairConflictAnalyzer.ts exists anywhere in this repo
// (verified by repo-wide search before writing this module) despite an
// earlier Sprint's task list entry claiming one was built -- this module is
// a genuine first build, not a wrapper around a pre-existing analyzer.
//
// "Conflict" here reuses capabilityAnalysis/stateGraphBuilder.ts's own
// CONFLICT edge type unmodified (a directed WANTS edge A->B that is NOT
// part of a detected cycle -- i.e. slot A wants a piece currently in slot B,
// but B has nothing to gain back from A, so satisfying A one-sidedly "costs"
// B). This module adds exactly one new classification on top: whether the
// conflict's TARGET slot (B) is already a SolvedPair -- if so, satisfying A
// necessarily disrupts an already-complete pair, which is the mechanism the
// Master Directive's "Conflict Dominant" / "Locked Pair" taxonomy classes
// (Phase 2) are named after.
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import type { ConstraintEdge, WingNode } from "../capabilityAnalysis/capabilityTypes";
import type { HoleCase } from "./HoleDatasetBuilder";

export interface ConflictEdgeDetail extends ConstraintEdge {
  targetIsSolvedPair: boolean; // resolving this conflict would disrupt an already-complete slot
}

export interface ConflictProfile {
  label: string;
  totalConflictEdges: number;
  conflictsTargetingSolvedPair: number;
  conflictsTargetingSolvedPairShare: number;
  involvedSlots: string[]; // union of from/to slots across all conflict edges, deduped
  details: ConflictEdgeDetail[];
}

export function analyzeConflicts(hole: HoleCase): ConflictProfile {
  const graph = buildStateGraph(hole.cubies);
  const nodeByslot = new Map<string, WingNode>(graph.nodes.map((n) => [n.slot, n]));
  const conflictEdges = graph.edges.filter((e) => e.type === "CONFLICT");

  const details: ConflictEdgeDetail[] = conflictEdges.map((e) => ({
    ...e,
    targetIsSolvedPair: nodeByslot.get(e.to)?.type === "SolvedPair",
  }));

  const involvedSlots = Array.from(new Set(details.flatMap((d) => [d.from, d.to])));
  const conflictsTargetingSolvedPair = details.filter((d) => d.targetIsSolvedPair).length;

  return {
    label: hole.label,
    totalConflictEdges: details.length,
    conflictsTargetingSolvedPair,
    conflictsTargetingSolvedPairShare: details.length > 0 ? conflictsTargetingSolvedPair / details.length : 0,
    involvedSlots,
    details,
  };
}

export interface ConflictSummary {
  totalCases: number;
  casesWithAnyConflict: number;
  casesWithAnyConflictShare: number;
  casesWithSolvedPairTargetConflict: number;
  avgConflictEdgesPerCase: number;
  // Cross-tab against Coverage Hole verdict (from HoleDatasetBuilder): does
  // conflict presence correlate with "no primitive succeeded"?
  conflictPresentAndNoPrimitiveApplicable: number;
  conflictAbsentAndNoPrimitiveApplicable: number;
}

export function summarizeConflicts(profiles: ConflictProfile[], holesByLabel: Map<string, HoleCase>): ConflictSummary {
  const total = profiles.length;
  const withConflict = profiles.filter((p) => p.totalConflictEdges > 0);
  const withSolvedPairTarget = profiles.filter((p) => p.conflictsTargetingSolvedPair > 0);
  const avgConflictEdgesPerCase = total > 0 ? profiles.reduce((s, p) => s + p.totalConflictEdges, 0) / total : 0;

  let conflictPresentAndNoPrimitiveApplicable = 0;
  let conflictAbsentAndNoPrimitiveApplicable = 0;
  for (const p of profiles) {
    const hole = holesByLabel.get(p.label);
    if (!hole || hole.anyPrimitiveApplicable) continue;
    if (p.totalConflictEdges > 0) conflictPresentAndNoPrimitiveApplicable++;
    else conflictAbsentAndNoPrimitiveApplicable++;
  }

  return {
    totalCases: total,
    casesWithAnyConflict: withConflict.length,
    casesWithAnyConflictShare: total > 0 ? withConflict.length / total : 0,
    casesWithSolvedPairTargetConflict: withSolvedPairTarget.length,
    avgConflictEdgesPerCase,
    conflictPresentAndNoPrimitiveApplicable,
    conflictAbsentAndNoPrimitiveApplicable,
  };
}
