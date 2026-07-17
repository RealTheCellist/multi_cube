// --- BenchmarkRunner (Algorithm Experiment Framework v1) --------------------
// Loads the Failure Replay Dataset (the EXISTING Failure Analysis Engine's
// FailureDatabase, unmodified -- see failureAnalysis/failureDatabase.ts)
// and runs every registered Experiment against every snapshot in it, in a
// fixed order (spec: "순서는 항상 동일해야 한다" -- iterates
// allSnapshots(db) in whatever stable order Object.values gives, which is
// insertion order for a JSON-parsed object, i.e. collection order).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase, type FailureDatabase } from "../failureAnalysis/failureDatabase";
import { runFailureCollectionSession } from "../failureAnalysis/failureAnalysisEngine";
import { analyzeEdgeSlots } from "../fiveByFiveHumanEdges";
import type { ExperimentContext } from "./ExperimentContext";
import { runExperiments, type RunOutcome } from "./ExperimentRunner";
import type { ExperimentRegistry } from "./ExperimentRegistry";

export interface BenchmarkOptions {
  dbPath: string;
  datasetSize: number;
  // If the stored dataset has fewer snapshots than requested, auto-grow it
  // by calling the Failure Analysis Engine's OWN existing, unmodified
  // collection function (never a new collector built here) -- one
  // scramble does not reliably yield exactly one new failure, so this
  // scrambles somewhat more than the raw shortfall to make reaching
  // `datasetSize` likely without needing several manual re-runs.
  autoGrow?: boolean;
}

export interface ContextRunResult {
  snapshotHash: string;
  outcomes: RunOutcome[];
}

export interface BenchmarkResult {
  datasetSize: number;
  results: ContextRunResult[];
}

function pairCountOf(cubies: ReturnType<typeof deserializeCube>): number {
  return analyzeEdgeSlots(cubies).filter((s) => s.pairedCount === 2).length;
}

export function runBenchmark(registry: ExperimentRegistry, options: BenchmarkOptions): BenchmarkResult {
  let db: FailureDatabase = loadDatabase(options.dbPath);
  let snapshots = allSnapshots(db);

  if (options.autoGrow && snapshots.length < options.datasetSize) {
    const shortfall = options.datasetSize - snapshots.length;
    // Heuristic multiplier (this session's own collection runs typically
    // yielded ~3-4 new failures per scramble) -- not exact, just avoids
    // needing to re-invoke this repeatedly for a modest shortfall.
    runFailureCollectionSession(Math.max(5, Math.ceil(shortfall / 3)), options.dbPath);
    db = loadDatabase(options.dbPath);
    snapshots = allSnapshots(db);
  }

  const dataset = snapshots.slice(0, options.datasetSize);
  const results: ContextRunResult[] = [];

  for (const snapshot of dataset) {
    const cubies = deserializeCube(snapshot.cubeState);
    const context: ExperimentContext = {
      failureSnapshot: snapshot,
      cubies,
      wrongWingCount: snapshot.wrongWingCount,
      pairCount: pairCountOf(cubies),
      parity: snapshot.parity,
      metadata: { hash: snapshot.hash, timestamp: snapshot.timestamp },
    };
    results.push({ snapshotHash: snapshot.hash, outcomes: runExperiments(context, registry) });
  }

  return { datasetSize: dataset.length, results };
}
