// --- ReplayCollector (Solver Failure Dataset Expansion Sprint v2) --------
// STEP1: generates new Failure Replays by reusing the EXISTING, UNMODIFIED
// replay generator (`runFailureCollectionSession`,
// failureAnalysis/failureAnalysisEngine.ts) -- the exact same function that
// built the original 75-replay canonical database. This Sprint does not
// build a new generator and does not modify the existing one; it only
// decides WHERE to write candidates (a staging path, never the canonical
// database directly) and, later (HybridSampler.ts, STEP4), which of the
// generated candidates to keep.
//
// `runFailureCollectionSession` scrambles a fresh solved cube via pure
// uniform-random quarter turns and drives it through the real, unmodified
// FiveByFiveEdgeSolverEngine until solved or stuck -- so its OWN output is
// inherently "Random" sampling. The Hybrid Sampling policy this Sprint's
// spec requires (Hard Gap 40% / Shape 균등 30% / Failure 유형 균등 20% /
// Random 10%) cannot be implemented by steering the generator itself
// (forbidden: "Replay 생성기 수정" is explicitly out of scope) -- it is
// implemented downstream, as a SELECTION policy over this naturally-random
// candidate pool (HybridSampler.ts). This file's only job is to produce
// that pool.
import { runFailureCollectionSession, type CollectionSessionResult } from "../failureAnalysis/failureAnalysisEngine";
import { loadDatabase, allSnapshots } from "../failureAnalysis/failureDatabase";

export interface CollectionResult extends CollectionSessionResult {
  elapsedMs: number;
}

export function collectNewReplays(numScrambles: number, stagingDbPath: string): CollectionResult {
  const t0 = Date.now();
  const result: CollectionSessionResult =
    numScrambles > 0 ? runFailureCollectionSession(numScrambles, stagingDbPath) : { scramblesRun: 0, newFailures: 0, totalFailuresInDb: allSnapshots(loadDatabase(stagingDbPath)).length };
  return { ...result, elapsedMs: Date.now() - t0 };
}
