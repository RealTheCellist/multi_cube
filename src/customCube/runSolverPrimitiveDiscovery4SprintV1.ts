// Solver Primitive Discovery Sprint #4 -- State Taxonomy Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverPrimitiveDiscovery4SprintV1.ts
//
// STEP1 (expensive, ~60s/case per this arc's own prior measurement,
// checkpointed/resumable) regenerates the Hole Dataset against the
// CURRENT Release production solver. STEP2 (one endToEndSolveProbe() call
// per Hole, fast) attributes each Hole to an existing mechanism or
// confirms none applies. STEP3-6 are pure in-memory feature extraction/
// clustering/mapping over the Completely-Unknown subset -- no solve()
// calls, near-instant.
import * as fs from "fs";
import * as path from "path";
import { serializeCube, deserializeCube } from "./failureAnalysis/cubeSerialization";
import { buildLibs, selectHoleDiscoveryInputCases, buildHoleCase, enrichWithFailureModes, summarizeFailureModes, type HoleCase, type HoleCaseV4 } from "./solverPrimitiveDiscovery4/HoleCollectionV4";
import { attributeAllHoles, summarizeAttribution } from "./solverPrimitiveDiscovery4/PrimitiveAttributionV4";
import { extractAllFeatures } from "./solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import { compareClusterings } from "./solverPrimitiveDiscovery4/ClusteringV4";
import { mapAllClusters } from "./solverPrimitiveDiscovery4/BlueprintMappingV4";
import { buildOpportunityMap, renderOpportunityMapTable, summarizeOpportunities } from "./solverPrimitiveDiscovery4/PrimitiveOpportunityMapV4";

const DATA_DIR = "src/customCube/solverPrimitiveDiscovery4/data";
const STEP1_CHECKPOINT = path.join(DATA_DIR, "checkpoint-step1-holes.json");
const RAW_DATASET_PATH = path.join(DATA_DIR, "raw-dataset-v4-holes.json");
const REPORT_PATH = path.join(DATA_DIR, "solver-primitive-discovery-4-v1-report.txt");
const RESULT_JSON_PATH = path.join(DATA_DIR, "solver-primitive-discovery-4-v1-result.json");
const FAILURES_DB_PATH = "src/customCube/failureAnalysis/data/failures.json";

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

interface SerializedHoleCase extends Omit<HoleCase, "cubies" | "originalCubies"> {
  cubiesJson: string;
  originalCubiesJson: string;
}

function toSerialized(hole: HoleCase): SerializedHoleCase {
  const { cubies, originalCubies, ...rest } = hole;
  return { ...rest, cubiesJson: serializeCube(cubies), originalCubiesJson: serializeCube(originalCubies) };
}

function fromSerialized(s: SerializedHoleCase): HoleCase {
  const { cubiesJson, originalCubiesJson, ...rest } = s;
  return { ...rest, cubies: deserializeCube(cubiesJson), originalCubies: deserializeCube(originalCubiesJson) };
}

function saveCheckpoint(completedLabels: string[], holes: SerializedHoleCase[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STEP1_CHECKPOINT, JSON.stringify({ completedLabels, holes }), "utf-8");
}

function loadCheckpoint(): { completedLabels: string[]; holes: SerializedHoleCase[] } {
  if (!fs.existsSync(STEP1_CHECKPOINT)) return { completedLabels: [], holes: [] };
  return JSON.parse(fs.readFileSync(STEP1_CHECKPOINT, "utf-8"));
}

