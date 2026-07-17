// --- FailureCollector (Failure Analysis Engine v1) --------------------------
// Turns ONE finished solve() call into a FailureSnapshot, purely by reading
// the SolverEngine's already-public outputs (the SolvePlan it returned, its
// Trace log) -- never touching Planner/Executor/Recovery internals, and
// never mutating the live cube. A "failure" here means: every task in the
// plan (including ENDGAME, including any Recovery attempt) was already
// tried, and wrongWingCount is still > 0 once the plan's own moveQueue is
// fully applied -- exactly spec's "ENDGAME 실패 + Recovery 실패 + Solve
// 종료 + WrongWing>0 + Plan 종료" condition list, all of which reduce to a
// single checkable fact: `plan.score < 0` (score is always -finalWrong, see
// fiveByFiveEdgeSolverEngine.ts's solve()).
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { analyzeEdgeSlots, detectEdgeSlotPattern } from "../fiveByFiveHumanEdges";
import type { SolvePlan, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { serializeCube } from "./cubeSerialization";
import { slotToIndex } from "./slotOrder";
import type { FailureSnapshot, PrimitiveAttempt, PrimitiveName } from "./failureTypes";
import { computeEdgeSolverStateHash } from "../fiveByFiveEdgeStateHash";

function primitiveForTaskDescription(detail: string | undefined): PrimitiveName | null {
  if (!detail) return null;
  if (detail.includes("Last-2-Edges")) return "PARITY";
  if (detail.includes("그라인더")) return "ENDGAME";
  if (detail.includes("flip 보정")) return "FLIP";
  if (detail.includes("wing 페어링")) return "BASE";
  return null;
}

function extractPrimitiveAttempts(trace: readonly TraceEntry[]): PrimitiveAttempt[] {
  const attempts: PrimitiveAttempt[] = [];
  for (const t of trace) {
    const m = /^task-\d+(-skip)?$/.exec(t.label);
    if (!m) continue;
    const primitive = primitiveForTaskDescription(t.detail);
    if (!primitive) continue;
    attempts.push({ primitive, succeeded: !m[1], detail: t.detail });
  }
  const recoveryTriggered = trace.some((t) => t.label === "recovery-triggered");
  if (recoveryTriggered) {
    const recoverySucceeded = trace.some((t) => t.label === "recovery-retry-success");
    attempts.push({ primitive: "RECOVERY", succeeded: recoverySucceeded });
  }
  return attempts;
}

/**
 * `inputCubies` must be the SAME cube state that was passed into the
 * SolverEngine's solve() call that produced `plan` -- the snapshot's cube
 * state is reconstructed by replaying plan.moveQueue against a clone of it
 * (never against the live cube directly), so this function never needs
 * access to the SolverEngine's own private `working` field.
 */
export function collectFailure(inputCubies: readonly Cubie[], plan: SolvePlan, trace: readonly TraceEntry[]): FailureSnapshot | null {
  if (plan.score >= 0) return null; // fully resolved -- not a failure

  const after = cloneCubies(inputCubies as Cubie[]);
  applySeq(after, plan.moveQueue);
  const wrongWingCount = wrongWingCount5(after);
  if (wrongWingCount === 0) return null; // defensive: plan.score should already guarantee this matches

  const allStats = analyzeEdgeSlots(after);
  const unfinished = allStats.filter((s) => s.pairedCount < 2);
  const pairedEdges = allStats.length - unfinished.length;
  const parity = unfinished.some((s) => detectEdgeSlotPattern(s) === "unpaired");
  const remainingEdges = unfinished.map((s) => slotToIndex(s.slot)).filter((i) => i >= 0);

  const primitiveAttempts = extractPrimitiveAttempts(trace);
  const recoveryAttempted = trace.some((t) => t.label === "recovery-triggered");
  const recoverySucceeded = trace.some((t) => t.label === "recovery-retry-success");

  const hash = computeEdgeSolverStateHash(after).toString(16);

  return {
    cubeState: serializeCube(after),
    wrongWingCount,
    pairedEdges,
    parity,
    remainingEdges,
    timestamp: Date.now(),
    hash,
    trace: [...trace],
    primitiveAttempts,
    recoveryAttempted,
    recoverySucceeded,
  };
}
