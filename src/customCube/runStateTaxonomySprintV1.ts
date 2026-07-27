// --- runStateTaxonomySprintV1 (Solver Completeness Achievement Program,
// Phase 2 STEP1: Structural State Classification) -------------------------
// Fast, in-memory driver -- no long simulation needed. Consumes the
// already-computed Coverage Hole Discovery Sprint v1 result JSON.
import * as fs from "fs";
import { assignTaxonomy, summarizeTaxonomy, UNCONFIRMABLE_DIRECTIVE_CATEGORIES } from "./stateTaxonomy/TaxonomyMapper";
import type { DeadStateCluster } from "./coverageAtlas/DeadStateClusterAnalysis";

const INPUT_PATH = "src/customCube/coverageAtlas/data/coverage-hole-discovery-v1-result.json";
const REPORT_PATH = "src/customCube/stateTaxonomy/data/state-taxonomy-v1-report.txt";
const RESULT_JSON_PATH = "src/customCube/stateTaxonomy/data/state-taxonomy-v1-result.json";

function main() {
  const input = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"));
  const clusters: DeadStateCluster[] = input.clusters;

  const assignments = assignTaxonomy(clusters);
  const summary = summarizeTaxonomy(assignments);

  const lines: string[] = [];
  lines.push("State Taxonomy Sprint v1 -- Report (Solver Completeness Achievement Program, Phase 2 STEP1)");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: ${INPUT_PATH} (Coverage Hole Discovery Sprint v1, 142-case Hole Dataset, 20 Dead State Clusters)`);
  lines.push("");
  lines.push("1. Taxonomy Class summary (consolidated from 20 raw feature-clusters)");
  for (const row of summary) {
    lines.push(
      `  ${row.label}: ${row.totalCases}/142 cases (${(row.share * 100).toFixed(1)}%) across ${row.clusterCount} cluster(s), anyPrimitiveApplicable=${row.anyPrimitiveApplicableCount}/${row.totalCases} (${(row.anyPrimitiveApplicableShare * 100).toFixed(1)}%)`
    );
  }
  lines.push("");

  lines.push("2. Per-cluster assignment");
  for (const a of assignments) {
    lines.push(`  [${a.size} cases] ${a.taxonomyClass} <- "${a.mechanismLabel}" (key=${a.clusterKey})`);
  }
  lines.push("");

  lines.push("3. Directive-named categories NOT confirmable from this dataset");
  for (const cat of UNCONFIRMABLE_DIRECTIVE_CATEGORIES) {
    lines.push(`  ${cat.name}: ${cat.reason}`);
  }
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync("src/customCube/stateTaxonomy/data", { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(RESULT_JSON_PATH, JSON.stringify({ assignments, summary }, null, 2), "utf-8");
  console.log(report);
  console.log(`Report written to ${REPORT_PATH}`);
}

main();
