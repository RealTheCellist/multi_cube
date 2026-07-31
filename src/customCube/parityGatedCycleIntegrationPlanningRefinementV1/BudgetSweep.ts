// --- BudgetSweep (Parity-Gated Cycle Integration Planning Refinement
// Sprint v1, STEP1/2) --------------------------------------------------------
// Position (after_CCR, "remainingTime" Budget Contract) and Gate (G3,
// componentCount>1 only) are FIXED per Integration Planning Sprint v1's own
// Decision B -- only Budget is swept here, across 500/750/1000/1250/1500/
// 1750/2000ms (Directive's own values, no interpolation -- every point is a
// real replay). The Prototype's own tryCrossComponentBridgeCycleResolver
// hardcodes G0 (componentCount>1 AND cycleCount>=2 AND conflictEdgeCount===0)
// internally, so testing the now-FIXED G3 Gate requires composing the SAME
// exported pipeline steps (detectComponents/generateBridgeCandidates/
// traverseAllCycles/bestEffortCleanup, parityGatedCyclePrototypeV1,
// unmodified) minus that hardcoded Gate call -- the identical disclosed-
// duplicate pattern parityGatedCycleIntegrationPlanningV1/GateAnalysis.ts's
// own runPipelineNoGate() already established (not re-exported from there
// since that module binds its own local Move import; reproduced here
// against the SAME functions, not new logic).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { traverseAllCycles } from "../parityGatedCyclePrototypeV1/MultiCycleTraversal";
import { bestEffortCleanup } from "../parityGatedCyclePrototypeV1/BridgeRemoval";
import type { UnknownCase } from "../parityGatedCycleBlueprintV1/UnknownPopulationProfiling";

export const SWEEP_BUDGETS_MS = [500, 750, 1000, 1250, 1500, 1750, 2000];

// Gate G3 (fixed by Integration Planning Sprint v1's own Decision):
// componentCount>1 only.
export function matchesFixedGate(cubies: Cubie[]): boolean {
  const f = computeStructuralFeatures(cubies, "gate-check");
  return f.componentCount > 1;
}

function runFixedGatePipeline(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
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
  if (!best || best.moves.length === 0) return null;
  return best.moves;
}

export interface BudgetCaseOutcome {
  label: string;
  gateMatched: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
  solved: boolean;
  improved: boolean;
  trueRegression: boolean;
  wallMs: number;
}

// No-op Baseline (STEP5's comparison arm): the Gate is still evaluated
// (so gateMatched is real, not assumed), but no pipeline runs at all --
// mirrors parityGatedCyclePrototypeV1/CapabilityMeasurement.ts's own
// NO_OP_BASELINE.
export function evaluateNoOpBaseline(uc: UnknownCase): BudgetCaseOutcome {
  const cubies = cloneCubies(uc.hole.cubies);
  const gateMatched = matchesFixedGate(cubies);
  const wrongWingBefore = wrongWingCount5(cubies);
  return { label: uc.label, gateMatched, wrongWingBefore, wrongWingAfter: wrongWingBefore, solved: false, improved: false, trueRegression: false, wallMs: 0 };
}

export function evaluateOneCase(uc: UnknownCase, lib: WingLibrary, budgetMs: number): BudgetCaseOutcome {
  const cubies = cloneCubies(uc.hole.cubies);
  const gateMatched = matchesFixedGate(cubies);
  const wrongWingBefore = wrongWingCount5(cubies);
  if (!gateMatched) {
    return { label: uc.label, gateMatched, wrongWingBefore, wrongWingAfter: wrongWingBefore, solved: false, improved: false, trueRegression: false, wallMs: 0 };
  }
  const start = Date.now();
  const moves = runFixedGatePipeline(cubies, lib, Date.now() + budgetMs);
  const wallMs = Date.now() - start;
  let wrongWingAfter = wrongWingBefore;
  if (moves) {
    const after = cloneCubies(cubies);
    applySeq(after, moves);
    wrongWingAfter = wrongWingCount5(after);
  }
  return {
    label: uc.label,
    gateMatched,
    wrongWingBefore,
    wrongWingAfter,
    solved: wrongWingAfter === 0,
    improved: wrongWingAfter < wrongWingBefore,
    trueRegression: wrongWingAfter > wrongWingBefore,
    wallMs,
  };
}

export interface BudgetSummary {
  budgetMs: number;
  n: number;
  gateMatchedCount: number;
  improvedCount: number;
  rescueRate: number; // improvedCount / n
  trueRegressionCount: number;
  avgRuntimeMsAmongMatched: number;
  deadlineMissCount: number; // wallMs > budgetMs among gate-matched cases
}

export interface BudgetResult {
  budgetMs: number;
  outcomes: BudgetCaseOutcome[];
  summary: BudgetSummary;
}

export function runBudgetSweep(cases: readonly UnknownCase[], lib: WingLibrary): BudgetResult[] {
  return SWEEP_BUDGETS_MS.map((budgetMs) => {
    const outcomes = cases.map((uc) => evaluateOneCase(uc, lib, budgetMs));
    const n = outcomes.length;
    const matched = outcomes.filter((o) => o.gateMatched);
    const improved = outcomes.filter((o) => o.improved);
    const regressed = outcomes.filter((o) => o.trueRegression);
    const avgRuntimeMsAmongMatched = matched.length ? matched.reduce((s, o) => s + o.wallMs, 0) / matched.length : 0;
    const deadlineMissCount = matched.filter((o) => o.wallMs > budgetMs).length;
    const summary: BudgetSummary = {
      budgetMs,
      n,
      gateMatchedCount: matched.length,
      improvedCount: improved.length,
      rescueRate: n ? improved.length / n : 0,
      trueRegressionCount: regressed.length,
      avgRuntimeMsAmongMatched,
      deadlineMissCount,
    };
    return { budgetMs, outcomes, summary };
  });
}
