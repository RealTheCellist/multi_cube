// Novel Low-Footprint Move Existence Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runNovelLowFootprintMoveExistenceValidationSprintV1.ts
//
// Research/Validation Sprint (NOT an implementation -- no new Primitive, no
// Prototype, never wired into Recovery/Executor/Planner): answers ONE
// question -- does a low-footprint move exist for PURE_CYCLE_ISOLATION at
// all, independent of enumerateWingCandidates()? Tests a genuine 4-part
// bracket commutator [A,B,A',B'] of two independently-conjugated copies of
// BASE_ALG/FLIP_ALG/PARITY_ALG (never tried anywhere in this research arc --
// distinct from Move Representation Prototype Sprint v1's single
// conjugation, which only relocates footprint, never cancels it).
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { measureIntrinsicFootprints } from "./novelLowFootprintMoveExistence/BaseAlgIntrinsicFootprint";
import { searchTrueCommutators, type CommutatorSearchResult } from "./novelLowFootprintMoveExistence/TrueCommutatorSearch";
import { buildCatalog } from "./novelLowFootprintMoveExistence/MinimalFootprintCatalog";
import { summarizeDistribution, FOOTPRINT_RATIO_TARGET } from "./novelLowFootprintMoveExistence/MinimalFootprintDistribution";
import { checkExistingGeneratorCoverage } from "./novelLowFootprintMoveExistence/ExistingGeneratorCoverageCheck";
import { classifyStructures } from "./novelLowFootprintMoveExistence/StructureClassification";
import { assessBlueprintFeasibility } from "./novelLowFootprintMoveExistence/BlueprintFeasibilityAssessment";

const DATA_DIR = "src/customCube/novelLowFootprintMoveExistence/data";
const REPORT_PATH = `${DATA_DIR}/novel-low-footprint-move-existence-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/novel-low-footprint-move-existence-v1-result.json`;
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-existence.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadCheckpoint(): { completedLabels: string[]; rows: CommutatorSearchResult[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedLabels: string[], rows: CommutatorSearchResult[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

async function main() {
  log("init", "measuring BASE_ALG/FLIP_ALG/PARITY_ALG intrinsic footprint...");
  const intrinsic = measureIntrinsicFootprints();
  for (const f of intrinsic) log("init", `  ${f.name}: moveLength=${f.moveLength}, affectedWingCount=${f.affectedWingCount}`);

  const holes = loadRawHoleDataset();
  const holesByLabel = new Map(holes.map((h) => [h.label, h]));

  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string; profile: { cycleLength: number } }[] = priorResult.residualClassified;
  const primary = residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION");
  log("init", `PRIMARY (PURE_CYCLE_ISOLATION) = ${primary.length} cases`);

  let { completedLabels, rows } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("search", `resuming: ${completedLabels.length}/${primary.length} done`);

  for (const p of primary) {
    if (completedSet.has(p.label)) continue;
    const hole = holesByLabel.get(p.label);
    if (!hole) {
      log("search", `WARNING: ${p.label} not found in raw hole dataset, skipping`);
      completedLabels.push(p.label);
      completedSet.add(p.label);
      continue;
    }
    const clone = cloneCubies(hole.cubies as Cubie[]);
    const t0 = Date.now();
    const result = searchTrueCommutators(clone, p.label, p.profile.cycleLength);
    const elapsed = Date.now() - t0;
    log("search", `${p.label}: cycleLength=${p.profile.cycleLength}, attempts=${result.attemptsEvaluated}, improvingCount=${result.improvingCount}, best.affectedWingCount=${result.best?.affectedWingCount ?? "N/A"}, ${elapsed}ms`);
    rows.push(result);
    completedLabels.push(p.label);
    completedSet.add(p.label);
    saveCheckpoint(completedLabels, rows);
  }
  log("search", "done");

  const catalog = buildCatalog(rows);
  const distribution = summarizeDistribution(catalog);
  const coverageFacts = checkExistingGeneratorCoverage();
  const structure = classifyStructures(catalog);
  const feasibility = assessBlueprintFeasibility(distribution, structure);

  const lines: string[] = [];
  lines.push("Novel Low-Footprint Move Existence Validation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("0. BASE_ALG/FLIP_ALG/PARITY_ALG Intrinsic Footprint (RQ-3 groundwork)");
  for (const f of intrinsic) lines.push(`  ${f.name}: moveLength=${f.moveLength}, affectedWingCount=${f.affectedWingCount}`);
  lines.push("");

  lines.push("1. Low-Footprint Move Catalog (per case, best bracket-commutator found)");
  for (const c of catalog) {
    lines.push(
      `  ${c.label}: cycleLength=${c.cycleLength}, found=${c.found}, bestAffectedWingCount=${c.bestAffectedWingCount ?? "N/A"}, bestFootprintRatio=${
        c.bestFootprintRatio !== null ? c.bestFootprintRatio.toFixed(2) : "N/A"
      }, bestKnownPattern=${c.bestKnownPattern ?? "N/A"}, improvingCount=${c.improvingCount}/${c.attemptsEvaluated}`
    );
  }
  lines.push("");

  lines.push("2. Minimal Footprint Distribution");
  lines.push(`  n=${distribution.n}, foundCount=${distribution.foundCount} (${(distribution.foundRate * 100).toFixed(1)}%)`);
  lines.push(
    `  avgBestFootprintRatio=${distribution.avgBestFootprintRatio?.toFixed(2) ?? "N/A"}, medianBestFootprintRatio=${
      distribution.medianBestFootprintRatio?.toFixed(2) ?? "N/A"
    }, min=${distribution.minBestFootprintRatio?.toFixed(2) ?? "N/A"}, max=${distribution.maxBestFootprintRatio?.toFixed(2) ?? "N/A"}`
  );
  lines.push(
    `  lowFootprintAchieved(footprintRatio<=${FOOTPRINT_RATIO_TARGET}): ${distribution.lowFootprintAchievedCount}/${distribution.foundCount} found (${(
      distribution.lowFootprintAchievedRate * 100
    ).toFixed(1)}% of found)`
  );
  lines.push("  by cycleLength:");
  for (const b of distribution.byCycleLength) lines.push(`    cycleLength=${b.cycleLength}: n=${b.n}, foundCount=${b.foundCount}`);
  lines.push("");

  lines.push("3. Existing Generator Coverage Check (RQ-3, structural)");
  for (const f of coverageFacts) lines.push(`  [${f.verified ? "VERIFIED" : "UNVERIFIED"}] ${f.claim}\n    via: ${f.verificationMethod}`);
  lines.push("");

  lines.push("4. Structure Classification (RQ-4)");
  for (const t of structure.tally) lines.push(`  ${t.structureLabel}: ${t.count}`);
  lines.push(`  dominantLabel=${structure.dominantLabel ?? "N/A"}, dominantShare=${structure.dominantShare !== null ? (structure.dominantShare * 100).toFixed(1) + "%" : "N/A"}`);
  lines.push("");

  lines.push("5. Blueprint Feasibility Assessment");
  lines.push(`  decision: ${feasibility.decision}`);
  lines.push(`  decisionLabel: ${feasibility.decisionLabel}`);
  lines.push(`  existenceConfirmed=${feasibility.existenceConfirmed}, lowFootprintAchievedCount=${feasibility.lowFootprintAchievedCount}, structureDominant=${feasibility.structureDominant}`);
  lines.push(`  rationale: ${feasibility.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ intrinsic, catalog, distribution, coverageFacts, structure, feasibility }, null, 2),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
