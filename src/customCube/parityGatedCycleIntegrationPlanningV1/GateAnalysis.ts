// --- GateAnalysis (Parity-Gated Cycle Production Integration Planning
// Sprint v1, STEP3) ----------------------------------------------------------
// Compares the Blueprint's own Gate (componentCount>1 AND cycleCount>=2 AND
// conflictEdgeCount===0, CrossComponentBridgeCycleResolver.ts's checkGate())
// against 2 relaxations, on Coverage (population fraction matched) vs
// Runtime vs Rescue. The Prototype's own tryCrossComponentBridgeCycleResolver
// hardcodes its Gate internally, so relaxed-Gate cases are run through the
// SAME pipeline steps it composes (detectComponents/generateBridgeCandidates/
// traverseAllCycles/bestEffortCleanup, all already exported from
// parityGatedCyclePrototypeV1, unmodified) minus the Gate call itself --
// this is the SAME disclosed-duplicate pattern this whole research arc's
// Gate Sweeps have always used (e.g. deepCycleRefinementV1/
// GateSweepSimulator.ts), not a modification of the Prototype file (0 lines
// changed there).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { traverseAllCycles } from "../parityGatedCyclePrototypeV1/MultiCycleTraversal";
import { bestEffortCleanup } from "../parityGatedCyclePrototypeV1/BridgeRemoval";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface CandidateGate {
  label: string;
  test: (f: { componentCount: number; cycleCount: number; conflictEdgeCount: number }) => boolean;
}

export const CANDIDATE_GATES: CandidateGate[] = [
  { label: "G0(현재, componentCount>1 AND cycleCount>=2 AND conflictEdgeCount===0)", test: (f) => f.componentCount > 1 && f.cycleCount >= 2 && f.conflictEdgeCount === 0 },
  { label: "G1(conflict 완화, componentCount>1 AND cycleCount>=2)", test: (f) => f.componentCount > 1 && f.cycleCount >= 2 },
  { label: "G2(cycleCount 완화, componentCount>1 AND conflictEdgeCount===0)", test: (f) => f.componentCount > 1 && f.conflictEdgeCount === 0 },
  { label: "G3(componentCount만, componentCount>1)", test: (f) => f.componentCount > 1 },
];

// Reproduces tryCrossComponentBridgeCycleResolverConfigured(FULL_CONFIG)'s own
// bridge->traversal->cleanup pipeline exactly (same functions, same order),
// minus its hardcoded Gate call -- used only to test whether BROADER Gates
// than G0 would actually find anything, since the real entry point always
// rejects non-G0 states before ever reaching this pipeline.
function runPipelineNoGate(cubies: Cubie[], lib: WingLibrary, deadline: number): { moves: Move[] | null } {
  const components = detectComponents(cubies);
  const bridgeDeadline = Math.min(deadline, Date.now() + 300);
  let bridgeCandidates: { moves: Move[] }[] = [{ moves: [] }];
  const generated = generateBridgeCandidates(cubies, components, bridgeDeadline, "largestTwo");
  if (generated.length > 0) bridgeCandidates = generated;

  let best: { moves: Move[]; wrong: number } | null = null;
  for (const bridge of bridgeCandidates) {
    if (Date.now() > deadline) break;
    const afterBridge = cloneCubies(cubies);
    if (bridge.moves.length) applySeq(afterBridge, bridge.moves);
    const traversal = traverseAllCycles(afterBridge, lib, deadline);
    const traversalMoves = traversal.moves ?? [];
    const afterTraversal = cloneCubies(afterBridge);
    if (traversalMoves.length) applySeq(afterTraversal, traversalMoves);
    const cleanupMoves = bestEffortCleanup(afterTraversal, lib, deadline);
    const finalState = cloneCubies(afterTraversal);
    if (cleanupMoves.length) applySeq(finalState, cleanupMoves);
    const wrong = wrongWingCount5(finalState);
    if (!best || wrong < best.wrong) best = { moves: [...bridge.moves, ...traversalMoves, ...cleanupMoves], wrong };
  }
  if (!best || best.moves.length === 0) return { moves: null };
  return { moves: best.moves };
}

export interface GateCaseResult {
  label: string;
  gate: string;
  matched: boolean;
  improved: boolean;
  wallMs: number;
}

const GENEROUS_BUDGET_MS = 2000; // matches Prototype Sprint v1's own per-case deadline -- isolates Gate effect from Budget effect

export function analyzeGates(holes: readonly HoleCase[], lib: WingLibrary): GateCaseResult[] {
  const results: GateCaseResult[] = [];
  for (const h of holes) {
    const f = computeStructuralFeatures(h.cubies, h.label);
    const wrongBefore = wrongWingCount5(h.cubies);
    for (const gate of CANDIDATE_GATES) {
      const matched = gate.test(f);
      if (!matched) {
        results.push({ label: h.label, gate: gate.label, matched: false, improved: false, wallMs: 0 });
        continue;
      }
      const start = Date.now();
      const result = runPipelineNoGate(cloneCubies(h.cubies), lib, Date.now() + GENEROUS_BUDGET_MS);
      const wallMs = Date.now() - start;
      let improved = false;
      if (result.moves) {
        const after = cloneCubies(h.cubies);
        applySeq(after, result.moves);
        improved = wrongWingCount5(after) < wrongBefore;
      }
      results.push({ label: h.label, gate: gate.label, matched: true, improved, wallMs });
    }
  }
  return results;
}

export interface GateSummary {
  gate: string;
  n: number;
  matchedCount: number;
  coverage: number;
  improvedCount: number;
  precisionAmongMatched: number; // improved / matched
  avgRuntimeMsAmongMatched: number;
}

export function summarizeGates(results: readonly GateCaseResult[], n: number): GateSummary[] {
  return CANDIDATE_GATES.map((gate) => {
    const rows = results.filter((r) => r.gate === gate.label);
    const matched = rows.filter((r) => r.matched);
    const improved = rows.filter((r) => r.improved);
    const avgRuntimeMsAmongMatched = matched.length ? matched.reduce((s, r) => s + r.wallMs, 0) / matched.length : 0;
    return {
      gate: gate.label,
      n,
      matchedCount: matched.length,
      coverage: n ? matched.length / n : 0,
      improvedCount: improved.length,
      precisionAmongMatched: matched.length ? improved.length / matched.length : 0,
      avgRuntimeMsAmongMatched,
    };
  });
}
