// --- CCRTargetProfiling (Primitive Discovery Sprint #3) --------------------
// STEP2. Deep-profiles the CCR target population (cycleLength 5-6,
// conflictEdgeCount=0, from STEP1's RemainingGapVerification) with richer
// Representation features than StructuralFeatures alone -- all derived
// from EXISTING, unmodified building blocks (buildStateGraph,
// analyzeEdgeSlots/detectEdgeSlotPattern, wrongWingCount5), no new
// structural-analysis algorithm.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeEdgeSlots, detectEdgeSlotPattern } from "../fiveByFiveHumanEdges";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { GapVerificationRecord } from "./RemainingGapVerification";

// A cube edge slot's own slotKey is 2 axis=boundary terms (e.g. "x2,y-2") --
// the UNORDERED pair of axis letters names which of the 3 standard edge
// orbits (xy/xz/yz, 4 edges each under the rotation group) it belongs to.
function edgeOrbitOf(slot: string): string {
  const axes = slot
    .split(",")
    .map((t) => t[0])
    .sort();
  return axes.join("");
}

export interface CCRProfile {
  hash: string;
  wrongWingCount: number;
  parity: boolean;
  cycleShapes: number[]; // ALL distinct cycle lengths present in the WANTS graph (not just the longest), descending
  cycleCount: number;
  primaryCycleLength: number;
  wrongWingDensity: number; // wrongWingCount / (primaryCycleLength * 2) -- 1.0 means exactly the primary cycle's own wings account for all wrong wings
  edgeOrbitCounts: Record<string, number>; // primary cycle's nodes, bucketed by edge orbit (xy/xz/yz)
  wingPairingCounts: Record<string, number>; // primary cycle's nodes' own EdgeSlotPatternName distribution (unpaired/flipped-pair/half-paired -- "paired" excluded, a cycle node's slot is by definition not fully paired)
}

export function computeCcrProfile(snapshot: FailureSnapshot): CCRProfile {
  const cubies = deserializeCube(snapshot.cubeState);
  const graph = buildStateGraph(cubies);
  const cycleShapes = graph.cycles.map((c) => c.length).sort((a, b) => b - a);
  const primaryCycleLength = cycleShapes[0] ?? 0;
  const primaryCycle = graph.cycles.find((c) => c.length === primaryCycleLength) ?? [];

  const wrongWingCount = wrongWingCount5(cubies);
  const wrongWingDensity = primaryCycleLength > 0 ? wrongWingCount / (primaryCycleLength * 2) : 0;

  const edgeOrbitCounts: Record<string, number> = {};
  for (const slot of primaryCycle) {
    const orbit = edgeOrbitOf(slot);
    edgeOrbitCounts[orbit] = (edgeOrbitCounts[orbit] ?? 0) + 1;
  }

  const statsBySlot = new Map(analyzeEdgeSlots(cubies).map((s) => [s.slot, s]));
  const wingPairingCounts: Record<string, number> = {};
  for (const slot of primaryCycle) {
    const stats = statsBySlot.get(slot);
    if (!stats) continue;
    const pattern = detectEdgeSlotPattern(stats);
    wingPairingCounts[pattern] = (wingPairingCounts[pattern] ?? 0) + 1;
  }

  return {
    hash: snapshot.hash,
    wrongWingCount,
    parity: snapshot.parity,
    cycleShapes,
    cycleCount: graph.cycles.length,
    primaryCycleLength,
    wrongWingDensity,
    edgeOrbitCounts,
    wingPairingCounts,
  };
}

export function profileCcrTarget(target: readonly GapVerificationRecord[], snapshotsByHash: ReadonlyMap<string, FailureSnapshot>): CCRProfile[] {
  const profiles: CCRProfile[] = [];
  for (const r of target) {
    const snapshot = snapshotsByHash.get(r.hash);
    if (!snapshot) continue;
    profiles.push(computeCcrProfile(snapshot));
  }
  return profiles;
}

export interface CCRProfileSummary {
  n: number;
  avgWrongWingCount: number;
  parityShare: number;
  avgCycleCount: number;
  multiCycleShare: number; // share with cycleCount > 1 (e.g. "5+5" shapes, not a single clean cycle)
  avgWrongWingDensity: number;
  edgeOrbitDistribution: Record<string, number>; // aggregated across all profiles' primary-cycle nodes
  wingPairingDistribution: Record<string, number>; // aggregated across all profiles' primary-cycle nodes
}

function mergeCounts(target: Record<string, number>, addition: Record<string, number>): void {
  for (const [k, v] of Object.entries(addition)) target[k] = (target[k] ?? 0) + v;
}

export function summarizeCcrProfiles(profiles: readonly CCRProfile[]): CCRProfileSummary {
  const n = profiles.length;
  const edgeOrbitDistribution: Record<string, number> = {};
  const wingPairingDistribution: Record<string, number> = {};
  for (const p of profiles) {
    mergeCounts(edgeOrbitDistribution, p.edgeOrbitCounts);
    mergeCounts(wingPairingDistribution, p.wingPairingCounts);
  }
  return {
    n,
    avgWrongWingCount: n ? profiles.reduce((a, p) => a + p.wrongWingCount, 0) / n : 0,
    parityShare: n ? profiles.filter((p) => p.parity).length / n : 0,
    avgCycleCount: n ? profiles.reduce((a, p) => a + p.cycleCount, 0) / n : 0,
    multiCycleShare: n ? profiles.filter((p) => p.cycleCount > 1).length / n : 0,
    avgWrongWingDensity: n ? profiles.reduce((a, p) => a + p.wrongWingDensity, 0) / n : 0,
    edgeOrbitDistribution,
    wingPairingDistribution,
  };
}
