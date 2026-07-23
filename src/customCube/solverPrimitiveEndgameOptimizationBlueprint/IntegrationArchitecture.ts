// --- IntegrationArchitecture (ENDGAME Optimization Blueprint Sprint v1,
// STEP5) ----------------------------------------------------------------------
// DESIGN ONLY -- no implementation. Compares 4 candidate integration points
// for delivering a Reserved-Slice-style Budget Contract to ENDGAME (STEP1's
// own leading candidate), each grounded in the REAL current architecture.
export type IntegrationPointId = "executor" | "recovery" | "taskLayer" | "primitiveLayer";

export interface IntegrationPointRow {
  id: IntegrationPointId;
  name: string;
  realMechanism: string;
  changeScope: string;
  risk: "low" | "medium" | "high";
  regressionPotential: string;
}

export const INTEGRATION_POINTS: IntegrationPointRow[] = [
  {
    id: "executor",
    name: "Executor (fiveByFiveEdgeExecutor.ts's executeTask/runPrimaryPipeline)",
    realMechanism:
      "RECOVERY_RESERVE_MS is ALREADY implemented exactly this way: `const primaryDeadline = recoveryEligible ? Math.max(Date.now(), deadline - RECOVERY_RESERVE_MS) : deadline;`. An ENDGAME_RESERVE_MS could be added as a directly analogous computation inside runPrimaryPipeline's own ENDGAME branch, reusing the EXACT SAME `Math.max(Date.now(), deadline - RESERVE_MS)` pattern already proven in production.",
    changeScope: "1 file, 1 new constant, ~2-3 lines inside the existing ENDGAME branch -- the smallest and most precedented of the 4 candidates.",
    risk: "low",
    regressionPotential: "Directly interacts with the EXISTING RECOVERY_RESERVE_MS (see STEP1/3's own stack-vs-absorb question) -- the only real regression surface, and one this Sprint's own STEP6 Runtime Contract must resolve explicitly, not one introduced by NEW mechanism risk.",
  },
  {
    id: "recovery",
    name: "Recovery (fiveByFiveEdgeRecovery.ts -- shrink RECOVERY_RESERVE_MS itself)",
    realMechanism:
      "Rather than adding a NEW reservation, reduce RECOVERY_GEN_BUDGET_MS(300)/RECOVERY_RETRY_BUDGET_MS(150) so less of the outer deadline is reserved for Recovery, implicitly leaving more for ENDGAME's own primaryDeadline (no new constant needed).",
    changeScope: "1 file, 2 existing constants tuned -- but Recovery's own generation/retry budgets were themselves tuned by 3 prior Sprints in this research arc (Integration Prototype/Refinement/Validation) against real measured Generation Starvation data; shrinking them risks reopening a problem those Sprints already fixed.",
    risk: "medium",
    regressionPotential: "Directly risks reintroducing Generation Starvation (Integration Refinement Sprint v1's own real finding: DISRUPT/SETUP alone consumed 245-481ms against the 300ms genDeadline on Gate-matching snapshots) -- a REAL, previously-measured regression this Sprint would need to re-verify, not just assume away.",
  },
  {
    id: "taskLayer",
    name: "Task Layer (fiveByFiveEdgePlanner.ts -- reorder the queue so ENDGAME isn't always last)",
    realMechanism:
      "planEdgeTasks() always appends ENDGAME (and PARITY/LAST_TWO) at the END of every candidate strategy's goal list (`[...goals, LAST_TWO, ENDGAME]`) -- moving it earlier would change WHEN it's attempted relative to PAIR/FLIP tasks, giving it more of the raw remaining time without touching any reservation constant.",
    changeScope: "1 file (Planner), but changes the FUNDAMENTAL task-ordering contract every other Sprint in this whole research arc has treated as fixed -- the largest conceptual change of the 4 candidates, even though the line-level diff might be small.",
    risk: "high",
    regressionPotential: "PAIR/FLIP tasks fixing individual slots are cheap, high-value, and currently guaranteed to run before ENDGAME's expensive residual grinder -- reordering risks ENDGAME consuming budget that would otherwise have resolved several EASY PAIR slots first, a capability trade this Sprint has no real data to evaluate (Bottleneck Attribution Refinement Sprint v1's own counterfactuals only tested reaching ENDGAME sooner via deadline extension, never via reordering PAIR/FLIP after it).",
  },
  {
    id: "primitiveLayer",
    name: "Primitive Layer (fiveByFiveEdges.ts's bestFixOverall/tryEndgameMultiPly themselves)",
    realMechanism:
      "Add budget-awareness DIRECTLY inside these functions (mirroring the Traversal Interruptibility precedent already added to bfsMoveWingToPosition/tryFixWing in two prior Sprints) -- e.g. a self-managed internal sub-budget independent of what the Executor passes in.",
    changeScope: "2+ functions in the single most heavily-reused, most-called-from file in the whole project (22+ callers of related functions elsewhere) -- the widest blast radius of the 4 candidates.",
    risk: "high",
    regressionPotential: "This Sprint's own protected-file list marks fiveByFiveEdges.ts read-only for THIS Sprint specifically because it's Blueprint/design-only -- but even in a follow-on Prototype Sprint, any change here risks the exact class of scope creep the Traversal Interruptibility work explicitly and deliberately avoided (minimal-footprint discipline, only 3 symbols exported). Not recommended as the FIRST integration point to try.",
  },
];
