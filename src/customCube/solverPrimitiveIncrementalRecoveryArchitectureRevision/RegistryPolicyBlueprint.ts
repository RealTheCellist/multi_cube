// --- RegistryPolicyBlueprint (Incremental Recovery Architecture Blueprint
// Revision Sprint v1) ------------------------------------------------------
// STEP3. Designs candidates to replace the current binary "Visited ->
// Skip" registry policy (Prototype Refinement Sprint v1's own
// useVisitedRegistry flag). No new Prototype is implemented this Sprint --
// every number below is a REASONED ESTIMATE grounded in the real baseline
// (Prototype Refinement Sprint v1 STEP4: 129 real Duplicate Invocations
// without any registry, 100% eliminated by the binary registry, but at the
// cost of 6 real regressions), explicitly disclosed as projection, not
// measurement. Actually testing these requires a real Prototype Sprint.
export type RegistryPolicyId = "binarySkip" | "retryBudget" | "maxAttemptN" | "confidenceScore" | "agingRegistry";

export interface RegistryPolicyDesign {
  policy: RegistryPolicyId;
  description: string;
  expectedDuplicateReduction: string; // qualitative + rough estimate, disclosed as a projection
  expectedRegressionRisk: string;
  implementationDifficulty: "low" | "medium" | "high";
  rationale: string;
}

export const REGISTRY_POLICY_DESIGNS: RegistryPolicyDesign[] = [
  {
    policy: "binarySkip",
    description: "CURRENT baseline (Prototype Refinement Sprint v1): first attempt on a state proceeds, every later attempt on the identical state within the same solve is skipped unconditionally.",
    expectedDuplicateReduction: "100% (measured: 129 -> 0)",
    expectedRegressionRisk: "6 real regressions measured -- every skipped retry forecloses that retry's own independent chance of success, with no mechanism to tell in advance which skips would have mattered.",
    implementationDifficulty: "low",
    rationale: "Already implemented and measured this Sprint arc -- included here only as the comparison baseline for the 4 candidates below.",
  },
  {
    policy: "retryBudget",
    description:
      "Every distinct state gets a SHARED time budget across all its attempts within one solve (e.g. the first attempt's own reservedSlice/budgetAwareTraversal allocation, then any later attempt on the same state draws from what's left of that SAME pool rather than getting a fresh allocation).",
    expectedDuplicateReduction:
      "Estimated 40-60% reduction in wasted SEARCH TIME on duplicates (not necessarily invocation COUNT -- the invocation still happens, but with a shrinking budget each time, so later retries on a stubborn state cost less and less) -- a rough projection based on this Sprint's own Budget Architecture Review finding that success correlates more with search TIME available than with raw invocation count.",
    expectedRegressionRisk: "Lower than binarySkip -- every retry still gets SOME chance (unlike an outright skip), so any of the 6 regression cases that needed just one more real attempt would likely still succeed, at the cost of a smaller time slice for it.",
    implementationDifficulty: "medium",
    rationale: "Directly targets binarySkip's own failure mode (an all-or-nothing gate) without touching the underlying search algorithm -- a pure Wrapper-level change (a shared counter per state hash instead of a boolean), buildable without any Production or Primitive code change.",
  },
  {
    policy: "maxAttemptN",
    description: "Cap retries per distinct state at a fixed N (e.g. N=2 or N=3) within one solve, instead of N=1 (binarySkip) or unbounded (no registry at all).",
    expectedDuplicateReduction:
      "Estimated 60-80% reduction at N=2 (assuming most duplicate states are hit only 2-3 times total per solve -- consistent with this population's own real avg PAIR-task count of ~11-12 per solve and Blueprint Sprint v1's own finding that repeated failures cluster rather than spread evenly) -- a projection, not a measurement; the EXACT reduction depends on the real per-state hit-count distribution, which this Sprint did not separately capture.",
    expectedRegressionRisk:
      "Likely close to 0 at N=2, since binarySkip's own 6 regressions would need the SECOND attempt specifically to succeed (N=1 already gets the first) -- if any regression required a THIRD+ attempt, N=2 would not recover it. Cheapest, most directly falsifiable of the 4 candidates -- a real Prototype Sprint could measure exactly how many of the 6 are recovered at N=2 vs N=3.",
    implementationDifficulty: "low",
    rationale: "Simplest possible generalization of the existing Set<number> visited registry (a Map<number, number> counting hits instead of a boolean) -- lowest implementation risk of the 4 candidates, and the most directly comparable to the already-real binarySkip baseline.",
  },
  {
    policy: "confidenceScore",
    description:
      "Score each candidate re-attempt using cheap, already-available signals (e.g. remaining time budget, cycle length, whether the OTHER Gate -- REPAIR vs CCR -- has since become eligible on this state) and only retry above a threshold score.",
    expectedDuplicateReduction: "Estimated 50-70%, but highly threshold-dependent and NOT independently validated this Sprint -- the biggest unknown of the 4 candidates, since choosing a good threshold requires empirical tuning this Sprint's own analysis-only scope forbids.",
    expectedRegressionRisk: "Potentially the LOWEST of the 4 if the scoring signal is genuinely predictive -- but also the ONLY candidate whose regression risk could be HIGHER than maxAttemptN if the score is a poor predictor (a badly-tuned threshold could reject retries binarySkip's own data shows would have succeeded).",
    implementationDifficulty: "high",
    rationale: "Requires designing and validating a new scoring function -- the closest thing to new Primitive-adjacent logic among the 4 candidates, and the hardest to validate without a dedicated Prototype Sprint of its own.",
  },
  {
    policy: "agingRegistry",
    description: "A visited-state entry expires after a fixed number of subsequent PAIR tasks have been processed (e.g. 3 tasks later, the state is treated as unseen again), on the theory that enough intervening changes may have altered the surrounding context even if this exact state recurs.",
    expectedDuplicateReduction: "Estimated 30-50% -- lower than maxAttemptN, since a state that recurs WITHIN the aging window is still skipped exactly as under binarySkip; only recurrences AFTER the window benefit.",
    expectedRegressionRisk: "Similar to maxAttemptN's own risk profile for short aging windows, converging toward binarySkip's own 6-regression risk as the window grows longer (a very long window is nearly identical to never expiring).",
    implementationDifficulty: "medium",
    rationale: "Conceptually appealing (an old visit shouldn't count forever) but empirically redundant with maxAttemptN for THIS specific solve structure -- a solve has at most ~12 PAIR tasks total, so an aging window meaningfully shorter than that is nearly equivalent to a low N, while a longer window approaches never-expiring.",
  },
];

export interface RegistryPolicyRecommendation {
  recommended: RegistryPolicyId;
  reasoning: string;
}

export function recommendRegistryPolicy(): RegistryPolicyRecommendation {
  return {
    recommended: "maxAttemptN",
    reasoning:
      "Lowest implementation difficulty of the 3 non-baseline candidates with real Wrapper-level feasibility (retryBudget and maxAttemptN both qualify; confidenceScore and agingRegistry carry higher risk or redundancy), AND the most directly falsifiable against the already-real 6-regression baseline (a real Prototype Sprint could test N=2/N=3 and report the EXACT recovered-regression count, rather than relying on this Sprint's own estimate). retryBudget is a reasonable secondary candidate if maxAttemptN's own real-measured duplicate reduction proves insufficient.",
  };
}