async function runStep1(): Promise<HoleCase[]> {
  const inputCases = selectHoleDiscoveryInputCases(FAILURES_DB_PATH);
  log("step1", `input cases selected (same population as Coverage Hole Discovery Sprint v1): ${inputCases.length}`);
  const libs = buildLibs();

  let { completedLabels, holes } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("step1", `resuming from checkpoint: ${completedLabels.length}/${inputCases.length} done`);

  for (const c of inputCases) {
    if (completedSet.has(c.label)) continue;
    const hole = await buildHoleCase(c, libs);
    completedLabels.push(c.label);
    completedSet.add(c.label);
    if (hole) holes.push(toSerialized(hole));
    saveCheckpoint(completedLabels, holes);
    log("step1", `${completedLabels.length}/${inputCases.length} done (${holes.length} confirmed holes so far) -- ${c.label}: ${hole ? "HOLE (still stuck against CURRENT production)" : "not a hole (converged or crashed)"}`);
  }

  return holes.map(fromSerialized);
}

async function main() {
  log("init", "STEP1: Hole Dataset regeneration against CURRENT Release production starting...");
  const holes = await runStep1();
  log("step1", `done: ${holes.length}/${selectHoleDiscoveryInputCases(FAILURES_DB_PATH).length} confirmed still-stuck against current production`);
  fs.writeFileSync(RAW_DATASET_PATH, JSON.stringify(holes.map(toSerialized)), "utf-8");

  const holesV4: HoleCaseV4[] = enrichWithFailureModes(holes);
  const failureModeSummary = summarizeFailureModes(holesV4);
  log("step1", `failure modes: noProgress=${failureModeSummary.noProgressCount}, partialImprove=${failureModeSummary.partialImproveCount}, timeout=${failureModeSummary.timeoutCount}, plannerAbort=${failureModeSummary.plannerAbortCount}`);

  log("step2", "Existing Primitive Attribution (1 endToEndSolveProbe call/hole)...");
  const attributions = attributeAllHoles(holesV4);
  const attributionSummary = summarizeAttribution(attributions);
  log("step2", `done: Already=${attributionSummary.alreadyExplainedCount}, Partially=${attributionSummary.partiallyExplainedCount}, Unknown=${attributionSummary.completelyUnknownCount}`);

  const unknownLabels = new Set(attributions.filter((a) => a.tier === "COMPLETELY_UNKNOWN").map((a) => a.label));
  const unknownHoles = holesV4.filter((h) => unknownLabels.has(h.label));

  log("step3", `Structural Feature Extraction on ${unknownHoles.length} Completely-Unknown holes...`);
  const features = extractAllFeatures(unknownHoles);

  log("step4", "Clustering (Manual Taxonomy / Feature Similarity / Graph Structure)...");
  const clustering = compareClusterings(features);
  log("step4", `done: manualTaxonomy=${clustering.manualTaxonomy.length} clusters, featureSimilarity=${clustering.featureSimilarity.length} clusters, graphStructure=${clustering.graphStructure.length} clusters`);

  log("step5", "Existing Blueprint Mapping (Feature Similarity clusters)...");
  const blueprintMappings = mapAllClusters(clustering.featureSimilarity, features);

  log("step6", "Primitive Opportunity Map...");
  const opportunityRows = buildOpportunityMap(blueprintMappings);
  const opportunitySummary = summarizeOpportunities(blueprintMappings);

  // Success criteria + Decision
  const level1 = holes.length > 0; // Hole State reproducibly collected
  const level2 = unknownHoles.length >= 1; // >=1 Unknown cluster/case exists
  const level3 = opportunitySummary.newMechanismClusterCount > 0 || opportunitySummary.variantClusterCount > 0; // a Blueprint candidate (new or extension) can be derived
  let decision: "A" | "B" | "C";
  if (opportunitySummary.newMechanismClusterCount > 0) decision = "A";
  else if (opportunitySummary.variantClusterCount > 0) decision = "B";
  else decision = "C";

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Primitive Discovery Sprint #4 -- State Taxonomy Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Input population: ${selectHoleDiscoveryInputCases(FAILURES_DB_PATH).length} cases (same selection as Coverage Hole Discovery Sprint v1's own 142-case population)`);
  push();

  push("STEP1. Hole Dataset Regeneration (against CURRENT Release production)");
  push(`  Confirmed Hole cases (still stuck): ${holes.length}`);
  push(`  Failure modes -- noProgress(solve 실패)=${failureModeSummary.noProgressCount}, partialImprove=${failureModeSummary.partialImproveCount}, timeout=${failureModeSummary.timeoutCount}, plannerAbort=${failureModeSummary.plannerAbortCount}`);
  push();

  push("STEP2. Existing Primitive Attribution (real solve() trace, 1 additional call per Hole)");
  push(`  Already Explained=${attributionSummary.alreadyExplainedCount}, Partially Explained=${attributionSummary.partiallyExplainedCount}, Completely Unknown=${attributionSummary.completelyUnknownCount}`);
  push("  Mechanism frequency (Directive-naming reconciled):");
  for (const [m, count] of Object.entries(attributionSummary.mechanismFrequency).sort((a, b) => b[1] - a[1])) {
    push(`    ${m}: ${count}`);
  }
  push();

  push(`STEP3. Structural Feature Extraction (${unknownHoles.length} Completely-Unknown holes)`);
  push(`  Features extracted: wrongWingCount, pairCount, cycleCount, cycleLength, componentCount, conflictEdgeCount, swapEdgeCount, mutualLockCount, bridgeCount, disconnectedGraph, parityState, deferredViolation, taxonomyClass`);
  push();

  push("STEP4. Clustering comparison (Manual Taxonomy vs Feature Similarity vs Graph Structure)");
  push(`  Manual Taxonomy: ${clustering.manualTaxonomy.length} clusters`);
  for (const c of clustering.manualTaxonomy) push(`    [${c.key}] n=${c.size}`);
  push(`  Feature Similarity: ${clustering.featureSimilarity.length} clusters`);
  for (const c of clustering.featureSimilarity) push(`    [${c.key}] n=${c.size}`);
  push(`  Graph Structure: ${clustering.graphStructure.length} clusters`);
  for (const c of clustering.graphStructure) push(`    [${c.key}] n=${c.size}`);
  push();

  push("STEP5. Existing Blueprint Mapping (per Feature-Similarity cluster)");
  for (const m of blueprintMappings) {
    push(`  [${m.clusterKey}] n=${m.size} -- verdict=${m.verdict}, bestMatch=${m.bestMatch ?? "none"}(${(m.bestMatchRate * 100).toFixed(0)}%)`);
  }
  push();

  push("STEP6. Primitive Opportunity Map");
  push(renderOpportunityMapTable(opportunityRows));
  push();
  push(`  Clusters: total=${opportunitySummary.totalClusters}, new-mechanism=${opportunitySummary.newMechanismClusterCount}(${opportunitySummary.newMechanismCaseCount} cases), variant-of-existing=${opportunitySummary.variantClusterCount}, ambiguous=${opportunitySummary.ambiguousClusterCount}`);
  push();

  push("Success Criteria");
  push(`  Level1(Hole State 재현 가능하게 수집): ${level1 ? "PASS" : "FAIL"} (${holes.length}건)`);
  push(`  Level2(Unknown Cluster >=1개): ${level2 ? "PASS" : "FAIL"} (${unknownHoles.length}건 Unknown, ${clustering.featureSimilarity.length}개 클러스터)`);
  push(`  Level3(Primitive Blueprint 후보 도출 가능): ${level3 ? "PASS" : "FAIL"}`);
  push(`  Decision: ${decision}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        holeCount: holes.length,
        failureModeSummary,
        attributionSummary,
        unknownCount: unknownHoles.length,
        clustering,
        blueprintMappings,
        opportunityRows,
        opportunitySummary,
        levels: { level1, level2, level3 },
        decision,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(lines.join("\n"));

  if (fs.existsSync(STEP1_CHECKPOINT)) fs.unlinkSync(STEP1_CHECKPOINT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
