// --- PatternMining (Primitive Discovery Sprint #3) -------------------------
// STEP3. Auto-clusters the CCR target population by its own cycle-shape
// signature (CCRTargetProfiling.ts's own cycleShapes array, e.g. [5] a
// clean 5-cycle, [5,5] two disjoint 5-cycles, [6,4] a 6-cycle plus a
// disjoint 4-cycle) -- reuses that array unmodified, just groups by its
// joined string form. No new clustering algorithm: this is the same
// "group by a structural key" pattern primitiveDiscoverySprint2/
// StructuralClustering.ts already used, applied to a different key.
import type { CCRProfile } from "./CCRTargetProfiling";

export interface ShapeCluster {
  shape: string; // e.g. "5", "6", "5+5", "6+4"
  size: number;
  share: number;
  hashes: string[];
}

function shapeKey(cycleShapes: readonly number[]): string {
  return cycleShapes.length ? cycleShapes.join("+") : "none";
}

export function mineShapePatterns(profiles: readonly CCRProfile[]): ShapeCluster[] {
  const groups = new Map<string, CCRProfile[]>();
  for (const p of profiles) {
    const key = shapeKey(p.cycleShapes);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  const total = profiles.length;
  const clusters: ShapeCluster[] = [];
  for (const [shape, list] of groups) {
    clusters.push({ shape, size: list.length, share: total ? list.length / total : 0, hashes: list.map((p) => p.hash) });
  }
  return clusters.sort((a, b) => b.size - a.size);
}

export function top10(clusters: readonly ShapeCluster[]): ShapeCluster[] {
  return clusters.slice(0, 10);
}
