// --- RecoveryFunnel (Recovery Necessity Validation Sprint v1, STEP3) ------
// Builds the real Need->Triggered->CandidateGenerated->Solved funnel using
// one fresh, real, unmodified FiveByFiveEdgeSolverEngine.solve() call per
// case (cheap -- a single call, not the 50-iteration loop) and reading its
// trace directly, exactly as EndToEndSolveProbe.ts's own established
// pattern does for "recovery-triggered"/"recovery-no-candidates".
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import type { NecessityGroundTruthRow } from "./NecessityGroundTruth";

let warmed = false;
function ensureWarm() {
  if (!warmed) {
    warmupFiveByFiveEdgeLibraries();
    warmed = true;
  }
}

export interface FunnelRow {
  label: string;
  requiresRecovery: boolean;
  triggered: boolean;
  candidateGenerated: boolean; // triggered AND did not hit "recovery-no-candidates"
  solved: boolean; // this single call's plan fully resolves the residual (rare, ground truth via wrongWingCount5)
}

export function measureFunnelForCase(cubies: Cubie[], label: string, groundTruth: NecessityGroundTruthRow): FunnelRow {
  ensureWarm();
  const clone = cloneCubies(cubies);
  const engine = new FiveByFiveEdgeSolverEngine();
  const plan = engine.solve(clone);
  applySeq(clone, plan.moveQueue);
  const trace = engine.getTrace();

  const triggered = trace.some((t) => t.label === "recovery-triggered");
  const noCandidates = trace.some((t) => t.label === "recovery-no-candidates");
  const candidateGenerated = triggered && !noCandidates;
  const solved = wrongWingCount5(clone) === 0;

  return { label, requiresRecovery: groundTruth.requiresRecovery, triggered, candidateGenerated, solved };
}

export interface FunnelSummary {
  need: number;
  triggeredGivenNeed: number;
  candidateGeneratedGivenNeed: number;
  solvedGivenNeed: number;
  totalTriggered: number;
  totalCandidateGenerated: number;
  totalSolved: number;
}

export function summarizeFunnel(rows: FunnelRow[]): FunnelSummary {
  const needRows = rows.filter((r) => r.requiresRecovery);
  return {
    need: needRows.length,
    triggeredGivenNeed: needRows.filter((r) => r.triggered).length,
    candidateGeneratedGivenNeed: needRows.filter((r) => r.candidateGenerated).length,
    solvedGivenNeed: needRows.filter((r) => r.solved).length,
    totalTriggered: rows.filter((r) => r.triggered).length,
    totalCandidateGenerated: rows.filter((r) => r.candidateGenerated).length,
    totalSolved: rows.filter((r) => r.solved).length,
  };
}
