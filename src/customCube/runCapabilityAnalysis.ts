// Standalone driver for the Capability Analysis Engine -- runs against the
// EXISTING failure database (see runFailureAnalysis.ts to grow it further).
//   npx tsx src/customCube/runCapabilityAnalysis.ts [dbPath] [reportPath]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { allSnapshots, loadDatabase } from "./failureAnalysis/failureDatabase";
import { runCapabilityAnalysis } from "./capabilityAnalysis/capabilityAnalysisEngine";
import { generateCapabilityReport } from "./capabilityAnalysis/capabilityReportGenerator";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = process.argv[3] ?? "src/customCube/capabilityAnalysis/data/capability-report.txt";

const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const result = runCapabilityAnalysis(snapshots);
const report = generateCapabilityReport(result);
console.log(report);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report, "utf-8");
