// --- PlannerImpactCheck (Solver Primitive Integration Prototype Sprint
// v1) -- STEP6: Integration Blueprint Sprint v1's PlannerDependencyAnalysis.ts
// PREDICTED "Planner 영향 없음" from code reading alone (simulateStrategy
// always calls executeTask with allowRecovery=false, so Recovery/REPAIR
// is architecturally unreachable from Planner's simulation path). This
// Sprint's work order requires that prediction be EMPIRICALLY confirmed.
//
// An earlier version of this file compared only "isolated planEdgeTasks
// signature" (sigA) vs "signature after a REPAIR-including executeTask
// probe ran" (sigC), and found a ~15% mismatch rate -- which read as
// "Planner IS affected." A follow-up disclosed investigation (two ad-hoc
// probe scripts, not committed) found planEdgeTasks is ALREADY
// non-deterministic in complete isolation (sigA vs sigB, no
// Recovery/REPAIR involved at all) at essentially the SAME ~13% rate
// (19/150 baseline vs 16-20/150 with a probe run first, regardless of
// whether that probe used includeRepair=true or false). planEdgeTasks'
// own 200ms planDeadline is real wall-clock time, and its own strategy-
// simulation loop's own timing-sensitivity is a PRE-EXISTING property
// unrelated to this Sprint (Planner code is unmodified and forbidden to
// modify here) -- REPAIR's own INCREMENTAL contribution to the mismatch
// rate is what this Sprint's Blueprint prediction is actually about, and
// that increment is now measured directly rather than conflated with
// baseline jitter.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { SolveTask } from "../fiveByFiveEdgeSolverTypes";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";

const PROBE_TASK: SolveTask = { id: 0, type: "ENDGAME", description: "planner-impact-probe", targetEdge: -1, score: 0 };

function taskSignature(tasks: readonly SolveTask[]): string {
  return tasks.map((t) => `${t.type}:${t.targetEdge}:${t.description}`).join("|");
}

function planOnce(cubies: Cubie[], libs: ExecutorLibraries): string {
  const working = cloneCubies(cubies);
  const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);
  return taskSignature(tasks);
}

export interface PlannerImpactRecord {
  hash: string;
  baselineDeterminismHolds: boolean; // sigA vs sigB, NO executeTask probe run between them at all -- pre-existing Planner jitter, unrelated to this Sprint
  unaffectedWithoutRepairProbe: boolean; // sigA vs sigC where the probe used includeRepair=false (pre-Sprint behavior reconstructed)
  unaffectedWithRepairProbe: boolean; // sigA vs sigC where the probe used includeRepair=true (this Sprint's real production default) -- the actual quantity Blueprint's prediction is about
}

export interface PlannerImpactSummary {
  n: number;
  baselineMismatchCount: number; // pre-existing jitter, independent of this Sprint
  mismatchWithoutRepairProbeCount: number;
  mismatchWithRepairProbeCount: number;
  // The REPAIR-attributable increment: how much WORSE the with-REPAIR mismatch rate is
  // than the pre-existing baseline. Can be negative (pure noise) -- reported as-is, not floored at 0.
  repairAttributableIncrementCount: number;
  records: PlannerImpactRecord[];
}

export function checkPlannerImpact(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): PlannerImpactSummary {
  const records: PlannerImpactRecord[] = snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);

    const sigA = planOnce(cubies, libs);
    const sigB = planOnce(cubies, libs);
    const baselineDeterminismHolds = sigA === sigB;

    const scratchNoRepair = cloneCubies(cubies);
    executeTask(scratchNoRepair, PROBE_TASK, libs, Date.now() + 400, undefined, true, undefined, false, false);
    const sigC_noRepair = planOnce(cubies, libs);
    const unaffectedWithoutRepairProbe = sigA === sigC_noRepair;

    const scratchWithRepair = cloneCubies(cubies);
    executeTask(scratchWithRepair, PROBE_TASK, libs, Date.now() + 400, undefined, true, undefined, true, true);
    const sigC_withRepair = planOnce(cubies, libs);
    const unaffectedWithRepairProbe = sigA === sigC_withRepair;

    return { hash: s.hash, baselineDeterminismHolds, unaffectedWithoutRepairProbe, unaffectedWithRepairProbe };
  });

  const n = records.length;
  const baselineMismatchCount = records.filter((r) => !r.baselineDeterminismHolds).length;
  const mismatchWithoutRepairProbeCount = records.filter((r) => !r.unaffectedWithoutRepairProbe).length;
  const mismatchWithRepairProbeCount = records.filter((r) => !r.unaffectedWithRepairProbe).length;

  return {
    n,
    baselineMismatchCount,
    mismatchWithoutRepairProbeCount,
    mismatchWithRepairProbeCount,
    repairAttributableIncrementCount: mismatchWithRepairProbeCount - mismatchWithoutRepairProbeCount,
    records,
  };
}
