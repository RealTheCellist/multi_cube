// Standalone driver for the Failure Analysis Engine -- run with:
//   npx tsx src/customCube/runFailureAnalysis.ts [numScrambles] [dbPath] [reportPath]
import { writeFileSync } from "node:fs";
import { runFailureCollectionSession } from "./failureAnalysis/failureAnalysisEngine";
import { allSnapshots, loadDatabase } from "./failureAnalysis/failureDatabase";
import { generateReport } from "./failureAnalysis/reportGenerator";

const numScrambles = Number(process.argv[2] ?? 30);
const dbPath = process.argv[3] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = process.argv[4] ?? "src/customCube/failureAnalysis/data/latest-report.txt";

const result = runFailureCollectionSession(numScrambles, dbPath);
console.log(`scrambles run: ${result.scramblesRun}`);
console.log(`new failures collected: ${result.newFailures}`);
console.log(`total failures in db: ${result.totalFailuresInDb}`);
console.log();

const db = loadDatabase(dbPath);
const report = generateReport(allSnapshots(db));
console.log(report);
writeFileSync(reportPath, report, "utf-8");
