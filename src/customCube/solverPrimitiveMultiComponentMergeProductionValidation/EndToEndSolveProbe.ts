// --- EndToEndSolveProbe (Multi-Component Merge Production Validation
// Sprint v1) --------------------------------------------------------------------
// Disclosed duplicate of solverReleaseReadiness/EndToEndSolveProbe.ts (itself
// a disclosed duplicate of productionIntegrationFinalization's own version,
// which predates PARITY_GATED_CYCLE and MULTI_COMPONENT_MERGE's own
// production integration) -- this Sprint's own Primitive Interaction Audit
// (STEP4) needs those two additional RecoveryTypes classified, so per the
// SAME precedent that file's own header comment establishes ("rather than
// editing a prior Sprint's own citable module, this is a byte-for-byte copy
// with ONLY the needed classification branches added"), this is a
// byte-for-byte copy with PARITY_GATED_CYCLE + MULTI_COMPONENT_MERGE added
// to classifyRecoveryDescription(). Calls the REAL, unmodified
// FiveByFiveEdgeSolverEngine.solve() directly -- no mirror, no
// reimplementation, no production file touched.
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

export interface RecoveryEventOutcome {
  candidatesOffered: RecoveryType[];
  chosenType: RecoveryType | null;
  succeeded: boolean;
  viaShortCircuit: boolean;
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
  plannedTaskTypes: SolveTaskType[];
  completedTaskTypes: SolveTaskType[];
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
  if (description.startsWith("Mixed Pattern Bracket Commutator")) return "MIXED_COMMUTATOR";
  if (description.startsWith("Cross-Component Bridge Cycle Resolver")) return "PARITY_GATED_CYCLE"; // added this Sprint
  if (description.startsWith("Sequential Multi-Component Merge")) return "MULTI_COMPONENT_MERGE"; // added this Sprint
  return null;
}

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

export function endToEndSolveProbe(cubies: Cubie[], hash: string): EndToEndSolveResult {
  ensureWarm();
  const start = Date.now();
  const wrongWingBefore = wrongWingCount5(cubies);
  const engine = new FiveByFiveEdgeSolverEngine();
  const plan = engine.solve(cubies);
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
