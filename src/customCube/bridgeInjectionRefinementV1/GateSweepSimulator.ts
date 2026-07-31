// --- GateSweepSimulator (Solver Primitive Refinement Sprint #1 -- Bridge
// Injection Refinement Sprint v1, STEP2) -------------------------------------
// Parameterizes MultiHopBridgePrototype.ts's own ELIGIBILITY gate (cycle
// length band [MIN_BRIDGE_CYCLE_LENGTH, MAX_BRIDGE_CYCLE_LENGTH], plus two
// NEW axes the Directive names: componentCount and conflict tolerance,
// neither of which the real v2 prototype checks at all today). The actual
// SEARCH -- analyzeMultiCycle() and resolveBoundedMultiCycle() -- is
// reused completely unmodified from solverV2Prototype/; only the decision
// of WHETHER to call it, and with what cycle-length bound, is
// parameterized here. This is a disclosed duplicate of tryMultiHopBridge's
// own gate check (solverPrimitivePrototype/MultiHopBridgePrototype.ts),
// not a modification of that file.
import type { Cubie } from "../cubeState";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { resolveBoundedMultiCycle } from "../solverV2Prototype/BoundedResolver";
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";

export type ComponentRequirement = "any" | "singleComponentOnly";
export type ConflictRequirement = "any" | "noneOnly" | "requirePresent";

export interface GateConfig {
  label: string;
  minCycleLength: number;
  maxCycleLength: number;
  componentRequirement: ComponentRequirement;
  conflictRequirement: ConflictRequirement;
}

// Baseline = tryMultiHopBridge's own real, current production-prototype gate
// (cited exactly: MIN_BRIDGE_CYCLE_LENGTH=2, MAX_BRIDGE_CYCLE_LENGTH=3, no
// componentCount check, no conflict check).
export const BASELINE_GATE: GateConfig = { label: "baseline(v2 real)", minCycleLength: 2, maxCycleLength: 3, componentRequirement: "any", conflictRequirement: "any" };

export interface GateTrialResult {
  label: string;
  cycleLength: number;
  gateMatched: boolean;
  moves: Move[] | null;
  leavesExplored: number;
}

// Reusable gate predicate (STEP4's combined-trial builder reuses this
// exact check alongside the parameterized search from
// SearchContractSweepSimulator.ts, instead of duplicating the condition
// logic a third time).
export interface GateCheckResult {
  gateMatched: boolean;
  cycleLength: number;
  cycleNodes: string[] | null;
}

export function checkGate(cubies: Cubie[], config: GateConfig): GateCheckResult {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { gateMatched: false, cycleLength: 0, cycleNodes: null };

  const inBand = analysis.cycleLength >= config.minCycleLength && analysis.cycleLength <= config.maxCycleLength;
  if (!inBand) return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };

  if (config.componentRequirement !== "any" || config.conflictRequirement !== "any") {
    const features = computeStructuralFeatures(cubies, "gate-check");
    if (config.componentRequirement === "singleComponentOnly" && features.componentCount !== 1) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
    if (config.conflictRequirement === "noneOnly" && features.conflictEdgeCount !== 0) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
    if (config.conflictRequirement === "requirePresent" && features.conflictEdgeCount === 0) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
  }

  return { gateMatched: true, cycleLength: analysis.cycleLength, cycleNodes: analysis.cycleNodes };
}

export function tryMultiHopBridgeConfigured(cubies: Cubie[], lib: WingLibrary, deadline: number, config: GateConfig): GateTrialResult {
  const gate = checkGate(cubies, config);
  if (!gate.gateMatched || !gate.cycleNodes) return { label: config.label, cycleLength: gate.cycleLength, gateMatched: false, moves: null, leavesExplored: 0 };

  const result = resolveBoundedMultiCycle(cubies, gate.cycleNodes, lib, deadline);
  return { label: config.label, cycleLength: gate.cycleLength, gateMatched: true, moves: result.moves, leavesExplored: result.leavesExplored };
}

// Independent single-axis sweep configs, per the Directive's own "각 축은
// 독립적으로 평가한다" -- every config varies exactly ONE axis away from
// BASELINE_GATE.
export const GATE_SWEEP_CONFIGS: GateConfig[] = [
  BASELINE_GATE,
  { ...BASELINE_GATE, label: "maxCycleLength=4", maxCycleLength: 4 },
  { ...BASELINE_GATE, label: "maxCycleLength=5", maxCycleLength: 5 },
  { ...BASELINE_GATE, label: "maxCycleLength=6", maxCycleLength: 6 },
  { ...BASELINE_GATE, label: "componentCount===1 required", componentRequirement: "singleComponentOnly" },
  { ...BASELINE_GATE, label: "conflictEdgeCount===0 required", conflictRequirement: "noneOnly" },
  { ...BASELINE_GATE, label: "conflictEdgeCount>0 required(V3-style)", conflictRequirement: "requirePresent" },
];
