// --- GateDesign (Multi-Component Merge Production Integration Planning
// Sprint v1, STEP2) -----------------------------------------------------------
// Real, unmodified feature computation (computeStructuralFeatures ->
// componentCount/cycleCount/conflictEdgeCount, recoveryNecessity/
// StructuralFeatures.ts; generateBridgeCandidates, BridgeCandidateGeneration.ts,
// UNMODIFIED) over the full 142-case Hole Dataset, joined by label with
// the Comparative Prototype Sprint v1's own real per-case Multi-Component
// Merge Replay result (multiImproved, componentCountBefore) -- no new
// Replay run for the rescue/precision numbers, exactly matching this
// Sprint's own STEP4 principle applied one step early here since the join
// data is needed for Gate precision, not just STEP4's counterfactual.
//
// "paritySatisfied" is not an existing codebase concept -- defined here,
// disclosed, as wrongWingCount5(cubies) % 2 === 0 (even wrong-wing-count),
// grounded in this codebase's own documented invariant (fiveByFiveEdges.ts's
// solveWingPairing5WithRetries comment: the tools in this codebase are all
// even-permutation commutators, so an even wrong-wing-count is the real,
// structural precondition for those tools -- and by extension Bridge/
// Traversal/Cleanup, which compose the same even-permutation primitives --
// to be able to reach a solved state at all).
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import type { Cubie } from "../cubeState";

export interface CaseFeatures {
  label: string;
  componentCount: number;
  cycleCount: number;
  conflictEdgeCount: number;
  paritySatisfied: boolean;
  bridgeCandidateExists: boolean;
}

const BRIDGE_PROBE_BUDGET_MS = 300; // matches BridgeCandidateGeneration's own sub-budget convention (e.g. MultiComponentMergePrototype.ts's BRIDGE_SUB_BUDGET_MS)

export function computeCaseFeatures(cubies: Cubie[], label: string): CaseFeatures {
  const f = computeStructuralFeatures(cubies, label);
  const components = detectComponents(cubies);
  const bridgeDeadline = Date.now() + BRIDGE_PROBE_BUDGET_MS;
  const bridgeCandidates = components.components.length >= 2 ? generateBridgeCandidates(cubies, components, bridgeDeadline, "largestTwo") : [];
  return {
    label,
    componentCount: f.componentCount,
    cycleCount: f.cycleCount,
    conflictEdgeCount: f.conflictEdgeCount,
    paritySatisfied: wrongWingCount5(cubies) % 2 === 0,
    bridgeCandidateExists: bridgeCandidates.length > 0,
  };
}

export function computeAllCaseFeatures(holes: readonly HoleCase[]): CaseFeatures[] {
  return holes.map((h) => computeCaseFeatures(h.cubies, h.label));
}

export type GateId = "COMPONENT_COUNT_GE3" | "PARITY_SATISFIED" | "BRIDGE_CANDIDATE_EXISTS" | "CYCLE_COUNT_GE2";

export interface CandidateGate {
  id: GateId;
  label: string;
  test: (f: CaseFeatures) => boolean;
}

export const CANDIDATE_GATES: CandidateGate[] = [
  { id: "COMPONENT_COUNT_GE3", label: "componentCount>=3 (Directive 예시 Gate)", test: (f) => f.componentCount >= 3 },
  { id: "PARITY_SATISFIED", label: "paritySatisfied (wrongWingCount 짝수)", test: (f) => f.paritySatisfied },
  { id: "BRIDGE_CANDIDATE_EXISTS", label: "bridgeCandidateExists (generateBridgeCandidates 결과 존재)", test: (f) => f.bridgeCandidateExists },
  { id: "CYCLE_COUNT_GE2", label: "cycleCount>=2 (cycleLength 조건)", test: (f) => f.cycleCount >= 2 },
];

export interface JoinedGroundTruth {
  label: string;
  componentCountBefore: number;
  multiImproved: boolean;
}

export interface GateEvalRow {
  gate: GateId;
  label: string;
  matched: boolean;
  isNewCapability: boolean; // matched AND componentCountBefore>=3 AND multiImproved -- genuinely new, not already produced by production PARITY_GATED_CYCLE
  isDuplicateOfProduction: boolean; // matched AND componentCountBefore===2 AND multiImproved -- production PARITY_GATED_CYCLE's own single-bridge already produces this identical result (same code path, confirmed in STEP1's own citation of genParityGatedCycle())
}

export function evaluateGates(features: readonly CaseFeatures[], groundTruth: readonly JoinedGroundTruth[]): GateEvalRow[] {
  const gtByLabel = new Map(groundTruth.map((g) => [g.label, g]));
  const rows: GateEvalRow[] = [];
  for (const f of features) {
    const gt = gtByLabel.get(f.label);
    for (const gate of CANDIDATE_GATES) {
      const matched = gate.test(f);
      const isNewCapability = matched && !!gt && gt.componentCountBefore >= 3 && gt.multiImproved;
      const isDuplicateOfProduction = matched && !!gt && gt.componentCountBefore === 2 && gt.multiImproved;
      rows.push({ gate: gate.id, label: f.label, matched, isNewCapability, isDuplicateOfProduction });
    }
  }
  return rows;
}

export interface GateSummary {
  gate: GateId;
  label: string;
  n: number;
  matchedCount: number;
  coverage: number;
  newCapabilityCount: number;
  duplicateOfProductionCount: number;
  precisionNewCapabilityAmongMatched: number; // newCapabilityCount / matchedCount -- the REAL, non-duplicated value this Gate would add
}

export function summarizeGates(rows: readonly GateEvalRow[], n: number): GateSummary[] {
  return CANDIDATE_GATES.map((gate) => {
    const gateRows = rows.filter((r) => r.gate === gate.id);
    const matched = gateRows.filter((r) => r.matched);
    const newCapability = matched.filter((r) => r.isNewCapability);
    const duplicate = matched.filter((r) => r.isDuplicateOfProduction);
    return {
      gate: gate.id,
      label: gate.label,
      n,
      matchedCount: matched.length,
      coverage: n ? matched.length / n : 0,
      newCapabilityCount: newCapability.length,
      duplicateOfProductionCount: duplicate.length,
      precisionNewCapabilityAmongMatched: matched.length ? newCapability.length / matched.length : 0,
    };
  });
}
