// --- runPlannerSchedulingInvestigationSprintV1 (Planner Scheduling
// Investigation Sprint v1) -------------------------------------------------
// Fast, in-memory driver -- no new simulation needed, purely analyzes data
// already captured in the regenerated raw-dataset-v1-holes.json (including
// the Recovery-trigger telemetry added specifically for this Sprint).
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import {
  analyzeAllReachableUnexploited,
  summarizeReachableUnexploited,
  FAILURE_MODE_RECOMMENDATIONS,
} from "./plannerInvestigation/ReachableUnexploitedAnalysis";

const DATA_DIR = "src/customCube/plannerInvestigation/data";
const REPORT_PATH = `${DATA_DIR}/planner-investigation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/planner-investigation-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const holes = loadRawHoleDataset();
  console.log(`Loaded ${holes.length} holes.`);

  const analyses = analyzeAllReachableUnexploited(holes);
  const summary = summarizeReachableUnexploited(analyses);

  const lines: string[] = [];
  lines.push("Planner Scheduling Investigation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Reachable-but-Unexploited population: ${summary.totalCases}/${holes.length}`);
  lines.push("");
  lines.push("Failure Mode breakdown:");
  for (const [mode, count] of Object.entries(summary.failureModeCounts)) {
    if (count === 0) continue;
    lines.push(`  ${mode}: ${count}/${summary.totalCases}`);
    lines.push(`    -> ${FAILURE_MODE_RECOMMENDATIONS[mode as keyof typeof FAILURE_MODE_RECOMMENDATIONS]}`);
  }
  lines.push("");
  lines.push("Per-case detail:");
  for (const a of analyses) {
    lines.push(
      `  ${a.label}: mode=${a.failureMode}, succeeded=[${a.succeededPrimitives.join(",")}], recoveryTriggered=${a.wingPairingRecoveryTriggeredCount}/${a.wingPairingIterations}, budgetViolations=${a.wingPairingBudgetViolations}`
    );
  }

  const report = lines.join("\n");
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(RESULT_JSON_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), summary, analyses }, null, 2), "utf-8");
  console.log(report);
  console.log(`Report written to ${REPORT_PATH}`);
}

main();
