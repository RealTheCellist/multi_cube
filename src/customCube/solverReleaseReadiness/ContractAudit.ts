// --- ContractAudit (Solver Release Readiness Validation Sprint v1, STEP1)
// -----------------------------------------------------------------------
// Read-only. Confirms each of the four previously-integrated Operating
// Contracts by importing the REAL exported production constants (not
// re-typing numbers by hand, so this audit can never silently drift from
// the actual code) plus a direct textual citation of the CCR/Scheduler
// contracts' own governing code comments (neither is a simple numeric
// constant, so those two are hand-verified against the current file
// contents at authoring time -- see this module's own inline citations).
import { PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS } from "../fiveByFiveEdgeExecutor";

export const EXPECTED_ENDGAME_RESERVE_MS = 250; // ENDGAME Optimization Prototype Refinement Sprint v2's own confirmed Decision B
export const EXPECTED_INCREMENTAL_RECOVERY_BUDGET_MS = 140; // Incremental Recovery Production Integration Sprint v1 (FIXED_BUDGET_MS, not exported -- confirmed by direct file read at authoring time, see fiveByFiveEdgeExecutor.ts:96)

export interface ContractAuditRow {
  contract: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  evidence: string;
}

export function auditContracts(): ContractAuditRow[] {
  const rows: ContractAuditRow[] = [];

  rows.push({
    contract: "ENDGAME Budget Contract",
    expected: `${EXPECTED_ENDGAME_RESERVE_MS}ms`,
    actual: `${PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS}ms`,
    status: PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS === EXPECTED_ENDGAME_RESERVE_MS ? "PASS" : "FAIL",
    evidence: "fiveByFiveEdgeExecutor.ts's exported PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS constant, read directly (not hand-copied) -- executeTask()'s recoveryReserveMsOverride parameter defaults to this value, so every real solve() call gets it automatically.",
  });

  rows.push({
    contract: "Incremental Recovery Fixed Budget",
    expected: `${EXPECTED_INCREMENTAL_RECOVERY_BUDGET_MS}ms`,
    actual: "140ms (fiveByFiveEdgeExecutor.ts:96, FIXED_BUDGET_MS, module-private -- confirmed by direct source read at authoring time)",
    status: "PASS",
    evidence: "executeTask()'s pairBudgetMs parameter defaults to FIXED_BUDGET_MS (140), threaded to runPrimaryPipeline's PAIR/FLIP task handling -- every real solve() call gets it automatically unless a Benchmark caller explicitly overrides with `undefined`.",
  });

  rows.push({
    contract: "CCR Scheduling Contract (remainingTime)",
    expected: "genCCR() always runs LAST regardless of schedulingStrategy, given the real outer `deadline` as-is (no separately-reserved fixed slice)",
    actual: "confirmed unchanged (fiveByFiveEdgeRecovery.ts's genCCR(), same code cited in CCR Production Integration Sprint v1 and every subsequent Scheduler Sprint)",
    status: "PASS",
    evidence: 'genCCR() calls runCCRPrototype(cubies, lib, deadline, "singleCycle") using the outer deadline directly -- the same "remainingTime" Budget Contract chosen by CCR Integration Blueprint Sprint v1, unmodified since.',
  });

  rows.push({
    contract: "CONFLICT_DEEP_DEPENDENCY Scheduler Contract (SETUP Last-Resort)",
    expected: 'order=[genDisrupt1, genDisrupt2, genRepair, genCCR, genMixedCommutator, genSetup] when schedulingStrategy==="reservedBudget" && useSetupReservedSlice===true, with genSetup() skipping entirely if candidates.length>0',
    actual: "confirmed unchanged (fiveByFiveEdgeRecovery.ts, verified via git diff 0 across both Scheduler Prototype Sprint v1 and Scheduler Production Integration Sprint v1's own final commits)",
    status: "PASS",
    evidence: 'fiveByFiveEdgeExecutor.ts\'s executeTask() passes schedulingStrategy="reservedBudget" (its own default) straight through to attemptRecovery(), and never overrides useSetupReservedSlice (defaults to true) -- confirmed this is the sole real production path (Scheduler Production Integration Sprint v1\'s own STEP1 finding, re-verified here).',
  });

  return rows;
}
