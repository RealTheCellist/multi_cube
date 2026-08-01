// --- MeasurementPathAudit (Multi-Component Merge Validation Methodology
// Qualification Sprint v1, STEP1) ---------------------------------------------
// Measurement Coverage Matrix: every measurement path this whole MCM
// research arc has actually used, with the REAL parameters/contracts each
// one exercises. This is a synthesis of already-established, verified facts
// from this arc's own prior Sprints (each cited by name) -- not a new
// execution, since the question ("what does each METHOD measure") is a
// structural property of the code, not something a fresh replay would
// reveal differently. STEP2/STEP3 below re-verify the load-bearing claims
// (Budget Envelope, Sensitivity) with real execution.
export type MeasurementPath = "attemptRecovery_direct" | "generateRecoveryStrategies_direct" | "solve_e2e" | "hole_dataset_replay" | "counterfactual_replay";

export interface MeasurementPathRow {
  path: MeasurementPath;
  describedAs: string;
  contractMeasured: string; // what real production Contract this path actually exercises
  budgetCondition: string; // what outer/dedicated budget MCM receives under this path
  primitivesIncluded: string; // which Recovery candidates compete alongside MCM
  usedInSprints: string[]; // this arc's own prior Sprints that used this exact path
  knownLimitation: string; // disclosed gap this path cannot observe
}

