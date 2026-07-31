// --- GateSweepSimulator (Solver Primitive Refinement Sprint #2 -- Deep
// Cycle Refinement Sprint v1, STEP2) -----------------------------------------
// Parameterizes solverV2Prototype/BoundedResolver.ts's own real entry point
// `tryBoundedMultiCycleResolver()`'s ELIGIBILITY gate: today just
// `analyzeMultiCycle(cubies) !== null && cycleLength >= MIN_CYCLE_LENGTH(4)`,
// no upper bound, no cycleCount/conflict/pair check at all. The actual
// SEARCH -- analyzeMultiCycle() and resolveBoundedMultiCycle() -- is reused
// completely unmodified from solverV2Prototype/; only the decision of
// WHETHER to call it, and with what bounds, is parameterized here. This is
// a disclosed duplicate of tryBoundedMultiCycleResolver's own gate check,
// not a modification of BoundedResolver.ts.
//
// Disclosed axis-naming note: the Directive's "dependencyDepth" axis has no
// literal counterpart in this codebase's computed feature set (no
// "dependency depth" is ever extracted anywhere in this arc). The closest
// real, already-computed structural feature is `cycleCount`
// (recoveryNecessity/StructuralFeatures.ts) -- the number of distinct
// cycles in the WANTS graph, which is the closest available proxy for "how
// many interdependent cycles this state's resolution depends on." This
// Sprint sweeps `cycleCount` under that name and discloses the
// substitution rather than fabricating a new feature.
import type { Cubie } from "../cubeState";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { resolveBoundedMultiCycle } from "../solverV2Prototype/BoundedResolver";
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";

export type CycleCountRequirement = "any" | "singleCycleOnly" | "multiCycleOnly"; // dependencyDepth proxy, disclosed above
export type ConflictRequirement = "any" | "noneOnly" | "requirePresent";

export interface GateConfig {
  label: string;
  minCycleLength: number;
  maxCycleLength: number; // Infinity = no upper bound (real BoundedResolver has none today)
  cycleCountRequirement: CycleCountRequirement;
  conflictRequirement: ConflictRequirement;
  minPairCount: number; // pairThreshold axis; 0 = no gate (real BoundedResolver has none today)
}

// Baseline = tryBoundedMultiCycleResolver's own real, current production-
// prototype gate, cited exactly: MIN_CYCLE_LENGTH=4, no upper bound, no
// cycleCount/conflict/pair check.
export const BASELINE_GATE: GateConfig = {
  label: "baseline(BoundedResolver real)",
  minCycleLength: 4,
  maxCycleLength: Infinity,
  cycleCountRequirement: "any",
  conflictRequirement: "any",
  minPairCount: 0,
};

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

  if (config.cycleCountRequirement !== "any" || config.conflictRequirement !== "any" || config.minPairCount > 0) {
    const features = computeStructuralFeatures(cubies, "gate-check");
    if (config.cycleCountRequirement === "singleCycleOnly" && features.cycleCount !== 1) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
    if (config.cycleCountRequirement === "multiCycleOnly" && features.cycleCount < 2) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
    if (config.conflictRequirement === "noneOnly" && features.conflictEdgeCount !== 0) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
    if (config.conflictRequirement === "requirePresent" && features.conflictEdgeCount === 0) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
    if (config.minPairCount > 0 && features.pairCount < config.minPairCount) {
      return { gateMatched: false, cycleLength: analysis.cycleLength, cycleNodes: null };
    }
  }

  return { gateMatched: true, cycleLength: analysis.cycleLength, cycleNodes: analysis.cycleNodes };
}

export interface GateTrialResult {
  label: string;
  cycleLength: number;
  gateMatched: boolean;
  moves: Move[] | null;
  leavesExplored: number;
}

export function tryBoundedMultiCycleConfigured(cubies: Cubie[], lib: WingLibrary, deadline: number, config: GateConfig): GateTrialResult {
  const gate = checkGate(cubies, config);
  if (!gate.gateMatched || !gate.cycleNodes) return { label: config.label, cycleLength: gate.cycleLength, gateMatched: false, moves: null, leavesExplored: 0 };

  const result = resolveBoundedMultiCycle(cubies, gate.cycleNodes, lib, deadline);
  return { label: config.label, cycleLength: gate.cycleLength, gateMatched: true, moves: result.moves, leavesExplored: result.leavesExplored };
}

// Independent single-axis sweep configs -- every config varies exactly ONE
// axis away from BASELINE_GATE, per the Directive's own "각 Gate를 하나씩만
// 변경한다. 조합 최적화는 하지 않는다."
export const GATE_SWEEP_CONFIGS: GateConfig[] = [
  BASELINE_GATE,
  { ...BASELINE_GATE, label: "minCycleLength=3(cycleLength 하한 완화)", minCycleLength: 3 },
  { ...BASELINE_GATE, label: "minCycleLength=5(minimumCycleSize 상향)", minCycleLength: 5 },
  { ...BASELINE_GATE, label: "maxCycleLength=6(maximumCycleSize 상한 신설)", maxCycleLength: 6 },
  { ...BASELINE_GATE, label: "cycleCount===1 required(dependencyDepth proxy)", cycleCountRequirement: "singleCycleOnly" },
  { ...BASELINE_GATE, label: "cycleCount>=2 required(dependencyDepth proxy)", cycleCountRequirement: "multiCycleOnly" },
  { ...BASELINE_GATE, label: "conflictEdgeCount===0 required", conflictRequirement: "noneOnly" },
  { ...BASELINE_GATE, label: "conflictEdgeCount>0 required", conflictRequirement: "requirePresent" },
  { ...BASELINE_GATE, label: "pairCount>=2 required(pairThreshold)", minPairCount: 2 },
  { ...BASELINE_GATE, label: "pairCount>=5 required(pairThreshold)", minPairCount: 5 },
];
