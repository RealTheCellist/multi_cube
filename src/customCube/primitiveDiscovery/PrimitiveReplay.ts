// --- PrimitiveReplay (Capability Expansion Sprint v2) -----------------------
// Thin wrapper picking representative Failure Clusters from the EXISTING
// Failure Analysis Engine's stored data (read-only) and restoring their
// exact cube states via the EXISTING Replay machinery -- never a fresh
// scramble (spec section 7: "Random Scramble는 사용하지 않는다").
import type { Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { canonicalizeAll, clusterCanonicalEntries } from "./clusterAnalyzer";
import type { DiscoveryCluster } from "./discoveryTypes";

export interface RepresentativeCluster {
  cluster: DiscoveryCluster;
  representativeSnapshot: FailureSnapshot;
  representativeCubies: Cubie[];
}

/** Top N clusters by size (spec's own worked example: "WrongWing = 8,
 * Parity = false, Occurrence = 31" -- exactly this shape, reusing the
 * clustering already built for the Primitive Discovery Engine rather than
 * re-clustering from scratch). */
export function loadRepresentativeClusters(dbPath: string, topN: number): RepresentativeCluster[] {
  const db = loadDatabase(dbPath);
  const snapshots = allSnapshots(db);
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  const canonicalEntries = canonicalizeAll(snapshots);
  const clusters = clusterCanonicalEntries(canonicalEntries).slice(0, topN);

  return clusters.map((cluster) => {
    const representativeSnapshot = byHash.get(cluster.snapshotHashes[0])!;
    return {
      cluster,
      representativeSnapshot,
      representativeCubies: deserializeCube(representativeSnapshot.cubeState),
    };
  });
}

/** All snapshots in the database, for the Replay Benchmark phase (spec
 * section 14: "최소 50개의 Failure Replay에서 검증"). */
export function loadAllReplaySnapshots(dbPath: string): FailureSnapshot[] {
  return allSnapshots(loadDatabase(dbPath));
}

export function restoreReplayState(snapshot: FailureSnapshot): Cubie[] {
  return deserializeCube(snapshot.cubeState);
}
