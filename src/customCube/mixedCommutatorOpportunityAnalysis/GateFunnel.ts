// --- GateFunnel (Mixed Commutator Opportunity Analysis Sprint v1, RQ-1,
// Required Measurement #1) ---------------------------------------------------
// Read-only: reuses analyzeConstraints(buildStateGraph(cubies)) (existing,
// unmodified structural analysis, exactly what genMixedCommutator's own
// Gate check in fiveByFiveEdgeRecovery.ts uses) and tryMixedCommutatorPrototype
// (existing, unmodified Prototype) directly. Does NOT call
// generateRecoveryStrategies() or touch the Recovery layer -- this measures
// the Gate condition-by-condition on the raw case state itself, exactly as
// genMixedCommutator's own Gate does.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { tryMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";

export type PopulationTag = "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";

export interface GateFunnelRow {
  label: string;
  populationTag: PopulationTag;
  cycleCount: number;
  componentCount: number;
  conflictCount: number;
  passesCycle: boolean; // cycleCount === 1
  passesComponent: boolean; // componentCount === 1 (independent of cycle)
  passesConflict: boolean; // conflictCount === 0 (independent of cycle/component)
  passesFinalGate: boolean; // all three -- exactly the real production Gate
  generated: boolean; // only measured when passesFinalGate -- tryMixedCommutatorPrototype found a move at production-realistic budget
  improved: boolean; // only measured when generated -- wrongWingAfter < wrongWingBefore (should equal generated, validateDeferred already guarantees this)
}

// Matches MIXED_COMMUTATOR_RESERVED_SLICE_MS in fiveByFiveEdgeRecovery.ts --
// the real production budget the Gate-passing branch actually gets.
export const PRODUCTION_REALISTIC_BUDGET_MS = 300;

export function measureGateFunnelRow(cubies: Cubie[], label: string, populationTag: PopulationTag, lib: WingLibrary): GateFunnelRow {
  const stats = analyzeConstraints(buildStateGraph(cubies));
  const passesCycle = stats.cycleCount === 1;
  const passesComponent = stats.componentCount === 1;
  const passesConflict = stats.conflictCount === 0;
  const passesFinalGate = passesCycle && passesComponent && passesConflict;

  let generated = false;
  let improved = false;
  if (passesFinalGate) {
    const before = wrongWingCount5(cubies);
    const moves = tryMixedCommutatorPrototype(cloneCubies(cubies), lib, Date.now() + PRODUCTION_REALISTIC_BUDGET_MS);
    generated = moves !== null && moves.length > 0;
    if (generated) {
      const clone = cloneCubies(cubies);
      applySeq(clone, moves!);
      improved = wrongWingCount5(clone) < before;
    }
  }

  return {
    label,
    populationTag,
    cycleCount: stats.cycleCount,
    componentCount: stats.componentCount,
    conflictCount: stats.conflictCount,
    passesCycle,
    passesComponent,
    passesConflict,
    passesFinalGate,
    generated,
    improved,
  };
}

export interface GateFunnelSummary {
  total: number;
  passesCycleCount: number;
  passesCycleAndComponentCount: number;
  passesFinalGateCount: number;
  generatedCount: number;
  improvedCount: number;
}

export function summarizeGateFunnel(rows: readonly GateFunnelRow[]): GateFunnelSummary {
  return {
    total: rows.length,
    passesCycleCount: rows.filter((r) => r.passesCycle).length,
    passesCycleAndComponentCount: rows.filter((r) => r.passesCycle && r.passesComponent).length,
    passesFinalGateCount: rows.filter((r) => r.passesFinalGate).length,
    generatedCount: rows.filter((r) => r.generated).length,
    improvedCount: rows.filter((r) => r.improved).length,
  };
}
