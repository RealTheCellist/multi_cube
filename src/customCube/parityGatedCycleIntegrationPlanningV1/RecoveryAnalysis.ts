// --- RecoveryAnalysis (Parity-Gated Cycle Production Integration Planning
// Sprint v1, STEP1) ----------------------------------------------------------
// Calls the REAL, unmodified generateRecoveryStrategies()/chooseBestRecovery()
// (fiveByFiveEdgeRecovery.ts, production default schedulingStrategy=
// "reservedBudget", useSetupReservedSlice=true) directly with its own
// `onEvent` instrumentation hook (SchedulingEvent, already exported for
// exactly this purpose -- established precedent:
// gateProductionIntegration/RecoveryFlowMeasurement.ts measured ONE
// candidate type this way; this generalizes to all 6 real types
// simultaneously). Read-only usage -- production file untouched.
//
// Static pipeline facts below (order, Gate, Budget) are transcribed
// directly from fiveByFiveEdgeRecovery.ts's own source (cited by line),
// not re-derived or guessed:
//   order (today's production default) = [DISRUPT x2, REPAIR, CCR,
//     MIXED_COMMUTATOR, SETUP]
//   DISRUPT x2: shared genDeadline slice() = RECOVERY_GEN_BUDGET_MS(300ms)/4
//   REPAIR: Gate cycleLength 2~4 AND conflictEdgeCount>0 (W2_widerHop's own
//     Gate); Budget REPAIR_RESERVED_SLICE_MS=75ms off outer deadline
//   CCR: Gate primaryCycleLength in [5,6] AND conflictEdgeCount===0;
//     Budget "remainingTime" (whatever's left of the outer deadline)
//   MIXED_COMMUTATOR: Gate cycleCount===1 AND componentCount===1; Budget
//     MIXED_COMMUTATOR_RESERVED_SLICE_MS=300ms off outer deadline
//   SETUP: Gate "last resort" (candidates.length===0 at that point in the
//     order); Budget SETUP_RESERVED_SLICE_MS=500ms off outer deadline
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR"];
export const OUTER_DEADLINE_MS = 1000; // Section 14's whole-solver cap, matches every prior Sprint's own Recovery-layer measurement budget

export interface PerTypeEvent {
  phase: "generated" | "empty" | "skipped" | "never_started";
  ownMs: number | null; // start->terminal event delta, isolates this type's own cost from the rest of the pipeline
}

export interface RecoveryFlowRow {
  label: string;
  wrongWingBefore: number;
  perType: Record<RecoveryType, PerTypeEvent>;
  chosenType: RecoveryType | null;
  candidateCount: number;
}

export function measureOneCase(cubies: Cubie[], label: string, libs: ExecutorLibraries): RecoveryFlowRow {
  const startMs: Partial<Record<RecoveryType, number>> = {};
  const perType: Record<RecoveryType, PerTypeEvent> = Object.fromEntries(RECOVERY_TYPES.map((t) => [t, { phase: "never_started", ownMs: null }])) as Record<RecoveryType, PerTypeEvent>;

  const onEvent = (e: SchedulingEvent) => {
    if (e.phase === "start") {
      startMs[e.candidateType] = e.atMs;
      return;
    }
    const start = startMs[e.candidateType];
    perType[e.candidateType] = { phase: e.phase, ownMs: start !== undefined ? e.atMs - start : null };
  };

  const wrongWingBefore = wrongWingCount5(cubies);
  const deadline = Date.now() + OUTER_DEADLINE_MS;
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true);
  const best = chooseBestRecovery(candidates);

  return { label, wrongWingBefore, perType, chosenType: best?.type ?? null, candidateCount: candidates.length };
}

export function measureRecoveryFlow(holes: readonly HoleCase[], libs: ExecutorLibraries): RecoveryFlowRow[] {
  return holes.map((h) => measureOneCase(h.cubies, h.label, libs));
}

export interface TypeSummary {
  type: RecoveryType;
  generatedCount: number;
  emptyCount: number;
  skippedCount: number;
  neverStartedCount: number;
  generatedRate: number;
  chosenCount: number; // won chooseBestRecovery's argmax
  winRateAmongGenerated: number; // chosenCount / generatedCount
  avgOwnMsAmongGenerated: number;
}

export function summarizeByType(rows: readonly RecoveryFlowRow[]): TypeSummary[] {
  const n = rows.length;
  return RECOVERY_TYPES.map((type) => {
    const entries = rows.map((r) => r.perType[type]);
    const generated = entries.filter((e) => e.phase === "generated");
    const empty = entries.filter((e) => e.phase === "empty");
    const skipped = entries.filter((e) => e.phase === "skipped");
    const neverStarted = entries.filter((e) => e.phase === "never_started");
    const chosenCount = rows.filter((r) => r.chosenType === type).length;
    const avgOwnMsAmongGenerated = generated.length ? generated.reduce((s, e) => s + (e.ownMs ?? 0), 0) / generated.length : 0;
    return {
      type,
      generatedCount: generated.length,
      emptyCount: empty.length,
      skippedCount: skipped.length,
      neverStartedCount: neverStarted.length,
      generatedRate: n ? generated.length / n : 0,
      chosenCount,
      winRateAmongGenerated: generated.length ? chosenCount / generated.length : 0,
      avgOwnMsAmongGenerated,
    };
  });
}
