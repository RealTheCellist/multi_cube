// Standalone driver for the Primitive Discovery Engine -- runs against the
// EXISTING failure database (see runFailureAnalysis.ts to grow it further).
//   npx tsx src/customCube/runPrimitiveDiscovery.ts [dbPath] [reportPath]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { allSnapshots, loadDatabase } from "./failureAnalysis/failureDatabase";
import { generateResearchReport } from "./primitiveDiscovery/researchReportGenerator";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = process.argv[3] ?? "src/customCube/primitiveDiscovery/data/research-report.txt";

const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const report = generateResearchReport(snapshots);
console.log(report);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report, "utf-8");
