// --- FailureValidator (Solver Failure Dataset Expansion Sprint v2) -------
// STEP2: dedup + integrity check over the staged candidate pool
// (ReplayCollector.ts's output), before anything gets near the canonical
// database. Reuses deserializeCube/computeEdgeSolverStateHash/
// wrongWingCount5 (existing, unmodified) to recompute each candidate's
// hash and WrongWing count independently and compare against what's
// stored -- catches any corrupted/hand-edited entry.
import { loadDatabase, allSnapshots } from "../failureAnalysis/failureDatabase";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { computeEdgeSolverStateHash } from "../fiveByFiveEdgeStateHash";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";

export interface ValidationResult {
  candidateCount: number;
  validCount: number;
  duplicateOfCanonicalCount: number; // hash already present in the canonical DB -- would be a no-op if merged
  corruptCount: number; // failed integrity re-check
  validSnapshots: FailureSnapshot[];
  corruptHashes: string[];
}

function isIntact(snapshot: FailureSnapshot): boolean {
  try {
    const cubies = deserializeCube(snapshot.cubeState);
    const recomputedHash = computeEdgeSolverStateHash(cubies).toString(16);
    const recomputedWrongWing = wrongWingCount5(cubies);
    return recomputedHash === snapshot.hash && recomputedWrongWing === snapshot.wrongWingCount;
  } catch {
    return false;
  }
}

export function validateCandidates(stagingDbPath: string, canonicalDbPath: string): ValidationResult {
  const stagingSnapshots = allSnapshots(loadDatabase(stagingDbPath));
  const canonicalHashes = new Set(allSnapshots(loadDatabase(canonicalDbPath)).map((s) => s.hash));

  const validSnapshots: FailureSnapshot[] = [];
  const corruptHashes: string[] = [];
  let duplicateOfCanonicalCount = 0;

  for (const candidate of stagingSnapshots) {
    if (canonicalHashes.has(candidate.hash)) {
      duplicateOfCanonicalCount++;
      continue;
    }
    if (!isIntact(candidate)) {
      corruptHashes.push(candidate.hash);
      continue;
    }
    validSnapshots.push(candidate);
  }

  return {
    candidateCount: stagingSnapshots.length,
    validCount: validSnapshots.length,
    duplicateOfCanonicalCount,
    corruptCount: corruptHashes.length,
    validSnapshots,
    corruptHashes,
  };
}
