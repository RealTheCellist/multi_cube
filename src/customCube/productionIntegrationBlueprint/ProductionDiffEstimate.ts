// --- ProductionDiffEstimate (Production Integration Blueprint Sprint v1,
// Required Analysis #4) ---------------------------------------------------
// Disclosed LOC/risk estimate, based on DIRECTLY READING (not modifying)
// fiveByFiveEdgeRecovery.ts's own comparable integration precedents:
// genCCR() is 6 lines (its own generation function), the CCR import line
// is 1 line, its `order` array entry is 1 token, and its RecoveryType
// union member is 1 token in fiveByFiveEdgeSolverTypes.ts -- CCR's own
// FULL Production Integration Sprint v1 touched exactly this shape of
// change per this Sprint's own direct source read. genRepair() is larger
// (~25 lines) because it implements the reservedBudget A/B scheduling
// logic; a MixedCommutator step reusing the SAME "always attempted,
// remaining-outer-deadline" pattern CCR already uses would be CCR-sized,
// not REPAIR-sized.
export interface FileDiffEstimate {
  file: string;
  functionsToAdd: string[];
  functionsToModify: string[];
  estimatedLOC: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  rationale: string;
}

export function estimateProductionDiff(): FileDiffEstimate[] {
  return [
    {
      file: "fiveByFiveEdgeRecovery.ts",
      functionsToAdd: ["genMixedCommutator() -- new, mirrors genCCR()'s exact shape"],
      functionsToModify: ["generateRecoveryStrategies() -- add 1 import line, 1 new parameter (includeMixedCommutator=true, mirrors includeCCR's own pattern), 1 new step appended to the `order` array"],
      estimatedLOC: 10,
      riskLevel: "LOW",
      rationale: "CCR's own integration (this Sprint's own direct source read) is the closest real precedent: import line + a ~6-line gen function + one array-entry addition. No change to genDeadline/slice()/REPAIR's reservedBudget logic -- MixedCommutator's step is purely additive, appended after genCCR(), never altering existing candidates' own budget arithmetic.",
    },
    {
      file: "fiveByFiveEdgeSolverTypes.ts",
      functionsToAdd: [],
      functionsToModify: ["RecoveryType union -- add \"MixedCommutator\" as a 5th member (currently \"DISRUPT\" | \"SETUP\" | \"REPAIR\" | \"CCR\")"],
      estimatedLOC: 1,
      riskLevel: "LOW",
      rationale: "A pure additive union-type widening -- every existing exhaustive switch/consumer of RecoveryType (if any) would need a TypeScript compiler check to confirm no non-exhaustive-match errors; none were found reading the type's only consumer sites in fiveByFiveEdgeRecovery.ts itself (type is only ever constructed via the `add()` helper's first argument, never pattern-matched exhaustively).",
    },
    {
      file: "fiveByFiveEdgePlanner.ts",
      functionsToAdd: [],
      functionsToModify: [],
      estimatedLOC: 0,
      riskLevel: "LOW",
      rationale: "Confirmed by direct read-only inspection this Sprint: the Planner never references RecoveryType/RecoveryStrategy or generateRecoveryStrategies() directly -- it operates one layer above Recovery entirely. No change required, matching the Directive's own explicit prohibition.",
    },
    {
      file: "fiveByFiveEdgeExecutor.ts",
      functionsToAdd: [],
      functionsToModify: [],
      estimatedLOC: 0,
      riskLevel: "LOW",
      rationale: "Confirmed by direct read-only inspection (also noted in this Sprint's own IntegrationSequenceReport comments, carried over from CCR Production Integration Sprint v1's own finding): executeTask() calls attemptRecovery()/generateRecoveryStrategies() without ever passing the new trailing parameter, so a new includeMixedCommutator=true default requires ZERO Executor changes -- the exact same mechanism CCR's own integration already relied on.",
    },
  ];
}
