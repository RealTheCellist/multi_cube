// --- BudgetArchitectureReview (Incremental Recovery Architecture Blueprint
// Revision Sprint v1) ------------------------------------------------------
// STEP2. Reviews the current Budget model landscape across BOTH prior
// Sprints' own real measurements (not re-run here -- this Sprint is
// analysis-only). Maps the work order's 5 named models onto the specific
// policies each Sprint already measured:
//   Reserved Slice        <- reservedSlice (Blueprint Sprint v1 STEP3, Prototype/Refinement Sprints)
//   Remaining Time         <- remainingTime (Blueprint Sprint v1 STEP3)
//   Adaptive Budget        <- adaptiveSlice (Blueprint Sprint v1 STEP3)
//   Average Budget         <- softDeadline (Prototype Refinement Sprint v1 STEP1 -- budgets for the REAL observed average, ~140ms, instead of an aspirational cap)
//   Deadline-aware Traversal <- budgetAwareTraversal (Prototype Refinement Sprint v1 STEP1 -- truncates the node list to fit the budget)
export interface BudgetModelReview {
  model: string;
  theoreticalCeilingMs: number | "unbounded"; // the policy's own INTENDED cap
  realAverageMs: number; // actually measured average usage, cited from the Sprint that measured it
  successRate: number; // cited success rate on the same measurement
  granularityImpact: string; // how much the Primitive/Production-layer coarse deadline-check granularity distorts this model's own promise
  productionChangeRequired: boolean;
  source: string;
}

export const BUDGET_MODEL_REVIEWS: BudgetModelReview[] = [
  {
    model: "Reserved Slice",
    theoreticalCeilingMs: 40,
    realAverageMs: 140.7,
    successRate: 0.028,
    granularityImpact:
      "Overrun factor ~3.5-4.5x across every Sprint that measured it (Blueprint 31.3ms->140.7ms; Prototype Refinement 32.1-32.6ms->96.6-137.9ms) -- the SMALLEST nominal cap, so it suffers the LARGEST relative distortion: almost any single hop blows through it entirely.",
    productionChangeRequired: false,
    source: "Blueprint Sprint v1 STEP3 (n=1193); Prototype Refinement Sprint v1 STEP1 (n=200)",
  },
  {
    model: "Remaining Time",
    theoreticalCeilingMs: "unbounded", // uses whatever's left of the outer solve() deadline, no fixed cap
    realAverageMs: 335.8,
    successRate: 0.157,
    granularityImpact:
      "Best real success rate of any policy measured in this whole research arc (15.7%), precisely BECAUSE its generous, uncapped budget absorbs the granularity overrun almost for free -- the search simply gets to run close to its own natural completion. The tradeoff (never adopted for Incremental Recovery) is that it can consume the ENTIRE remaining plan budget on a single PAIR task, starving every later task -- unsafe as a per-attempt policy in a multi-task loop.",
    productionChangeRequired: false,
    source: "Blueprint Sprint v1 STEP3 (n=1193)",
  },
  {
    model: "Adaptive Budget",
    theoreticalCeilingMs: 35.3, // Blueprint's own avg target for adaptiveSlice (remaining / tasksRemainingAfter+1)
    realAverageMs: 155.7,
    successRate: 0.023,
    granularityImpact: "Similar small nominal cap to Reserved Slice (fair-share division of remaining time), so it inherits the same severe relative overrun (~4.4x) and the worst success rate measured (2.3%) -- fairness across tasks doesn't help if the per-task allotment is already too small to survive one hop's own granularity gap.",
    productionChangeRequired: false,
    source: "Blueprint Sprint v1 STEP3 (n=1193)",
  },
  {
    model: "Average Budget",
    theoreticalCeilingMs: 140, // softDeadline's own target -- explicitly budgets for the REAL observed average instead of an aspiration
    realAverageMs: 196.6, // Prototype Refinement Sprint v1's own re-measurement (n=200) -- close in spirit to Blueprint's 140.7ms observation, still overruns further
    successRate: 0.055,
    granularityImpact:
      "Explicitly designed to absorb the KNOWN average overrun rather than fight it, yet STILL overran further in practice (196.6ms real vs 140ms target, a residual ~1.4x) -- confirming the overrun distribution has a heavy tail (max single-hop 1003ms observed) that no single fixed target, however well-calibrated to the mean, can fully contain.",
    productionChangeRequired: false,
    source: "Prototype Refinement Sprint v1 STEP1 (n=200)",
  },
  {
    model: "Deadline-aware Traversal",
    theoreticalCeilingMs: 32.1, // budgetAwareTraversal keeps the 40ms nominal cap, truncates the node list instead
    realAverageMs: 96.6,
    successRate: 0.04,
    granularityImpact:
      "The only policy that attacks the PROBLEM SHAPE (how many hops are attempted) rather than just the deadline VALUE -- reduced overrun rate from 80.0% to 54.5% (a real, measured 31.9% reduction), the best of the 4 policies actually tested, but still leaves the majority of attempts overrunning because each individual hop's own enumerateWingCandidates() call still has no internal time check regardless of how few hops are attempted.",
    productionChangeRequired: false,
    source: "Prototype Refinement Sprint v1 STEP1 (n=200)",
  },
];

export interface BudgetArchitectureConclusion {
  bestWrapperOnlyModel: string;
  wrapperOnlyCeiling: string;
  productionChangeNeededForFullFix: boolean;
}

export function concludeBudgetArchitecture(): BudgetArchitectureConclusion {
  return {
    bestWrapperOnlyModel: "Deadline-aware Traversal (budgetAwareTraversal) for safety-bounded use, or Remaining Time for maximum raw success rate where an unbounded single-task budget is acceptable",
    wrapperOnlyCeiling:
      "No Wrapper-only model achieved BOTH a safe, bounded per-attempt cost AND a success rate close to Remaining Time's own 15.7% ceiling -- every SAFE (capped) policy tested tops out around 4-5.5% success, while the only policy reaching double-digit success rate (Remaining Time, 15.7%) is unsafe for a multi-task loop by design.",
    productionChangeNeededForFullFix:
      true /* every model's own granularityImpact traces back to the same two Primitive/Production-layer root causes identified in BottleneckAttribution.ts -- a Wrapper-only fix has a real, measured, but bounded ceiling */,
  };
}
