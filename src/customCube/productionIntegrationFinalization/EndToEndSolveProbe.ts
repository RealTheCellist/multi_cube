// --- EndToEndSolveProbe (Production Integration Finalization Sprint v1)
// -----------------------------------------------------------------------
// Calls the REAL, unmodified FiveByFiveEdgeSolverEngine.solve() directly --
// no mirror, no reimplementation. Baseline reconstructs the PRE-Finalization
// production behavior by passing recoveryReserveMsOverride=450 explicitly
// (today's real production value before this Sprint); Integrated omits it,
// so the new confirmed default (250ms, PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS)
// applies automatically -- exactly what every real UI caller now gets.
//
// Per-primitive attribution (PAIR/FLIP/PARITY/ENDGAME task types;
// DISRUPT/SETUP/REPAIR/CCR recovery types) is read directly from solve()'s
// own real trace log -- a genuine byproduct of calling the real,
// unmodified executeTask()/attemptRecovery()/generateRecoveryStrategies(),
// parsed the same disclosed, regex-based way established by
// solverPrimitiveEndgameOptimizationPrototype/SolveProbe.ts's own
// parseEndgameInstrumentation. No new instrumentation hooks were added to
// Recovery Logic (forbidden this Sprint) -- every field below is derived
// from trace text the unmodified functions already emit.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import type { SolveTaskType, RecoveryType, TraceEntry } from "../fiveByFiveEdgeSolverTypes";

let warmed = false;
export function ensureWarm(): void {
  if (!warmed) {
    warmupFiveByFiveEdgeLibraries();
    warmed = true;
  }
}

export const PRE_FINALIZATION_RECOVERY_RESERVE_MS = 450; // today's real production value BEFORE this Sprint (RECOVERY_RESERVE_MS)

export interface RecoveryEventOutcome {
  candidatesOffered: RecoveryType[]; // parsed from the one "recovery-candidates" event (MAX_RECOVERY_RETRIES=1, so at most one per solve())
  chosenType: RecoveryType | null; // null only if "recovery-no-candidates" fired
  succeeded: boolean;
  viaShortCircuit: boolean; // REPAIR/CCR's own Deferred-Validation short-circuit, vs a retryTask-mediated success
  loopDetected: boolean;
}

export interface EndToEndSolveResult {
  hash: string;
  wallMs: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  improved: boolean;
  solved: boolean;
  deadlineMissed: boolean;
  plannedTaskTypes: SolveTaskType[]; // every task the Planner queued, parsed from "plan-tasks"
  completedTaskTypes: SolveTaskType[]; // only the ones that actually produced moves (plan.tasks itself)
  recoveryTriggered: boolean;
  recoveryOutcome: RecoveryEventOutcome | null;
}

const PLAN_TASKS_RE = /(\d+)개 태스크: (.+)$/;
const TASK_TOKEN_RE = /(PAIR|FLIP|PARITY|ENDGAME)\(/g;

function parsePlannedTaskTypes(trace: readonly TraceEntry[]): SolveTaskType[] {
  const entry = trace.find((t) => t.label === "plan-tasks");
  if (!entry?.detail) return [];
  const m = PLAN_TASKS_RE.exec(entry.detail);
  if (!m) return [];
  const types: SolveTaskType[] = [];
  let tok: RegExpExecArray | null;
  TASK_TOKEN_RE.lastIndex = 0;
  while ((tok = TASK_TOKEN_RE.exec(m[2])) !== null) types.push(tok[1] as SolveTaskType);
  return types;
}

function classifyRecoveryDescription(description: string): RecoveryType | null {
  if (description.startsWith("가벼운 Disruption") || description.startsWith("확장 Disruption")) return "DISRUPT";
  if (description.startsWith("Multi-ply Setup")) return "SETUP";
  if (description.startsWith("구조적 Cycle 해결")) return "REPAIR";
  if (description.startsWith("Clean-Cycle Resolution")) return "CCR";
  return null;
}

// "recovery-candidates" detail: `${c.description}: score=${score}` joined by " / "
function parseCandidatesOffered(detail: string): RecoveryType[] {
  return detail
    .split(" / ")
    .map((seg) => {
      const idx = seg.lastIndexOf(": score=");
      const desc = idx >= 0 ? seg.slice(0, idx) : seg;
      return classifyRecoveryDescription(desc);
    })
    .filter((t): t is RecoveryType => t !== null);
}

// "recovery-applied" detail: `"${best.description}" 선택 -- wrongWing ...`
function parseChosenType(detail: string): RecoveryType | null {
  const m = /^"([^"]+)"/.exec(detail);
  if (!m) return null;
  return classifyRecoveryDescription(m[1]);
}

function parseRecoveryOutcome(trace: readonly TraceEntry[]): RecoveryEventOutcome | null {
  const triggered = trace.some((t) => t.label === "recovery-triggered");
  if (!triggered) return null;

  const noCandidates = trace.some((t) => t.label === "recovery-no-candidates");
  const candidatesEvent = trace.find((t) => t.label === "recovery-candidates");
  const candidatesOffered = candidatesEvent?.detail ? parseCandidatesOffered(candidatesEvent.detail) : [];

  if (noCandidates) {
    return { candidatesOffered, chosenType: null, succeeded: false, viaShortCircuit: false, loopDetected: false };
  }

  const loopDetected = trace.some((t) => t.label === "recovery-loop-detected");
  const appliedEvent = trace.find((t) => t.label === "recovery-applied");
  const chosenType = appliedEvent?.detail ? parseChosenType(appliedEvent.detail) : null;

  const shortCircuited = trace.some((t) => t.label === "recovery-repair-short-circuit");
  const retrySucceeded = trace.some((t) => t.label === "recovery-retry-success");
  const succeeded = shortCircuited || retrySucceeded;

  return { candidatesOffered, chosenType, succeeded, viaShortCircuit: shortCircuited, loopDetected };
}

/**
 * `recoveryReserveMsOverride`: pass 450 (PRE_FINALIZATION_RECOVERY_RESERVE_MS)
 * to reconstruct the pre-Finalization Baseline; omit (undefined) to use the
 * real, current production default (250ms) -- the Integrated arm.
 */
export function endToEndSolveProbe(cubies: Cubie[], hash: string, recoveryReserveMsOverride?: number): EndToEndSolveResult {
  ensureWarm();
  const start = Date.now();
  const wrongWingBefore = wrongWingCount5(cubies);
  const engine = new FiveByFiveEdgeSolverEngine();
  const plan = engine.solve(cubies, undefined, undefined, recoveryReserveMsOverride);
  const after = cloneCubies(cubies);
  applySeq(after, plan.moveQueue);
  const wrongWingAfter = wrongWingCount5(after);
  const trace = engine.getTrace();
  return {
    hash,
    wallMs: Date.now() - start,
    wrongWingBefore,
    wrongWingAfter,
    improved: wrongWingAfter < wrongWingBefore,
    solved: wrongWingAfter === 0,
    deadlineMissed: trace.some((t) => t.label === "budget-exhausted"),
    plannedTaskTypes: parsePlannedTaskTypes(trace),
    completedTaskTypes: plan.tasks.map((t) => t.type),
    recoveryTriggered: trace.some((t) => t.label === "recovery-triggered"),
    recoveryOutcome: parseRecoveryOutcome(trace),
  };
}
