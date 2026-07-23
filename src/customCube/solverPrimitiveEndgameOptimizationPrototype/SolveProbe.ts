// --- SolveProbe (ENDGAME Optimization Prototype Sprint v1) ------------------
// Calls the REAL, unmodified FiveByFiveEdgeSolverEngine.solve() directly --
// no mirror needed this Sprint, unlike prior Sprints, since STEP1 wired
// both Budget Policy variants (Reserved Slice via `endgameReserveMs`, Absorb
// via `recoveryReserveMsOverride`) as new trailing optional params directly
// onto the real production solve() (see fiveByFiveEdgeSolverEngine.ts).
// Passing neither reconstructs exact current Baseline behavior.
//
// Also extracts the ENDGAME-specific instrumentation this Sprint's own
// STEP1 added to solve()'s own trace log (the "endgame-instrumentation"
// entry, emitted only when an ENDGAME task actually runs) -- this is the
// real, measured basis for STEP3's ENDGAME Runtime/invocation-count and
// STEP5's Reserved Slice usage-rate metrics, not an estimate.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";

let warmed = false;
export function ensureWarm(): void {
  if (!warmed) {
    warmupFiveByFiveEdgeLibraries();
    warmed = true;
  }
}

export interface EndgameInstrumentation {
  runtimeMs: number;
  remainingBudgetAtStartMs: number;
  reservedSliceActive: boolean;
  improved: boolean;
}

export interface SolveProbeResult {
  wallMs: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  improved: boolean;
  solved: boolean;
  moveCount: number;
  tasksCompleted: number;
  deadlineMissed: boolean;
  endgame: EndgameInstrumentation | null; // null if no ENDGAME task ran this solve()
}

const ENDGAME_TRACE_RE =
  /runtimeMs=(-?\d+), remainingBudgetAtStart=(-?\d+), reservedSliceActive=(true|false), improved=(true|false)/;

function parseEndgameInstrumentation(trace: readonly { label: string; detail?: string }[]): EndgameInstrumentation | null {
  const entry = trace.find((t) => t.label === "endgame-instrumentation");
  if (!entry?.detail) return null;
  const m = ENDGAME_TRACE_RE.exec(entry.detail);
  if (!m) return null;
  return {
    runtimeMs: Number(m[1]),
    remainingBudgetAtStartMs: Number(m[2]),
    reservedSliceActive: m[3] === "true",
    improved: m[4] === "true",
  };
}

/**
 * `endgameReserveMs`/`recoveryReserveMsOverride`: pass-through to solve()'s
 * own new params. Both `undefined` (omit) reconstructs the exact Baseline
 * (pre-Sprint behavior, unaffected by this Sprint's own change).
 */
export function solveProbe(cubies: Cubie[], endgameReserveMs?: number, recoveryReserveMsOverride?: number): SolveProbeResult {
  ensureWarm();
  const start = Date.now();
  const wrongWingBefore = wrongWingCount5(cubies);
  const engine = new FiveByFiveEdgeSolverEngine();
  const plan = engine.solve(cubies, undefined, endgameReserveMs, recoveryReserveMsOverride);
  const after = cloneCubies(cubies);
  applySeq(after, plan.moveQueue);
  const wrongWingAfter = wrongWingCount5(after);
  const trace = engine.getTrace();
  const deadlineMissed = trace.some((t) => t.label === "budget-exhausted");
  return {
    wallMs: Date.now() - start,
    wrongWingBefore,
    wrongWingAfter,
    improved: wrongWingAfter < wrongWingBefore,
    solved: wrongWingAfter === 0,
    moveCount: plan.moveQueue.length,
    tasksCompleted: plan.tasks.length,
    deadlineMissed,
    endgame: parseEndgameInstrumentation(trace),
  };
}
