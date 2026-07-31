// --- BehavioralProfiling (Deep Cycle Subtype Discovery Sprint v1, STEP3)
// -------------------------------------------------------------------------
// The real test of whether structural clusters (STEP2) matter: do cases in
// different structural clusters actually respond DIFFERENTLY to the same
// Gate configs? Reuses Deep Cycle Refinement Sprint v1's own
// GATE_SWEEP_CONFIGS + tryBoundedMultiCycleConfigured (unmodified imports,
// same 10 configs, Search Contract held at BASELINE_SEARCH_CONTRACT
// exactly like that Sprint's own STEP2) to compute a per-case boolean
// rescue vector -- which of the 10 already-swept Gate configs actually
// net-improves each of the 30 cases.
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { GATE_SWEEP_CONFIGS, tryBoundedMultiCycleConfigured } from "../deepCycleRefinementV1/GateSweepSimulator";
import type { TaggedCase } from "../deepCycleRefinementV1/TargetPopulation";

const DEADLINE_MS = 400; // matches Deep Cycle Refinement Sprint v1's own DEADLINE_MS

export interface RescueProfile {
  label: string;
  rescuedByConfigLabel: Record<string, boolean>; // one entry per GATE_SWEEP_CONFIGS config
  rescuedByAny: boolean;
  rescuedOnlyByNonBaseline: boolean; // false for baseline-rescued or never-rescued cases
}

export function computeRescueProfile(tc: TaggedCase, lib: WingLibrary): RescueProfile {
  const rescuedByConfigLabel: Record<string, boolean> = {};
  for (const cfg of GATE_SWEEP_CONFIGS) {
    const cubies = cloneCubies(tc.hole.cubies);
    const before = wrongWingCount5(cubies);
    const result = tryBoundedMultiCycleConfigured(cubies, lib, Date.now() + DEADLINE_MS, cfg);
    let improved = false;
    if (result.moves) {
      const after = cloneCubies(cubies);
      applySeq(after, result.moves);
      improved = wrongWingCount5(after) < before;
    }
    rescuedByConfigLabel[cfg.label] = improved;
  }

  const rescuedByAny = Object.values(rescuedByConfigLabel).some(Boolean);
  const rescuedByBaseline = rescuedByConfigLabel[GATE_SWEEP_CONFIGS[0].label] === true;
  const rescuedOnlyByNonBaseline = rescuedByAny && !rescuedByBaseline;

  return { label: tc.hole.label, rescuedByConfigLabel, rescuedByAny, rescuedOnlyByNonBaseline };
}

export function computeAllRescueProfiles(cases: readonly TaggedCase[], lib: WingLibrary): RescueProfile[] {
  return cases.map((tc) => computeRescueProfile(tc, lib));
}
