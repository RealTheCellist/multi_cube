// --- AblationAnalysis (Parity-Gated Cycle Prototype Sprint v1, STEP4)
// -----------------------------------------------------------------------
// Directive: "Prototype 내부 요소를 순차적으로 제거...하며 각 요소가
// Capability에 실제로 기여하는지 측정." Reuses
// CrossComponentBridgeCycleResolver.ts's own ResolverConfig (already
// designed for exactly this, matching this arc's own "one parameterized
// function, not N copies" convention -- GateSweepSimulator.ts etc). Each
// variant toggles exactly ONE axis off the FULL_CONFIG baseline so any
// Capability delta can be attributed to that specific element.
import type { WingLibrary } from "../fiveByFiveEdges";
import type { UnknownCase } from "../parityGatedCycleBlueprintV1/UnknownPopulationProfiling";
import { evaluatePopulation, summarizeOutcomes, type CaseOutcome, type EvaluationSummary } from "./CapabilityMeasurement";
import { tryCrossComponentBridgeCycleResolverConfigured, FULL_CONFIG, type ResolverConfig } from "./CrossComponentBridgeCycleResolver";

export const ABLATION_VARIANTS: ResolverConfig[] = [
  FULL_CONFIG,
  { label: "no bridge (Bridge 생성 제거)", useBridge: false, useTraversal: true, useCleanup: true, componentSelectionStrategy: "largestTwo" },
  { label: "no traversal (Traversal 제거)", useBridge: true, useTraversal: false, useCleanup: true, componentSelectionStrategy: "largestTwo" },
  { label: "no cleanup (Bridge Removal 제거)", useBridge: true, useTraversal: true, useCleanup: false, componentSelectionStrategy: "largestTwo" },
  { label: "smallestTwo (Component 선택 변경)", useBridge: true, useTraversal: true, useCleanup: true, componentSelectionStrategy: "smallestTwo" },
];

export interface AblationResult {
  config: ResolverConfig;
  outcomes: CaseOutcome[];
  summary: EvaluationSummary;
}

export function runAblation(cases: readonly UnknownCase[], lib: WingLibrary, deadlineMs: number): AblationResult[] {
  return ABLATION_VARIANTS.map((config) => {
    const outcomes = evaluatePopulation(cases, lib, deadlineMs, (cubies, l, deadline) => tryCrossComponentBridgeCycleResolverConfigured(cubies, l, deadline, config));
    const summary = summarizeOutcomes(config.label, outcomes);
    return { config, outcomes, summary };
  });
}
