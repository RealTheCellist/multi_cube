// --- UnresolvedHoleCollection (Solver Primitive Discovery Sprint #5 --
// Unresolved Mechanism Validation Sprint v1, STEP1) --------------------------
// Re-collects the "never rescued by anything actually tried" residual from
// the two most recent Refinement Sprints:
//   - Bridge Injection Refinement Sprint v1's own target cluster (51 cases,
//     disconnectedGraph=true): re-evaluated against the UNION of every
//     config that Sprint itself swept (7 Gate configs + 10 Search Contract
//     configs + its own combined-best), all reused unmodified.
//   - Deep Cycle Refinement Sprint v1's own target cluster (30 cases, Deep
//     Cycle Primary Cluster): same union-of-tried-configs treatment,
//     reusing that Sprint's own Gate configs + bridgeInjectionRefinementV1's
//     Search Contract Sweep simulator (already cross-reused there) + its
//     own combined-best.
// The two populations are disjoint by construction (Bridge Injection's
// clusterKey requires bridge=true/componentCount>1; Deep Cycle's requires
// bridge=false/componentCount=1), so a plain union needs no dedup.
import * as fs from "fs";
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { loadTargetPopulation as loadBridgeInjectionPopulation, splitPopulation as splitBridgeInjectionPopulation, type TaggedCase as BridgeInjectionTaggedCase } from "../bridgeInjectionRefinementV1/TargetPopulation";
import { GATE_SWEEP_CONFIGS as BI_GATE_CONFIGS, BASELINE_GATE as BI_BASELINE_GATE, tryMultiHopBridgeConfigured } from "../bridgeInjectionRefinementV1/GateSweepSimulator";
import { SEARCH_CONTRACT_SWEEP_CONFIGS, resolveBoundedMultiCycleConfigured, type SearchContractConfig } from "../bridgeInjectionRefinementV1/SearchContractSweepSimulator";
import { buildCombinedTrial as buildBridgeInjectionCombinedTrial } from "../bridgeInjectionRefinementV1/CombinedTrial";
import type { GateConfig as BIGateConfig } from "../bridgeInjectionRefinementV1/GateSweepSimulator";

import { loadTargetPopulation as loadDeepCyclePopulation, splitPopulation as splitDeepCyclePopulation, type TaggedCase as DeepCycleTaggedCase } from "../deepCycleRefinementV1/TargetPopulation";
import { GATE_SWEEP_CONFIGS as DC_GATE_CONFIGS, BASELINE_GATE as DC_BASELINE_GATE, tryBoundedMultiCycleConfigured, type GateConfig as DCGateConfig } from "../deepCycleRefinementV1/GateSweepSimulator";
import { buildCombinedTrial as buildDeepCycleCombinedTrial } from "../deepCycleRefinementV1/CombinedTrial";

import type { StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import type { HoleCase } from "../solverPrimitiveDiscovery4/HoleCollectionV4";

const DEADLINE_MS = 400; // matches both Refinement Sprints' own DEADLINE_MS
const BI_RESULT_PATH = "src/customCube/bridgeInjectionRefinementV1/data/bridge-injection-refinement-v1-result.json";
const DC_RESULT_PATH = "src/customCube/deepCycleRefinementV1/data/deep-cycle-refinement-v1-result.json";

export type SourceBlueprint = "Bridge Injection" | "Deep Cycle";

export interface UnresolvedCase {
  label: string;
  hole: HoleCase;
  features: StructuralFeatureSetV4;
  sourceBlueprint: SourceBlueprint;
}

function wasEverRescued(cubies: import("../cubeState").Cubie[], lib: WingLibrary, trials: ((c: import("../cubeState").Cubie[], l: WingLibrary, d: number) => { moves: import("../fiveByFiveEdges").Move[] | null })[]): boolean {
  const before = wrongWingCount5(cubies);
  for (const trial of trials) {
    const working = cloneCubies(cubies);
    const result = trial(working, lib, Date.now() + DEADLINE_MS);
    if (!result.moves) continue;
    const after = cloneCubies(working);
    applySeq(after, result.moves);
    if (wrongWingCount5(after) < before) return true;
  }
  return false;
}

function collectUnresolvedBridgeInjection(lib: WingLibrary): UnresolvedCase[] {
  const stored = JSON.parse(fs.readFileSync(BI_RESULT_PATH, "utf-8")) as { bestGateConfig: BIGateConfig; bestSearchConfig: SearchContractConfig };
  const all = loadBridgeInjectionPopulation();
  const { target } = splitBridgeInjectionPopulation(all);

  const gateTrials = BI_GATE_CONFIGS.map((cfg) => (c: import("../cubeState").Cubie[], l: WingLibrary, d: number) => tryMultiHopBridgeConfigured(c, l, d, cfg));
  const searchTrials = SEARCH_CONTRACT_SWEEP_CONFIGS.map((cfg) => buildBridgeInjectionCombinedTrial(BI_BASELINE_GATE, cfg));
  const combinedTrial = buildBridgeInjectionCombinedTrial(stored.bestGateConfig, stored.bestSearchConfig);
  const allTrials = [...gateTrials, ...searchTrials, combinedTrial];

  const unresolved: UnresolvedCase[] = [];
  for (const tc of target as BridgeInjectionTaggedCase[]) {
    if (!wasEverRescued(tc.hole.cubies, lib, allTrials)) {
      unresolved.push({ label: tc.hole.label, hole: tc.hole, features: tc.features, sourceBlueprint: "Bridge Injection" });
    }
  }
  return unresolved;
}

function collectUnresolvedDeepCycle(lib: WingLibrary): UnresolvedCase[] {
  const stored = JSON.parse(fs.readFileSync(DC_RESULT_PATH, "utf-8")) as { bestGateConfig: DCGateConfig; bestSearchConfig: SearchContractConfig };
  const all = loadDeepCyclePopulation();
  const { target } = splitDeepCyclePopulation(all);

  const gateTrials = DC_GATE_CONFIGS.map((cfg) => (c: import("../cubeState").Cubie[], l: WingLibrary, d: number) => tryBoundedMultiCycleConfigured(c, l, d, cfg));
  const searchTrials = SEARCH_CONTRACT_SWEEP_CONFIGS.map((cfg) => buildDeepCycleCombinedTrial(DC_BASELINE_GATE, cfg));
  const combinedTrial = buildDeepCycleCombinedTrial(stored.bestGateConfig, stored.bestSearchConfig);
  const allTrials = [...gateTrials, ...searchTrials, combinedTrial];

  const unresolved: UnresolvedCase[] = [];
  for (const tc of target as DeepCycleTaggedCase[]) {
    if (!wasEverRescued(tc.hole.cubies, lib, allTrials)) {
      unresolved.push({ label: tc.hole.label, hole: tc.hole, features: tc.features, sourceBlueprint: "Deep Cycle" });
    }
  }
  return unresolved;
}

export function collectUnresolvedHoles(lib: WingLibrary): UnresolvedCase[] {
  return [...collectUnresolvedBridgeInjection(lib), ...collectUnresolvedDeepCycle(lib)];
}
