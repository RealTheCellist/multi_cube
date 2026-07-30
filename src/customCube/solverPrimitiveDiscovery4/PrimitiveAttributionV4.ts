// --- PrimitiveAttributionV4 (Solver Primitive Discovery Sprint #4 --
// State Taxonomy Sprint v1, STEP2) -------------------------------------------
// For each Hole (a state where the FULL pipeline's own 50-iteration loop
// never converged), runs exactly ONE additional real solve() call via
// solverReleaseReadiness/EndToEndSolveProbe.ts's endToEndSolveProbe()
// (reused completely unmodified) on the Hole's own final stuck state, and
// reads what the CURRENT, unmodified production Task/Recovery layer
// actually offers/does against it right now. This attributes each Hole to
// an existing mechanism (or confirms none applies) using real dispatcher
// behavior -- not inference from static features.
//
// Directive naming reconciliation (disclosed, not silently reinterpreted):
// the Directive's attribution categories are BASE/PARITY/FLIP/CASE/BP-1/
// BP-2/REPAIR/CCR/MIXED_COMMUTATOR/ENDGAME. The real production trace
// vocabulary (fiveByFiveEdgeSolverTypes.ts) only has 4 SolveTaskTypes
// (PAIR/FLIP/PARITY/ENDGAME) and 5 RecoveryTypes (DISRUPT/SETUP/REPAIR/
// CCR/MIXED_COMMUTATOR) -- confirmed by reading fiveByFiveEdgeRecovery.ts
// directly, no separate "BP-1"/"BP-2"/"CASE" trace label exists. Mapping
// used here:
//   BASE           <- SolveTaskType "PAIR" (base wing-pairing, no recovery)
//   FLIP           <- SolveTaskType "FLIP"
//   PARITY         <- SolveTaskType "PARITY" (also covers what the
//                     Directive separately calls "BP-2"/Parity-Cycle --
//                     production never wired a parity-specific Recovery
//                     type distinct from the PARITY task type)
//   ENDGAME        <- SolveTaskType "ENDGAME"
//   BP-1 / REPAIR  <- RecoveryType "REPAIR" ("구조적 Cycle 해결" -- this
//                     IS the production-integrated form of BP-1/Deep Cycle
//                     Resolver, per mechanismAnalysis/PrimitiveOpportunityMap.ts's
//                     own prior-art note)
//   CCR            <- RecoveryType "CCR"
//   MIXED_COMMUTATOR <- RecoveryType "MIXED_COMMUTATOR"
//   CASE           <- no distinct production trace category exists; the
//                     historical "exact-case-match" logic lives inside the
//                     PARITY/DISRUPT internals, not separately traced --
//                     disclosed gap, not fabricated.
//   (DISRUPT/SETUP are real production RecoveryTypes without a Directive-
//   named counterpart -- reported as-is rather than dropped.)
import { endToEndSolveProbe } from "../solverReleaseReadiness/EndToEndSolveProbe";
import type { HoleCaseV4 } from "./HoleCollectionV4";
import type { SolveTaskType, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export type AttributionTier = "ALREADY_EXPLAINED" | "PARTIALLY_EXPLAINED" | "COMPLETELY_UNKNOWN";

export interface AttributionResult {
  label: string;
  tier: AttributionTier;
  solvedByOneMoreCall: boolean;
  improvedByOneMoreCall: boolean;
  completedTaskTypes: SolveTaskType[];
  recoveryCandidatesOffered: RecoveryType[];
  recoveryChosenType: RecoveryType | null;
  recoverySucceeded: boolean;
  attributedMechanisms: string[]; // Directive-naming reconciled list, e.g. ["REPAIR (BP-1)", "PARITY"]
}

function reconcileNaming(taskTypes: SolveTaskType[], recoveryOffered: RecoveryType[], recoveryChosen: RecoveryType | null): string[] {
  const names = new Set<string>();
  for (const t of taskTypes) {
    if (t === "PAIR") names.add("BASE");
    else names.add(t); // FLIP, PARITY, ENDGAME map 1:1
  }
  const allRecovery = recoveryChosen ? [...new Set([...recoveryOffered, recoveryChosen])] : recoveryOffered;
  for (const r of allRecovery) {
    if (r === "REPAIR") names.add("REPAIR (BP-1/Deep Cycle)");
    else names.add(r); // DISRUPT, SETUP, CCR, MIXED_COMMUTATOR as-is
  }
  return [...names];
}

export function attributeHole(hole: HoleCaseV4): AttributionResult {
  const result = endToEndSolveProbe(hole.cubies, hole.label);
  const recoveryCandidatesOffered = result.recoveryOutcome?.candidatesOffered ?? [];
  const recoveryChosenType = result.recoveryOutcome?.chosenType ?? null;
  const recoverySucceeded = result.recoveryOutcome?.succeeded ?? false;
  const completedTaskTypes = result.completedTaskTypes;

  const somethingRecognizedIt = completedTaskTypes.length > 0 || recoveryCandidatesOffered.length > 0;

  let tier: AttributionTier;
  if (result.solved) tier = "ALREADY_EXPLAINED";
  else if (result.improved || somethingRecognizedIt) tier = "PARTIALLY_EXPLAINED";
  else tier = "COMPLETELY_UNKNOWN";

  return {
    label: hole.label,
    tier,
    solvedByOneMoreCall: result.solved,
    improvedByOneMoreCall: result.improved,
    completedTaskTypes,
    recoveryCandidatesOffered,
    recoveryChosenType,
    recoverySucceeded,
    attributedMechanisms: reconcileNaming(completedTaskTypes, recoveryCandidatesOffered, recoveryChosenType),
  };
}

export function attributeAllHoles(holes: readonly HoleCaseV4[]): AttributionResult[] {
  return holes.map(attributeHole);
}

export interface AttributionSummary {
  totalCases: number;
  alreadyExplainedCount: number;
  partiallyExplainedCount: number;
  completelyUnknownCount: number;
  mechanismFrequency: Record<string, number>;
}

export function summarizeAttribution(results: readonly AttributionResult[]): AttributionSummary {
  const mechanismFrequency: Record<string, number> = {};
  for (const r of results) {
    for (const m of r.attributedMechanisms) mechanismFrequency[m] = (mechanismFrequency[m] ?? 0) + 1;
  }
  return {
    totalCases: results.length,
    alreadyExplainedCount: results.filter((r) => r.tier === "ALREADY_EXPLAINED").length,
    partiallyExplainedCount: results.filter((r) => r.tier === "PARTIALLY_EXPLAINED").length,
    completelyUnknownCount: results.filter((r) => r.tier === "COMPLETELY_UNKNOWN").length,
    mechanismFrequency,
  };
}
