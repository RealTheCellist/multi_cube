// --- GateCaseMeasurement (Gate Refinement Sprint v1, RQ-1~4) ----------------
// Per case: (1) computes the REAL structural stats once (analyzeConstraints),
// (2) generates REAL base Recovery candidates (DISRUPT/SETUP/REPAIR/CCR only
// -- generateRecoveryStrategies(..., includeMixedCommutator=false), fresh
// deadline per repeat, N repeats since DISRUPT/SETUP have their own
// shuffle()-driven search) completely UNMODIFIED, (3) computes Mixed
// Commutator's own candidate ONCE (deterministic, no randomness -- see
// mixedCommutatorOpportunityAnalysis/ShadowEvaluation.ts's own comment) at
// the real production-realistic budget, (4) for EACH of the 5 Gate
// candidates, if this case is eligible under that Gate, combines the
// synthetic Mixed candidate with each base-candidate repeat and calls the
// REAL, unmodified chooseBestRecovery() to get the actual selection outcome
// -- exactly reproducing what fiveByFiveEdgeRecovery.ts's real
// attemptRecovery() would pick, for a Gate variant that was never actually
// wired into it.
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { runMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";
import type { RecoveryStrategy } from "../fiveByFiveEdgeSolverTypes";
import { buildSyntheticMixedCandidate } from "./SyntheticMixedCandidate";
import { GATE_DEFINITIONS, type GateId } from "./GateDefinitions";

export type PopulationTag = "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";

export const PRODUCTION_REALISTIC_BUDGET_MS = 300; // matches MIXED_COMMUTATOR_RESERVED_SLICE_MS
export const BASE_CANDIDATE_BUDGET_MS = 1000; // matches this arc's own OUTER_DEADLINE_MS convention

export interface GateRepeatOutcome {
  gateId: GateId;
  eligible: boolean;
  mixedChosen: boolean;
  winnerType: RecoveryStrategy["type"] | null;
  wrongWingAfter: number | null; // after applying the winner's moves
}

export interface CaseMeasurement {
  label: string;
  populationTag: PopulationTag;
  wrongWingBefore: number;
  mixedGenerated: boolean; // at production-realistic budget, regardless of any Gate
  mixedWallMs: number;
  mixedExhausted: boolean;
  syntheticMixed: RecoveryStrategy | null;
  perRepeat: GateRepeatOutcome[][]; // outer index = repeat, inner = one row per gate
}

export function measureCase(
  cubies: Cubie[],
  label: string,
  populationTag: PopulationTag,
  libs: ExecutorLibraries,
  wingLib: WingLibrary,
  nRepeats: number
): CaseMeasurement {
  const wrongWingBefore = wrongWingCount5(cubies);
  const stats = analyzeConstraints(buildStateGraph(cubies));

  const mixedStart = Date.now();
  const mixedResult = runMixedCommutatorPrototype(cloneCubies(cubies), wingLib, Date.now() + PRODUCTION_REALISTIC_BUDGET_MS);
  const mixedWallMs = Date.now() - mixedStart;
  const mixedMoves = mixedResult.moves;
  const mixedGenerated = mixedMoves !== null && mixedMoves.length > 0;
  const syntheticMixed = mixedGenerated ? buildSyntheticMixedCandidate(cubies, mixedMoves!) : null;

  const perRepeat: GateRepeatOutcome[][] = [];
  for (let r = 0; r < nRepeats; r++) {
    const baseCandidates: RecoveryStrategy[] = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + BASE_CANDIDATE_BUDGET_MS, undefined, true, "reservedBudget", undefined, true, false);

    const row: GateRepeatOutcome[] = GATE_DEFINITIONS.map((gate) => {
      const eligible = gate.predicate(stats);
      const candidates = eligible && syntheticMixed ? [...baseCandidates, syntheticMixed] : baseCandidates;
      const best = chooseBestRecovery(candidates);
      let wrongWingAfter: number | null = null;
      if (best) {
        const clone = cloneCubies(cubies);
        applySeq(clone, best.moves);
        wrongWingAfter = wrongWingCount5(clone);
      }
      return {
        gateId: gate.id,
        eligible,
        mixedChosen: best?.type === "MIXED_COMMUTATOR",
        winnerType: best?.type ?? null,
        wrongWingAfter,
      };
    });
    perRepeat.push(row);
  }

  return {
    label,
    populationTag,
    wrongWingBefore,
    mixedGenerated,
    mixedWallMs,
    mixedExhausted: mixedResult.exhaustedSearchSpace,
    syntheticMixed,
    perRepeat,
  };
}
