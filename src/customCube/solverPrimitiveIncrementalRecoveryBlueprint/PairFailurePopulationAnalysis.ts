// --- PairFailurePopulationAnalysis (Incremental Recovery Blueprint Sprint
// v1) ----------------------------------------------------------------------
// STEP1. Recovery Architecture Review Sprint v1 found PAIR tasks fail to
// make progress 79.9% of the time (1436/1797 real attempts) -- the single
// largest "wasted" population in the whole pipeline, far larger than
// ENDGAME's own 51 attempts. This module captures the REAL structural
// state at every such PAIR no-progress point, using the exact same
// real, unmodified planEdgeTasks()/executeTask() the real solve() loop
// itself uses -- just orchestrated here (read-only, allowRecovery=true,
// byte-identical to fiveByFiveEdgeSolverEngine.ts's own solve() loop) so
// intermediate cube states are observable, since SolverEngine.solve()'s
// own public API doesn't expose them.
import { cloneCubies, type Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { wrongWingCount5, wrongWings5 } from "../fiveByFiveEdges";
import { analyzeEdgeSlots } from "../fiveByFiveHumanEdges";
import { planEdgeTasks, slotKeyForIndex } from "../fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";

export type NoProgressKind = "slot-already-resolved" | "search-failed";

export interface PairFailureRecord {
  hash: string;
  taskId: number;
  slot: string | null;
  kind: NoProgressKind;
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  cycleLength: number; // primary WANTS-graph cycle length AT THIS POINT (analyzeCcrGate, reused unmodified)
  conflictEdgeCount: number;
  ccrGateEligible: boolean; // CCR's own current Gate (cycleLength 5-6, conflictEdgeCount=0), reused unmodified
  repairGateEligible: boolean; // REPAIR's own current Gate (cycleLength 2-4), reused unmodified
  cubies: Cubie[]; // a snapshot of the cube AT THIS EXACT POINT -- lets STEP3 probe CCR/REPAIR directly without re-simulating the whole trajectory
  remainingTimeAtCaptureMs: number; // real deadline - Date.now() at this exact point -- the REAL time an Incremental Recovery attempt could ever get here, before any of its own budget policy is even applied
  tasksRemainingAfter: number; // how many more tasks (of any type) were still queued after this one -- for AdaptiveSlice's own denominator
}

function wrongWingsInSlot(cubies: Cubie[], slot: string): number {
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const stats = analyzeEdgeSlots(cubies).find((s) => s.slot === slot);
  if (!stats) return 0;
  return stats.wings.filter((w) => wrongIds.has(w.id)).length;
}

/** REPAIR's own current Gate (post Gate Relaxation): cycleLength 2~4, any conflictEdgeCount. */
function repairGateEligible(cycleLength: number): boolean {
  return cycleLength >= 2 && cycleLength <= 4;
}

export function analyzePairFailures(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): PairFailureRecord[] {
  const records: PairFailureRecord[] = [];

  for (const s of snapshots) {
    const original = deserializeCube(s.cubeState);
    const working = cloneCubies(original);
    const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
    const planDeadline = Math.min(deadline, Date.now() + 200);
    const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (Date.now() > deadline) break;
      if (wrongWingCount5(working) === 0) break;
      const moves = executeTask(working, task, libs, deadline, undefined, true);

      if (task.type === "PAIR" && moves.length === 0) {
        const slot = task.targetEdge >= 0 ? slotKeyForIndex(task.targetEdge) : null;
        const wrongInSlot = slot ? wrongWingsInSlot(working, slot) : 0;
        const gate = analyzeCcrGate(working);
        records.push({
          hash: s.hash,
          taskId: task.id,
          slot,
          kind: wrongInSlot === 0 ? "slot-already-resolved" : "search-failed",
          wrongWingCount: wrongWingCount5(working),
          pairCount: pairCountOf(working),
          parity: hasParity(working),
          cycleLength: gate.primaryCycleLength,
          conflictEdgeCount: gate.conflictEdgeCount,
          remainingTimeAtCaptureMs: Math.max(0, deadline - Date.now()),
          tasksRemainingAfter: tasks.length - (i + 1),
          ccrGateEligible: gate.eligible,
          repairGateEligible: repairGateEligible(gate.primaryCycleLength),
          cubies: cloneCubies(working),
        });
      }
    }
  }

  return records;
}

export interface PairFailureSummary {
  n: number;
  slotAlreadyResolvedCount: number;
  searchFailedCount: number;
  avgWrongWingCount: number;
  avgPairCount: number;
  parityShare: number;
  cycleLengthDistribution: Record<string, number>; // "0" | "2-4" | "5-6" | "7+"
  avgConflictEdgeCount: number;
  ccrGateEligibleCount: number;
  repairGateEligibleCount: number;
  neitherGateEligibleCount: number;
}

function cycleLengthBand(cycleLength: number): string {
  if (cycleLength === 0) return "0";
  if (cycleLength <= 4) return "2-4";
  if (cycleLength <= 6) return "5-6";
  return "7+";
}

export function summarizePairFailures(records: readonly PairFailureRecord[]): PairFailureSummary {
  const n = records.length;
  const cycleLengthDistribution: Record<string, number> = {};
  for (const r of records) {
    const band = cycleLengthBand(r.cycleLength);
    cycleLengthDistribution[band] = (cycleLengthDistribution[band] ?? 0) + 1;
  }
  return {
    n,
    slotAlreadyResolvedCount: records.filter((r) => r.kind === "slot-already-resolved").length,
    searchFailedCount: records.filter((r) => r.kind === "search-failed").length,
    avgWrongWingCount: n ? records.reduce((a, r) => a + r.wrongWingCount, 0) / n : 0,
    avgPairCount: n ? records.reduce((a, r) => a + r.pairCount, 0) / n : 0,
    parityShare: n ? records.filter((r) => r.parity).length / n : 0,
    cycleLengthDistribution,
    avgConflictEdgeCount: n ? records.reduce((a, r) => a + r.conflictEdgeCount, 0) / n : 0,
    ccrGateEligibleCount: records.filter((r) => r.ccrGateEligible).length,
    repairGateEligibleCount: records.filter((r) => r.repairGateEligible).length,
    neitherGateEligibleCount: records.filter((r) => !r.ccrGateEligible && !r.repairGateEligible).length,
  };
}
