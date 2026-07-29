// --- CaseMeasurement (Mixed Commutator Production Validation Sprint v2)
// -----------------------------------------------------------------------
// Compares Baseline (Gate A, the pre-Gate-Production-Integration Gate,
// shadow-reconstructed) against Integrated (Gate C, the REAL current
// production Gate, wired in by Gate Production Integration Sprint v1) --
// unlike Validation v1, `includeMixedCommutator=true` on the real
// generateRecoveryStrategies() now means "Gate C", not "Gate A", since the
// Gate itself changed in production code. Gate A must therefore be
// reconstructed the same way Gate Refinement Sprint v1 already did: reuse
// its own GATE_DEFINITIONS predicates and SyntheticMixedCandidate builder
// UNMODIFIED (both are this arc's own already-validated shadow research
// modules, not production code) to score a shadow Mixed candidate under
// Gate A's stricter condition, combined with the SAME real base candidates
// (DISRUPT/SETUP/REPAIR/CCR, via includeMixedCommutator=false) used for the
// real Gate C arm -- so both arms compete on identical base candidates
// within a repeat, isolating the Gate's own effect exactly.
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { runMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import { GATE_DEFINITIONS } from "../gateRefinement/GateDefinitions";
import { buildSyntheticMixedCandidate } from "../gateRefinement/SyntheticMixedCandidate";

export type PopulationTag = "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";

export const RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR"];
export const PRODUCTION_REALISTIC_BUDGET_MS = 300; // matches MIXED_COMMUTATOR_RESERVED_SLICE_MS
export const BASE_CANDIDATE_BUDGET_MS = 1000; // matches this arc's own OUTER_DEADLINE_MS convention

const GATE_A = GATE_DEFINITIONS.find((g) => g.id === "A")!;
const GATE_C = GATE_DEFINITIONS.find((g) => g.id === "C")!;

export interface RepeatOutcome {
  baselineChosenType: RecoveryType | null;
  baselineWrongWingAfter: number | null;
  integratedChosenType: RecoveryType | null;
  integratedWrongWingAfter: number | null;
  outcomeChanged: boolean;
}

export interface CaseMeasurement {
  label: string;
  populationTag: PopulationTag;
  wrongWingBefore: number;
  mixedGenerated: boolean; // deterministic, computed once
  mixedWallMs: number;
  syntheticMixed: RecoveryStrategy | null;
  gateAEligible: boolean;
  gateCEligible: boolean;
  perRepeat: RepeatOutcome[];
  perTypeImprovingByRepeat: Record<RecoveryType, boolean>[]; // one per repeat, from the FULL real (Gate C) candidate list
}

function improvingByType(candidates: readonly RecoveryStrategy[]): Record<RecoveryType, boolean> {
  const out = {} as Record<RecoveryType, boolean>;
  for (const t of RECOVERY_TYPES) out[t] = candidates.some((c) => c.type === t && c.expectedWrongWingDelta < 0);
  return out;
}

export function measureCase(cubies: Cubie[], label: string, populationTag: PopulationTag, libs: ExecutorLibraries, wingLib: WingLibrary, nRepeats: number): CaseMeasurement {
  const wrongWingBefore = wrongWingCount5(cubies);
  const stats = analyzeConstraints(buildStateGraph(cubies));
  const gateAEligible = GATE_A.predicate(stats);
  const gateCEligible = GATE_C.predicate(stats);

  const mixedStart = Date.now();
  const mixedResult = runMixedCommutatorPrototype(cloneCubies(cubies), wingLib, Date.now() + PRODUCTION_REALISTIC_BUDGET_MS);
  const mixedWallMs = Date.now() - mixedStart;
  const mixedGenerated = mixedResult.moves !== null && mixedResult.moves.length > 0;
  const syntheticMixed = mixedGenerated ? buildSyntheticMixedCandidate(cubies, mixedResult.moves!) : null;

  const perRepeat: RepeatOutcome[] = [];
  const perTypeImprovingByRepeat: Record<RecoveryType, boolean>[] = [];

  for (let r = 0; r < nRepeats; r++) {
    const baseCandidates: RecoveryStrategy[] = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + BASE_CANDIDATE_BUDGET_MS, undefined, true, "reservedBudget", undefined, true, false);

    const integratedCandidates = gateCEligible && syntheticMixed ? [...baseCandidates, syntheticMixed] : baseCandidates;
    const baselineCandidates = gateAEligible && syntheticMixed ? [...baseCandidates, syntheticMixed] : baseCandidates;

    const integratedBest = chooseBestRecovery(integratedCandidates);
    const baselineBest = chooseBestRecovery(baselineCandidates);

    let integratedWrongWingAfter: number | null = null;
    if (integratedBest) {
      const clone = cloneCubies(cubies);
      applySeq(clone, integratedBest.moves);
      integratedWrongWingAfter = wrongWingCount5(clone);
    }
    let baselineWrongWingAfter: number | null = null;
    if (baselineBest) {
      const clone = cloneCubies(cubies);
      applySeq(clone, baselineBest.moves);
      baselineWrongWingAfter = wrongWingCount5(clone);
    }

    perRepeat.push({
      baselineChosenType: baselineBest?.type ?? null,
      baselineWrongWingAfter,
      integratedChosenType: integratedBest?.type ?? null,
      integratedWrongWingAfter,
      outcomeChanged: (integratedBest?.type ?? null) !== (baselineBest?.type ?? null),
    });
    perTypeImprovingByRepeat.push(improvingByType(integratedCandidates));
  }

  return {
    label,
    populationTag,
    wrongWingBefore,
    mixedGenerated,
    mixedWallMs,
    syntheticMixed,
    gateAEligible,
    gateCEligible,
    perRepeat,
    perTypeImprovingByRepeat,
  };
}
