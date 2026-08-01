// --- ContractAudit (Multi-Component Merge Production Integration Sprint
// v1, STEP2) -------------------------------------------------------------------
// Real Production Replay (generateRecoveryStrategies()/chooseBestRecovery(),
// UNMODIFIED except for this Sprint's own STEP1 wiring, called read-only
// via its own `onEvent` hook) over the full 142-case Hole Dataset.
// Measures Position (call order), Gate hit rate, Budget clamp (the REAL
// runway MULTI_COMPONENT_MERGE gets after CCR's own remainingTime
// contract may have already consumed outer-deadline wall-clock), and
// RecoveryType chosen per case -- verified against Integration Planning
// Sprint v1's own confirmed Contract (Gate componentCount>=3, Budget
// 2000ms Dedicated Slice, Position before_PARITY/after_CCR).
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const OUTER_DEADLINE_MS = 1000; // matches every prior Sprint's own Recovery-layer measurement budget
const NOMINAL_MCM_BUDGET_MS = 2000; // MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS, cited from fiveByFiveEdgeRecovery.ts

export interface ContractAuditRow {
  label: string;
  gateMatched: boolean; // real componentCount>=3, observed via mcmPhase !== "skipped" (the Gate check IS the skip condition)
  mcmPhase: "generated" | "empty" | "skipped" | "never_started";
  mcmStartMs: number | null;
  actualBudgetAvailableMs: number | null; // min(NOMINAL_MCM_BUDGET_MS, outerDeadline - mcmStartMs) -- the REAL runway MCM got, after everything before it in the order already consumed wall-clock
  ccrTerminalBeforeMcmStart: boolean | null; // Position check: CCR's own terminal event (generated/empty/skipped) happened strictly before MCM's start
  mcmStartBeforeParityStart: boolean | null; // Position check: MCM's start happened strictly before PARITY_GATED_CYCLE's start
  chosenType: RecoveryType | null;
}

export function auditOneCase(cubies: Cubie[], label: string, libs: ExecutorLibraries): ContractAuditRow {
  const events: SchedulingEvent[] = [];
  const startMs: Partial<Record<RecoveryType, number>> = {};
  const terminalMs: Partial<Record<RecoveryType, number>> = {};
  const onEvent = (e: SchedulingEvent) => {
    events.push(e);
    if (e.phase === "start") startMs[e.candidateType] = e.atMs;
    else terminalMs[e.candidateType] = e.atMs;
  };

  const deadline = Date.now() + OUTER_DEADLINE_MS;
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true, true, true);
  const best = chooseBestRecovery(candidates);

  const mcmEvent = events.filter((e) => e.candidateType === "MULTI_COMPONENT_MERGE").slice(-1)[0];
  const mcmPhase: ContractAuditRow["mcmPhase"] = mcmEvent ? (mcmEvent.phase as ContractAuditRow["mcmPhase"]) : "never_started";
  const mcmStartMs = startMs["MULTI_COMPONENT_MERGE"] ?? null;
  const actualBudgetAvailableMs = mcmStartMs !== null ? Math.min(NOMINAL_MCM_BUDGET_MS, deadline - mcmStartMs) : null;

  const ccrTerminal = terminalMs["CCR"];
  const parityStart = startMs["PARITY_GATED_CYCLE"];
  const ccrTerminalBeforeMcmStart = ccrTerminal !== undefined && mcmStartMs !== null ? ccrTerminal <= mcmStartMs : null;
  const mcmStartBeforeParityStart = parityStart !== undefined && mcmStartMs !== null ? mcmStartMs <= parityStart : null;

  return {
    label,
    gateMatched: mcmPhase !== "skipped" && mcmPhase !== "never_started",
    mcmPhase,
    mcmStartMs,
    actualBudgetAvailableMs,
    ccrTerminalBeforeMcmStart,
    mcmStartBeforeParityStart,
    chosenType: best?.type ?? null,
  };
}

export function auditPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries): ContractAuditRow[] {
  return holes.map((h) => auditOneCase(h.cubies, h.label, libs));
}

export interface ContractAuditSummary {
  n: number;
  gateMatchedCount: number;
  gateMatchedRate: number; // should match Planning Sprint's own real 9/142 (6.3%)
  positionCorrectCount: number; // among gate-matched cases, both ordering checks true
  positionCorrectRate: number;
  avgActualBudgetAvailableMs: number; // among gate-matched cases -- how much of the nominal 2000ms MCM actually got, on average
  budgetStarvedCount: number; // gate-matched cases where actualBudgetAvailableMs < NOMINAL_MCM_BUDGET_MS (CCR's remainingTime contract ate into MCM's own slice)
  chosenCount: number; // gate-matched cases where chooseBestRecovery() actually picked MULTI_COMPONENT_MERGE
  contractMatchesPlanningGate: boolean;
}

const PLANNING_GATE_MATCHED_RATE = 9 / 142; // Integration Planning Sprint v1's own real COMPONENT_COUNT_GE3 coverage
const GATE_RATE_TOLERANCE = 0.001;

export function summarizeContractAudit(rows: readonly ContractAuditRow[]): ContractAuditSummary {
  const n = rows.length;
  const gateMatched = rows.filter((r) => r.gateMatched);
  const positionCorrect = gateMatched.filter((r) => r.ccrTerminalBeforeMcmStart === true && r.mcmStartBeforeParityStart === true);
  const withBudget = gateMatched.filter((r) => r.actualBudgetAvailableMs !== null);
  const avgActualBudgetAvailableMs = withBudget.length ? withBudget.reduce((s, r) => s + (r.actualBudgetAvailableMs ?? 0), 0) / withBudget.length : 0;
  const budgetStarved = withBudget.filter((r) => (r.actualBudgetAvailableMs ?? NOMINAL_MCM_BUDGET_MS) < NOMINAL_MCM_BUDGET_MS);
  const chosen = gateMatched.filter((r) => r.chosenType === "MULTI_COMPONENT_MERGE");
  const gateMatchedRate = n ? gateMatched.length / n : 0;

  return {
    n,
    gateMatchedCount: gateMatched.length,
    gateMatchedRate,
    positionCorrectCount: positionCorrect.length,
    positionCorrectRate: gateMatched.length ? positionCorrect.length / gateMatched.length : 0,
    avgActualBudgetAvailableMs,
    budgetStarvedCount: budgetStarved.length,
    chosenCount: chosen.length,
    contractMatchesPlanningGate: Math.abs(gateMatchedRate - PLANNING_GATE_MATCHED_RATE) < GATE_RATE_TOLERANCE,
  };
}