export const MEASUREMENT_COVERAGE_MATRIX: MeasurementPathRow[] = [
  {
    path: "attemptRecovery_direct",
    describedAs: "Calls fiveByFiveEdgeRecovery.ts's own attemptRecovery() directly with an explicit outer `deadline` argument, bypassing solve()'s own PLAN_TIME_BUDGET_MS/recoveryReserveMsOverride mechanics entirely.",
    contractMeasured: "The Recovery layer's own internal scheduling/short-circuit contract in isolation -- whatever `deadline` the caller passes IS MCM's effective ceiling (via Math.min against MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS=2000ms), with no upstream PAIR/FLIP/PARITY/ENDGAME-primary-pipeline competition for that same clock.",
    budgetCondition: "Caller-controlled outer deadline (1000/1500/2000/60000ms all directly testable, real existing parameter, no production change needed).",
    primitivesIncluded: "All of DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR/PARITY_GATED_CYCLE/MULTI_COMPONENT_MERGE, same real production order (AFTER_CCR default).",
    usedInSprints: ["Multi-Component Merge Production Integration Sprint v1", "Refinement Sprint v1/v2/v3", "Short-Circuit Production Integration Sprint v1 (STEP2/3)"],
    knownLimitation: "Never exercises the primary (non-Recovery) pipeline's own real consumption of the SAME outer deadline before Recovery gets triggered -- in real solve(), PAIR/FLIP/PARITY/ENDGAME's own primary attempt already consumes part of the 1000ms before Recovery is even invoked; this path assumes Recovery starts at t=0 with the FULL outer deadline available, which is NOT how real production solve() behaves.",
  },
  {
    path: "generateRecoveryStrategies_direct",
    describedAs: "Calls generateRecoveryStrategies() directly (one level below attemptRecovery(), which normally wraps it in a scratch-clone retry loop), passing an explicit onEvent instrumentation hook.",
    contractMeasured: "Same Recovery Contract as attemptRecovery_direct, but WITHOUT attemptRecovery()'s own retry-loop/short-circuit dispatch layer -- isolates pure candidate GENERATION (offered/chosen/scored), not the eventual accept/discard decision the short-circuit bug lived in.",
    budgetCondition: "Same caller-controlled outer deadline as attemptRecovery_direct.",
    primitivesIncluded: "Same 7 types as attemptRecovery_direct.",
    usedInSprints: ["Refinement Sprint v3 (CompetitionTimeline.ts, onEvent-based per-candidate timeline)"],
    knownLimitation: "Only this path exposes onEvent -- attemptRecovery() itself passes `undefined` for onEvent when it calls generateRecoveryStrategies() internally (fiveByFiveEdgeRecovery.ts's own source), so no REAL production caller (including solve()) ever gets per-candidate start/finish telemetry. This is itself a disclosed measurement-coverage gap this Sprint's own STEP2 has to work around.",
  },
  {
    path: "solve_e2e",
    describedAs: "Calls the REAL FiveByFiveEdgeSolverEngine.solve() entry point exactly as real product callers do -- one call encompasses the full PAIR/FLIP/PARITY/ENDGAME task loop, with Recovery triggered internally by executeTask() only when a task's own primary attempt fails.",
    contractMeasured: "The REAL, complete production Contract as end-users actually experience it -- Recovery (and MCM within it) only gets whatever real wall-clock remains after the primary pipeline's own attempt, which is itself governed by `recoveryReserveMsOverride` (PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS=250ms default) carved off the END of the task's own deadline, NOT off the full outer 1000ms.",
    budgetCondition: "PLAN_TIME_BUDGET_MS=1000ms fixed, NOT exposed as a solve() parameter (cannot vary the outer deadline without either modifying fiveByFiveEdgeSolverEngine.ts, forbidden this Sprint, or a clock-manipulation test technique this Sprint does not use). `recoveryReserveMsOverride` IS a real, exposed, unmodified solve() parameter (default 250ms) that controls how much of the ENDGAME task's own remaining deadline gets reserved for Recovery -- this is the one real, safe lever this Sprint's own STEP2/3 sweep.",
    primitivesIncluded: "Same 7 Recovery types, but ONLY reachable via ENDGAME-type tasks (`recoveryEligible = allowRecovery && task.type === \"ENDGAME\"`) -- PAIR/FLIP/PARITY tasks never trigger Recovery at all.",
    usedInSprints: ["Production Integration Finalization Sprint v1", "Solver Release Readiness Validation Sprint v1", "Multi-Component Merge Production Validation Sprint v1"],
    knownLimitation: "Cannot vary the outer 1000ms plan deadline via any existing parameter -- the ONLY safe, unmodified lever affecting Recovery's real effective budget at this level is `recoveryReserveMsOverride`. A Hole Dataset case that is ALREADY the terminal stuck state of a historical 50-iteration loop may simply not have enough real remaining wall-clock left for a single fresh solve() call's own ENDGAME task to reach a Recovery-eligible failure with a large enough reserve for MCM's own 2000ms nominal need.",
  },
  {
    path: "hole_dataset_replay",
    describedAs: "Loads the 142-case Hole Dataset (mechanismAnalysis/RawDatasetLoader.ts's own loadRawHoleDataset(), unmodified) and replays EITHER attemptRecovery_direct OR solve_e2e over every case.",
    contractMeasured: "Not its own separate Contract -- a POPULATION multiplier applied on top of whichever underlying path (attemptRecovery_direct or solve_e2e) is chosen.",
    budgetCondition: "Inherits whatever the underlying path's own budget condition is.",
    primitivesIncluded: "Inherits whatever the underlying path's own Primitive set is.",
    usedInSprints: ["Every Sprint in this arc's own MCM research line -- always layered on top of one of the two direct-call paths above."],
    knownLimitation: "A large N does not compensate for a systematically-insensitive underlying path -- Production Validation Sprint v1's own N=142 solve_e2e replay found improvedCountDiff mean=0.0000 not because the population was too small, but because solve_e2e itself could not reach the budget condition the effect needs.",
  },
  {
    path: "counterfactual_replay",
    describedAs: "Real execution with ONE variable deliberately varied (outer deadline, scheduling order, or -- new to this Sprint -- recoveryReserveMsOverride) while everything else is held at real production defaults, comparing Arm A/B/C or Baseline/Integrated.",
    contractMeasured: "Whatever the varied parameter itself controls -- a counterfactual is only as informative as the parameter it varies actually reaching the mechanism under test.",
    budgetCondition: "Whichever values the experiment design chooses to sweep.",
    primitivesIncluded: "Whatever the underlying path (attemptRecovery_direct or solve_e2e) offers.",
    usedInSprints: ["Refinement Sprint v1 (Scheduler Ordering)", "Refinement Sprint v2 (Outer Deadline, attemptRecovery_direct only)", "Short-Circuit Production Integration Sprint v1 (Baseline/Integrated via git-checkout toggle)"],
    knownLimitation: "Every counterfactual_replay in this arc BEFORE this Sprint varied a parameter reachable only from attemptRecovery_direct (outer deadline) -- none varied a parameter reachable from solve_e2e (recoveryReserveMsOverride) until this Sprint's own STEP3.",
  },
];
