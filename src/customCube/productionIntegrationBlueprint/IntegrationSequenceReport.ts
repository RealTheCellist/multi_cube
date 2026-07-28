// --- IntegrationSequenceReport (Production Integration Blueprint Sprint
// v1, Required Analysis #1, Deliverable #2 "Recovery Architecture") ---------
// Direct, disclosed transcription of fiveByFiveEdgeRecovery.ts's ACTUAL
// generateRecoveryStrategies() (read-only -- this file is never modified
// this Sprint), not a re-derived or assumed description:
//   - genDeadline = min(outer deadline, now + RECOVERY_GEN_BUDGET_MS=300)
//   - Production default order ("reservedBudget"): genDisrupt1,
//     genDisrupt2, genSetup, genRepair, genCCR -- all but REPAIR/CCR
//     share genDeadline via `slice() = max(5, floor((genDeadline-now)/4))`.
//   - genRepair (reservedBudget): NEVER gated by genDeadline -- always
//     attempted, using its OWN fresh REPAIR_RESERVED_SLICE_MS=75ms window
//     measured off the OUTER deadline (protected from DISRUPT/SETUP
//     starvation, per Integration Prototype/Validation Sprint v1's own
//     finding: DISRUPT/SETUP alone can consume 245-481ms of the nominal
//     300ms genDeadline on Gate-matching snapshots).
//   - genCCR: ALWAYS generated last, given the REAL outer `deadline`
//     directly (no reserved slice, no genDeadline gate at all) --
//     "remainingTime" budget contract.
//   - Selection: chooseBestRecovery() picks the MAX-`score` candidate
//     among whatever got generated -- generation ORDER only affects how
//     much wall-clock time each step gets (shared-deadline consumption),
//     NOT which candidate wins once generated (that is pure score
//     comparison).
export interface SequenceStep {
  step: string;
  candidateType: string;
  budgetSource: "shared genDeadline (1/4 slice)" | "reserved slice off outer deadline" | "remaining outer deadline" | "proposed";
  gatedByGenDeadline: boolean;
  notes: string;
}

export function describeCurrentSequence(): SequenceStep[] {
  return [
    { step: "1", candidateType: "DISRUPT (narrow)", budgetSource: "shared genDeadline (1/4 slice)", gatedByGenDeadline: true, notes: "tryEndgameThroughDisruption(depth=1, recursion=0)" },
    { step: "2", candidateType: "DISRUPT (wide)", budgetSource: "shared genDeadline (1/4 slice)", gatedByGenDeadline: true, notes: "tryEndgameThroughDisruption(depth=3, recursion=1)" },
    { step: "3", candidateType: "SETUP", budgetSource: "shared genDeadline (1/4 slice)", gatedByGenDeadline: true, notes: "tryEndgameMultiPly" },
    { step: "4", candidateType: "REPAIR", budgetSource: "reserved slice off outer deadline", gatedByGenDeadline: false, notes: "runSuccessV2(W2_widerHop), REPAIR_RESERVED_SLICE_MS=75ms, production default (reservedBudget scheduling)" },
    { step: "5", candidateType: "CCR", budgetSource: "remaining outer deadline", gatedByGenDeadline: false, notes: "runCCRPrototype(cubies, lib, deadline, \"singleCycle\") -- always last, unconditional" },
  ];
}

/**
 * The proposed insertion point for Mixed Commutator, added as step 6
 * (after CCR) -- NOT because ordering determines the winner (selection is
 * pure max-score via chooseBestRecovery), but because this is the position
 * that requires the LEAST structural change: CCR's own step already
 * establishes the "always attempted, given a slice of remaining budget,
 * no genDeadline gate" pattern this Sprint's own Budget Allocation
 * analysis (see BudgetAllocationSweep.ts) recommends reusing, rather than
 * REPAIR's fixed-size reserved-slice pattern (Mixed Commutator's own
 * measured runtime distribution differs from REPAIR's).
 */
export function describeProposedSequence(): SequenceStep[] {
  return [
    ...describeCurrentSequence(),
    {
      step: "6",
      candidateType: "MixedCommutator (proposed)",
      budgetSource: "proposed",
      gatedByGenDeadline: false,
      notes:
        "tryMixedCommutatorPrototype(cubies, lib, deadline) -- proposed as a reserved slice off the OUTER deadline (like REPAIR), sized per BudgetAllocationSweep's own measured dose-response curve, generated LAST (after CCR) so it never displaces existing candidates' own budget.",
    },
  ];
}
