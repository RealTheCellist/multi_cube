// --- BudgetAllocationBlueprint (ENDGAME Optimization Blueprint Sprint v1,
// STEP1) ----------------------------------------------------------------------
// DESIGN ONLY -- no Production code changes. Compares 4 Budget Allocation
// strategies for ENDGAME using REAL, already-measured numbers from this
// whole research arc (Bottleneck Attribution Refinement Sprint v1's own
// Saturation Curve, n=255 real Reachable snapshots) plus a real,
// previously-unstated architecture fact confirmed by direct source
// inspection of fiveByFiveEdgeExecutor.ts:
//
//   ENDGAME's real primaryDeadline = deadline - RECOVERY_RESERVE_MS, where
//   RECOVERY_RESERVE_MS = RECOVERY_GEN_BUDGET_MS(300) +
//   MAX_RECOVERY_RETRIES(1) * RECOVERY_RETRY_BUDGET_MS(150) = 450ms.
//   ENDGAME today ALREADY effectively uses a "Remaining-Time" policy (its
//   own deadline argument passed to bestFixOverall/tryEndgameMultiPly IS
//   the outer deadline, not a separately-sized fixed slice) -- but that
//   remaining time is reduced by this EXISTING 450ms Recovery reservation
//   BEFORE ENDGAME ever gets a turn, on top of whatever PAIR/FLIP/PARITY
//   tasks ahead of it in the queue already consumed. This is why real
//   Reachable snapshots cluster toward the LOW end of the Saturation Curve
//   (120-500ms) rather than the high end (1000ms+/unlimited) where the
//   real capability payoff actually is.
export const RECOVERY_RESERVE_MS_TODAY = 450; // RECOVERY_GEN_BUDGET_MS(300) + MAX_RECOVERY_RETRIES(1)*RECOVERY_RETRY_BUDGET_MS(150), cited from fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts's own real constants

// Bottleneck Attribution Refinement Sprint v1's own real Saturation Curve
// (n=255 real Reachable snapshots, full 335-snapshot population) -- cited
// verbatim, no new benchmark run needed for this Blueprint Sprint.
export const REAL_SATURATION_CURVE = [
  { budgetMs: 120, avgImprovement: 0.259 },
  { budgetMs: 250, avgImprovement: 0.545 },
  { budgetMs: 500, avgImprovement: 0.694 },
  { budgetMs: 1000, avgImprovement: 0.89 },
  { budgetMs: 5000, avgImprovement: 2.71 },
] as const;

export type BudgetStrategyId = "fixed" | "remainingTime" | "adaptive" | "reservedSlice";

export interface BudgetStrategyRow {
  id: BudgetStrategyId;
  name: string;
  description: string;
  expectedImprovementAtRealisticBudget: number; // interpolated/cited from REAL_SATURATION_CURVE at this strategy's own realistic real-world budget
  pros: string[];
  cons: string[];
}

export const BUDGET_STRATEGIES: BudgetStrategyRow[] = [
  {
    id: "fixed",
    name: "A. Fixed Budget (250/500/1000ms)",
    description:
      "ENDGAME gets a fixed slice regardless of queue position, carved out the same way RECOVERY_RESERVE_MS already is today (reserve N ms off the end of the outer deadline, unconditionally).",
    expectedImprovementAtRealisticBudget: 0.694, // cites the 500ms real data point as the representative fixed candidate
    pros: [
      "Predictable, easy to reason about and test (same pattern as the EXISTING RECOVERY_RESERVE_MS mechanism -- zero new architecture concept)",
      "Directly targets the confirmed 87% bottleneck with a guaranteed floor, independent of how much PAIR/FLIP/PARITY consumed",
    ],
    cons: [
      "Wastes budget on already-easy snapshots that would have finished well under the fixed floor",
      "A too-large fixed slice risks starving PAIR/FLIP/PARITY tasks earlier in the queue on hard scrambles",
    ],
  },
  {
    id: "remainingTime",
    name: "B. Remaining-Time (today's status quo)",
    description:
      "ENDGAME's own primaryDeadline is simply whatever's left of the outer deadline (minus the existing 450ms RECOVERY_RESERVE_MS) -- the REAL current production behavior, confirmed by direct source inspection.",
    expectedImprovementAtRealisticBudget: 0.259, // cites the 120ms data point -- real Reachable snapshots typically land here today
    pros: ["Zero implementation cost -- this is what Production already does", "Never starves earlier tasks by design"],
    cons: [
      "Confirmed by this whole Sprint's own real measurement to be the WORST-performing point on the Saturation Curve in practice -- real snapshots cluster at the low end where marginal capability is lowest",
      "No guaranteed floor -- a hard scramble that eats the whole budget before ENDGAME's turn leaves it with near-zero time",
    ],
  },
  {
    id: "adaptive",
    name: "C. Adaptive Budget",
    description:
      "Size ENDGAME's slice dynamically from real-time signals (queue progress, wrongWingCount trajectory, PAIR/FLIP/PARITY's own realized runtime so far) -- e.g. give ENDGAME MORE when the queue finished early, less when it's already tight.",
    expectedImprovementAtRealisticBudget: 0.545, // interpolated between the 120/250 points as a conservative estimate given real-world variance in queue timing
    pros: [
      "Best theoretical capability-per-ms tradeoff -- adapts to the ACTUAL remaining slack rather than a one-size-fits-all number",
      "Could reclaim the RECOVERY_RESERVE_MS's own often-unused slack for ENDGAME specifically on snapshots where Recovery ends up not needed",
    ],
    cons: [
      "Highest implementation complexity and highest Regression risk of the 4 candidates -- introduces new decision logic, new failure modes, needs its own dedicated validation Sprint",
      "Timing-jitter-sensitive by construction (the same class of bug this whole research arc has repeatedly had to fix in Planner v2's own determinism guarantee)",
    ],
  },
  {
    id: "reservedSlice",
    name: "D. Reserved Slice (ENDGAME_RESERVE_MS, mirroring RECOVERY_RESERVE_MS's own existing pattern)",
    description:
      "Carve out a dedicated ENDGAME_RESERVE_MS off the END of the outer deadline -- the EXACT same mechanism RECOVERY_RESERVE_MS already uses (Math.max(Date.now(), deadline - RESERVE_MS)) -- guaranteeing ENDGAME a minimum floor even when PAIR/FLIP/PARITY would otherwise consume the whole budget.",
    expectedImprovementAtRealisticBudget: 0.694, // targets the 500ms point, sized to roughly match or modestly exceed today's existing RECOVERY_RESERVE_MS (450ms)
    pros: [
      "Reuses an ALREADY-EXISTING, already-proven Production pattern (RECOVERY_RESERVE_MS) -- lowest new-concept risk of any candidate that actually beats the status quo",
      "Directly, concretely targets this Sprint's own confirmed root cause: ENDGAME's real remaining time is squeezed by the existing Recovery reservation before it even starts",
    ],
    cons: [
      "Still a fixed number under the hood -- doesn't adapt to genuinely easy vs hard snapshots the way Adaptive would",
      "Interacts with RECOVERY_RESERVE_MS -- needs an explicit decision on whether the two reservations stack (reducing PAIR/FLIP/PARITY's own share further) or whether ENDGAME_RESERVE_MS should partially REPLACE/absorb the existing Recovery reservation (see STEP5)",
    ],
  },
];
