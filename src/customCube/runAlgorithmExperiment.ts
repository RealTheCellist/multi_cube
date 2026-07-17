// Standalone driver for the Algorithm Experiment Framework -- run with:
//   npx tsx src/customCube/runAlgorithmExperiment.ts [datasetSize] [dbPath] [reportPath]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ExperimentRegistry } from "./algorithmExperiment/ExperimentRegistry";
import { ExistingSolverExperiment } from "./algorithmExperiment/experiments/ExistingSolverExperiment";
import { EmptyExperiment } from "./algorithmExperiment/experiments/EmptyExperiment";
import { runBenchmark } from "./algorithmExperiment/BenchmarkRunner";
import { verifyDeterminism } from "./algorithmExperiment/ExperimentRunner";
import { generateReport } from "./algorithmExperiment/ExperimentReport";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "./failureAnalysis/failureDatabase";
import { analyzeEdgeSlots } from "./fiveByFiveHumanEdges";
import type { ExperimentContext } from "./algorithmExperiment/ExperimentContext";

const datasetSize = Number(process.argv[2] ?? 75);
const dbPath = process.argv[3] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = process.argv[4] ?? "src/customCube/algorithmExperiment/data/experiment-report.txt";

const registry = new ExperimentRegistry();
registry.register(new ExistingSolverExperiment());
registry.register(new EmptyExperiment());

const benchmark = runBenchmark(registry, { dbPath, datasetSize, autoGrow: true });
console.log(`Replay Dataset 실행 완료: ${benchmark.datasetSize}건 (요청 ${datasetSize}건)`);

// 결정성 검증 (spec: 동일 Replay 3회 반복, 3회 모두 동일해야 함) -- 첫 3개
// 스냅샷에 대해 각 실험을 검증한다.
const db = loadDatabase(dbPath);
const sampleSnapshots = allSnapshots(db).slice(0, 3);
const determinismChecks = [];
for (const snapshot of sampleSnapshots) {
  const cubies = deserializeCube(snapshot.cubeState);
  const context: ExperimentContext = {
    failureSnapshot: snapshot,
    cubies,
    wrongWingCount: snapshot.wrongWingCount,
    pairCount: analyzeEdgeSlots(cubies).filter((s) => s.pairedCount === 2).length,
    parity: snapshot.parity,
    metadata: { hash: snapshot.hash, timestamp: snapshot.timestamp },
  };
  for (const experiment of registry.all()) {
    determinismChecks.push(verifyDeterminism(experiment, context));
  }
}

for (const check of determinismChecks) {
  console.log(`결정성 검증 [${check.experimentName}]: ${check.deterministic ? "PASS" : "FAIL"}`);
}

const report = generateReport(benchmark, determinismChecks);
console.log();
console.log(report);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report, "utf-8");
