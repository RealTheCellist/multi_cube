// --- EndToEndValidationProbe (Mixed Commutator Production Validation
// Sprint v1, RQ-1/RQ-4) ------------------------------------------------------
// Calls the REAL, unmodified FiveByFiveEdgeSolverEngine.solve() directly --
// no mirror, no reimplementation of the solve loop itself. This is a fresh
// copy of productionIntegrationFinalization/EndToEndSolveProbe.ts's own
// pattern (not an edit of that file -- every Sprint in this arc builds its
// own new measurement modules rather than modifying a prior Sprint's own),
// with ONE addition: classifyRecoveryDescription recognizes
// "Mixed Pattern Bracket Commutator" (genMixedCommutator's own description
// string in fiveByFiveEdgeRecovery.ts) -- the prior Sprint's own copy of
// this parser predates MIXED_COMMUTATOR's existence and would silently
// classify it as null, undercounting its real trigger rate.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import type { RecoveryType, TraceEntry } from "../fiveByFiveEdgeSolverTypes";

let warmed = false;
export function ensureWarm(): void {
  if (!warmed) {
    warmupFiveByFiveEdgeLibraries();
    warmed = true;
  }
}

export interface ValidationRecoveryOutcome {
  candidatesOffered: RecoveryType[];
  chosenType: RecoveryType | null;
  succeeded: boolean;
  viaShortCircuit: boolean;
}

export interface ValidationSolveResult {
  label: string;
  wallMs: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  improved: boolean;
  solved: boolean;
  deadlineMissed: boolean;
  recoveryTriggered: boolean;
  recoveryOutcome: ValidationRecoveryOutcome | null;
}

function classifyRecoveryDescription(description: string): RecoveryType | null {
  if (description.startsWith("가벼운 Disruption") || description.startsWith("확장 Disruption")) return "DISRUPT";
  if (description.startsWith("Multi-ply Setup")) return "SETUP";
  if (description.startsWith("구조적 Cycle 해결")) return "REPAIR";
  if (description.startsWith("Clean-Cycle Resolution")) return "CCR";
  if (description.startsWith("Mixed Pattern Bracket Commutator")) return "MIXED_COMMUTATOR";
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

function parseRecoveryOutcome(trace: readonly TraceEntry[]): ValidationRecoveryOutcome | null {
  const triggered = trace.some((t) => t.label === "recovery-triggered");
  if (!triggered) return null;

  const noCandidates = trace.some((t) => t.label === "recovery-no-candidates");
  const candidatesEvent = trace.find((t) => t.label === "recovery-candidates");
  const candidatesOffered = candidatesEvent?.detail ? parseCandidatesOffered(candidatesEvent.detail) : [];

  if (noCandidates) {
    return { candidatesOffered, chosenType: null, succeeded: false, viaShortCircuit: false };
  }

  const appliedEvent = trace.find((t) => t.label === "recovery-applied");
  const chosenType = appliedEvent?.detail ? parseChosenType(appliedEvent.detail) : null;

  const shortCircuited = trace.some((t) => t.label === "recovery-repair-short-circuit");
  const retrySucceeded = trace.some((t) => t.label === "recovery-retry-success");
  const succeeded = shortCircuited || retrySucceeded;

  return { candidatesOffered, chosenType, succeeded, viaShortCircuit: shortCircuited };
}

/** Real, unmodified, current production solve() -- always includes Mixed
 * Commutator (executeTask/attemptRecovery have no passthrough to disable
 * it; see RecoveryLayerCounterfactual.ts for the Recovery-layer-level A/B
 * comparison, which is the one place a Baseline/Integrated toggle actually
 * exists in exported, unmodified production code). This function measures
 * the single real Integrated arm's absolute behavior. */
export function endToEndValidationProbe(cubies: Cubie[], label: string): ValidationSolveResult {
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
    label,
    wallMs: Date.now() - start,
    wrongWingBefore,
    wrongWingAfter,
    improved: wrongWingAfter < wrongWingBefore,
    solved: wrongWingAfter === 0,
    deadlineMissed: trace.some((t) => t.label === "budget-exhausted"),
    recoveryTriggered: trace.some((t) => t.label === "recovery-triggered"),
    recoveryOutcome: parseRecoveryOutcome(trace),
  };
}
