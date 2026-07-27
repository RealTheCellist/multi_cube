// --- CaseTaxonomyClassifier (State Taxonomy Sprint v2) --------------------
// Phase 2 STEP1's TaxonomyMapper classified at CLUSTER granularity (one
// composite key per Dead State Cluster). This Sprint's deeper analysis
// needs per-CASE classification against the real persisted state (not a
// bucketed key), so this module re-derives the same 4-class taxonomy
// directly from each case's actual final Cubie[] via the same existing,
// unmodified building blocks (buildStateGraph/analyzeConstraints/
// hasParity) -- same classification rule as TaxonomyMapper.classifyCluster,
// just computed from real data instead of a cluster's aggregate key.
import type { Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { TaxonomyClass } from "../stateTaxonomy/TaxonomyMapper";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface CaseStructuralFeatures {
  label: string;
  hasParity: boolean;
  cycleCount: number;
  longestCycleLength: number; // exact, not bucketed
  mutualLockCount: number;
  conflictCount: number;
  componentCount: number;
  wrongWingCount: number;
  taxonomyClass: TaxonomyClass;
}

function cycleLengthTag(longestCycleLength: number): "none" | "swap(2)" | "short(3-4)" | "long(5+)" {
  if (longestCycleLength === 0) return "none";
  if (longestCycleLength === 2) return "swap(2)";
  if (longestCycleLength <= 4) return "short(3-4)";
  return "long(5+)";
}

export function classifyCaseFeatures(cubies: Cubie[], label: string): CaseStructuralFeatures {
  const graph = buildStateGraph(cubies);
  const stats = analyzeConstraints(graph);
  const parity = hasParity(cubies);
  const cycleTag = cycleLengthTag(stats.longestCycleLength);
  const hasConflict = stats.conflictCount > 0;

  let taxonomyClass: TaxonomyClass = "UNCLASSIFIED";
  if (parity && cycleTag !== "none") taxonomyClass = "PARITY_GATED_CYCLE";
  else if (cycleTag === "swap(2)" && !parity) taxonomyClass = "LOCKED_PAIR";
  else if (cycleTag === "none" && hasConflict) taxonomyClass = "CONFLICT_DOMINANT";
  else if ((cycleTag === "short(3-4)" || cycleTag === "long(5+)") && !hasConflict && !parity) taxonomyClass = "CYCLE_ISOLATION";

  return {
    label,
    hasParity: parity,
    cycleCount: stats.cycleCount,
    longestCycleLength: stats.longestCycleLength,
    mutualLockCount: stats.mutualLockCount,
    conflictCount: stats.conflictCount,
    componentCount: stats.componentCount,
    wrongWingCount: wrongWingCount5(cubies),
    taxonomyClass,
  };
}

export function classifyAllHoles(holes: HoleCase[]): CaseStructuralFeatures[] {
  return holes.map((h) => classifyCaseFeatures(h.cubies, h.label));
}

export function filterByClass(holes: HoleCase[], features: CaseStructuralFeatures[], taxonomyClass: TaxonomyClass): HoleCase[] {
  const labels = new Set(features.filter((f) => f.taxonomyClass === taxonomyClass).map((f) => f.label));
  return holes.filter((h) => labels.has(h.label));
}
