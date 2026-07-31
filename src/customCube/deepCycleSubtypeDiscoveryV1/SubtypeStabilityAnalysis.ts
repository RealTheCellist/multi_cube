// --- SubtypeStabilityAnalysis (Deep Cycle Subtype Discovery Sprint v1,
// STEP4) -------------------------------------------------------------------
// Cross-tabs each structural cluster (STEP2) against the behavioral rescue
// profiles (STEP3): does grouping by STRUCTURE actually predict a
// different response to the SAME Gate configs? If yes, the structural
// split is real and actionable (per-subtype Gate design would help). If
// clusters look structurally different but behave near-identically, the
// split is cosmetic -- not a Primitive-design-relevant subtype.
import type { Cluster } from "./ClusteringMethods";
import type { RescueProfile } from "./BehavioralProfiling";
import { GATE_SWEEP_CONFIGS } from "../deepCycleRefinementV1/GateSweepSimulator";

export interface ClusterBehavior {
  clusterKey: string;
  size: number;
  rescuedByAnyRate: number;
  rescuedByConfigRate: Record<string, number>; // configLabel -> fraction of cluster rescued
}

export function summarizeClusterBehavior(clusters: readonly Cluster[], profiles: readonly RescueProfile[]): ClusterBehavior[] {
  const profileByLabel = new Map(profiles.map((p) => [p.label, p]));
  return clusters.map((c) => {
    const members = c.memberLabels.map((l) => profileByLabel.get(l)).filter((p): p is RescueProfile => !!p);
    const rescuedByAnyRate = members.length ? members.filter((p) => p.rescuedByAny).length / members.length : 0;
    const rescuedByConfigRate: Record<string, number> = {};
    for (const cfg of GATE_SWEEP_CONFIGS) {
      rescuedByConfigRate[cfg.label] = members.length ? members.filter((p) => p.rescuedByConfigLabel[cfg.label]).length / members.length : 0;
    }
    return { clusterKey: c.key, size: c.memberLabels.length, rescuedByAnyRate, rescuedByConfigRate };
  });
}

export interface BehavioralDivergence {
  configLabel: string;
  minRate: number;
  maxRate: number;
  rangePp: number; // percentage-point spread across clusters (max-min)*100
}

export function computeBehavioralDivergence(clusterBehaviors: readonly ClusterBehavior[]): BehavioralDivergence[] {
  if (clusterBehaviors.length < 2) return [];
  return GATE_SWEEP_CONFIGS.map((cfg) => {
    const rates = clusterBehaviors.map((cb) => cb.rescuedByConfigRate[cfg.label]);
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    return { configLabel: cfg.label, minRate, maxRate, rangePp: (maxRate - minRate) * 100 };
  });
}

// A structural clustering counts as containing "significant" (non-noise)
// clusters only if a cluster has at least this many members -- with n=30,
// a cluster of 1-2 is more likely sampling noise than a real subtype.
export const MIN_SIGNIFICANT_CLUSTER_SIZE = 3;

export function countSignificantClusters(clusters: readonly Cluster[]): number {
  return clusters.filter((c) => c.memberLabels.length >= MIN_SIGNIFICANT_CLUSTER_SIZE).length;
}

// Behavioral divergence is "meaningful" if at least one Gate config's
// rescue rate spreads by more than this many percentage points across
// clusters -- i.e. the same Gate helps one subgroup a lot more than
// another, which is the actionable signal a per-subtype Gate could exploit.
export const MEANINGFUL_DIVERGENCE_THRESHOLD_PP = 30;

export function hasMeaningfulDivergence(divergences: readonly BehavioralDivergence[]): boolean {
  return divergences.some((d) => d.rangePp >= MEANINGFUL_DIVERGENCE_THRESHOLD_PP);
}
