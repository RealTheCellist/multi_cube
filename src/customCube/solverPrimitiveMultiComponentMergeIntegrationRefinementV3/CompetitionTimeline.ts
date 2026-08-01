// --- CompetitionTimeline (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP1) -----------------------------------------------
// Residual Competition Census for the 3 successMismatch cases Refinement
// Sprint v2's own ComparativeConsistency.ts found (scrambleDepth30:2,
// scrambleDepth40:7, scrambleDepth100:5 -- all componentCountBefore=3, all
// succeeded in Comparative Prototype Sprint v1's isolated 2000ms test but
// failed in production Arm C at outer=2000ms). Reuses the real
// generateRecoveryStrategies() (read-only usage) with its own onEvent
// instrumentation hook (SchedulingEvent, already exported for exactly this
// purpose since Integration Refinement Sprint v1) -- same mechanism as
// parityGatedCycleIntegrationArchitecture/RecoveryTimelineCollector.ts,
// generalized here to (a) an arbitrary outerDeadlineMs parameter (that
// Sprint hard-coded 1000ms) and (b) MULTI_COMPONENT_MERGE included in the
// tracked type list (added after that Sprint ran). No production file
// touched.
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MULTI_COMPONENT_MERGE", "PARITY_GATED_CYCLE", "MIXED_COMMUTATOR"];

export interface TimelineEvent {
  type: RecoveryType;
  phase: SchedulingEvent["phase"];
  atMs: number; // relative to this call's own t=0
}

export interface CandidateSegment {
  type: RecoveryType;
  seq: number; // occurrence index for this type within the call (DISRUPT fires twice: genDisrupt1/genDisrupt2)
  startMs: number;
  finishMs: number | null; // null if a "start" event was never followed by a completion event (should not happen in practice -- every gen* always emits a terminal phase synchronously)
  ownRuntimeMs: number | null;
  remainingTimeAtStartMs: number; // outerDeadlineMs - startMs -- the effective cap this candidate could ever get, since every gen* clamps its own slice via Math.min(deadline, ...)
  finalPhase: SchedulingEvent["phase"];
}

export interface CaseCompetitionTimeline {
  label: string;
  outerDeadlineMs: number;
  events: TimelineEvent[];
  segments: CandidateSegment[]; // in real execution order
  offeredTypes: RecoveryType[];
  chosenType: RecoveryType | "none";
  mcmSegment: CandidateSegment | null;
  mcmOffered: boolean;
  mcmChosen: boolean;
  totalCallRuntimeMs: number;
}

export function collectTimelineForCase(cubies: Cubie[], label: string, libs: ExecutorLibraries, outerDeadlineMs: number): CaseCompetitionTimeline {
  const events: TimelineEvent[] = [];
  const t0 = Date.now();
  const onEvent = (e: SchedulingEvent) => events.push({ type: e.candidateType, phase: e.phase, atMs: e.atMs - t0 });

  const deadline = t0 + outerDeadlineMs;
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true, true, true, "AFTER_CCR");
  const totalCallRuntimeMs = Date.now() - t0;
  const best = chooseBestRecovery(candidates);
  const offeredTypes = [...new Set(candidates.map((c) => c.type))] as RecoveryType[];

  // Pair each "start" with the NEXT completion event of the same type, in
  // temporal order -- safe because this is synchronous single-threaded code
  // (no two candidates of the same type overlap), and correctly handles
  // DISRUPT firing twice (genDisrupt1/genDisrupt2) via a per-type queue.
  const pendingStarts: Partial<Record<RecoveryType, number[]>> = {};
  const seqCounter: Partial<Record<RecoveryType, number>> = {};
  const segments: CandidateSegment[] = [];
  for (const e of events) {
    if (e.phase === "start") {
      (pendingStarts[e.type] ??= []).push(e.atMs);
      continue;
    }
    const queue = pendingStarts[e.type];
    const startMs = queue && queue.length > 0 ? queue.shift()! : e.atMs;
    const seq = (seqCounter[e.type] ??= 0);
    seqCounter[e.type] = seq + 1;
    segments.push({
      type: e.type,
      seq,
      startMs,
      finishMs: e.atMs,
      ownRuntimeMs: e.atMs - startMs,
      remainingTimeAtStartMs: outerDeadlineMs - startMs,
      finalPhase: e.phase,
    });
  }

  const mcmSegment = segments.find((s) => s.type === "MULTI_COMPONENT_MERGE") ?? null;

  return {
    label,
    outerDeadlineMs,
    events,
    segments,
    offeredTypes,
    chosenType: best?.type ?? "none",
    mcmSegment,
    mcmOffered: offeredTypes.includes("MULTI_COMPONENT_MERGE"),
    mcmChosen: best?.type === "MULTI_COMPONENT_MERGE",
    totalCallRuntimeMs,
  };
}

export function collectTimelines(holes: readonly HoleCase[], libs: ExecutorLibraries, outerDeadlineMs: number): CaseCompetitionTimeline[] {
  return holes.map((h) => collectTimelineForCase(h.cubies, h.label, libs, outerDeadlineMs));
}
