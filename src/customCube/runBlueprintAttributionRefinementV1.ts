// Solver Primitive Discovery Sprint #4 -- Blueprint Attribution Refinement
// Sprint v1 -- driver.
//   npx tsx src/customCube/runBlueprintAttributionRefinementV1.ts
//
// Pure post-hoc analysis over Discovery Sprint #4's own already-computed
// results (blueprintMappings/clustering, cited unmodified) plus a fresh,
// fast (no solve() calls) structural-feature pass over the same 142-case
// raw dataset already on disk. Disambiguates the 28 AMBIGUOUS clusters
// down to a single Primary Attribution each -- does not design or
// implement any new Primitive.
import * as fs from "fs";
import { loadDiscovery4Result, extractAmbiguousClusters } from "./blueprintAttributionRefinementV1/AmbiguousClusterExtraction";
import { computeGlobalSpecificity } from "./blueprintAttributionRefinementV1/GlobalSpecificityAnalysis";
import { resolveAllClusters, MARGIN_THRESHOLD } from "./blueprintAttributionRefinementV1/CounterfactualAttribution";
import { buildOverlapMatrix, renderOverlapMatrixTable } from "./blueprintAttributionRefinementV1/OverlapMatrix";
import { computeBlueprintPriority } from "./blueprintAttributionRefinementV1/BlueprintPriority";
import { buildRefinementOpportunityMap, renderOpportunityMapTable } from "./blueprintAttributionRefinementV1/PrimitiveRefinementOpportunityMap";
import { BLUEPRINT_GATES } from "./blueprintAttributionRefinementV1/BlueprintGateDefinitions";

const DATA_DIR = "src/customCube/blueprintAttributionRefinementV1/data";
const REPORT_PATH = `${DATA_DIR}/blueprint-attribution-refinement-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/blueprint-attribution-refinement-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const discovery4 = loadDiscovery4Result();
  const totalPopulation = discovery4.blueprintMappings.reduce((s, m) => s + m.size, 0);

  console.log("STEP1: extracting AMBIGUOUS clusters...");
  const ambiguousClusters = extractAmbiguousClusters(discovery4);
  console.log(`  ${ambiguousClusters.length} ambiguous clusters, ${ambiguousClusters.reduce((s, c) => s + c.size, 0)} cases`);

  console.log("STEP2: computing global specificity per Blueprint over the full population...");
  const specificities = computeGlobalSpecificity(totalPopulation);
  for (const s of specificities) console.log(`  ${s.name}: globalMatchRate=${(s.globalMatchRate * 100).toFixed(1)}%, specificity=${s.specificity.toFixed(3)}, conditions=${s.conditionCount}`);

  console.log("STEP3: counterfactual attribution (specificity-ranked resolution)...");
  const resolutions = resolveAllClusters(ambiguousClusters, specificities);
  const marginalCount = resolutions.filter((r) => r.marginal).length;
  console.log(`  resolved ${resolutions.length}/${ambiguousClusters.length}, marginal(<${MARGIN_THRESHOLD} specificity gap)=${marginalCount}`);

  console.log("STEP4: building Overlap Matrix...");
  const overlapMatrix = buildOverlapMatrix(ambiguousClusters, resolutions);
  const blueprintNames = BLUEPRINT_GATES.map((g) => g.name);

  console.log("STEP5: Blueprint Priority...");
  const priority = computeBlueprintPriority(discovery4.blueprintMappings, resolutions);
  for (const p of priority) console.log(`  ${p.blueprint}: ${p.caseCount} cases (${p.clusterCount} clusters; ${p.fromUnambiguous} unambiguous + ${p.fromResolvedAmbiguous} resolved)`);

  console.log("STEP6: Primitive Refinement Opportunity Map...");
  const opportunityMap = buildRefinementOpportunityMap(discovery4.blueprintMappings, resolutions, priority);

  // Success criteria + Decision
  const level1 = resolutions.length === ambiguousClusters.length; // all 28 attributed (marginal or not)
  const level2 = priority.length > 0; // Blueprint priority produced
  const level3 = opportunityMap.length > 0; // next Primitive Refinement target identified
  const confidentResolutions = resolutions.length - marginalCount;
  const confidentFraction = resolutions.length ? confidentResolutions / resolutions.length : 0;

  let decision: "A" | "B" | "C";
  if (confidentFraction >= 0.8) decision = "A";
  else if (confidentFraction >= 0.4) decision = "B";
  else decision = "C";

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Primitive Discovery Sprint #4 -- Blueprint Attribution Refinement Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: ${totalPopulation} cases (Discovery Sprint #4의 49개 클러스터 재사용, 재측정 없음)`);
  push();

  push("STEP1. Ambiguous Cluster 추출");
  push(`  AMBIGUOUS 클러스터: ${ambiguousClusters.length}개, 총 ${ambiguousClusters.reduce((s, c) => s + c.size, 0)}건`);
  push();

  push("STEP2. Blueprint별 Global Specificity (전체 142-population 기준)");
  for (const s of specificities) {
    push(`  ${s.name}: globalMatchRate=${(s.globalMatchRate * 100).toFixed(1)}%(${s.globalMatchCount}/${totalPopulation}), specificity=${s.specificity.toFixed(3)}, 조건 수=${s.conditionCount}`);
    for (const c of s.conditionRestrictiveness) {
      push(`    Gate 제거 시["${c.conditionName}"]: matchRate ${(s.globalMatchRate * 100).toFixed(1)}% -> ${(c.ablatedMatchRate * 100).toFixed(1)}% (restrictiveness=${c.restrictiveness.toFixed(3)})`);
    }
  }
  push();

  push("STEP3. Counterfactual Attribution (Specificity 기반 Primary Attribution 결정)");
  for (const r of resolutions) {
    push(`  [${r.clusterKey}] n=${r.size}`);
    push(`    Tied: ${r.tiedBlueprints.join(", ")}`);
    push(`    Ranked: ${r.ranked.map((x) => `${x.name}(spec=${x.specificity.toFixed(3)})`).join(" > ")}`);
    push(`    Primary Attribution: ${r.primaryAttribution}${r.marginal ? ` [MARGINAL -- margin=${r.margin?.toFixed(3)} vs runner-up ${r.runnerUp}]` : ""}`);
  }
  push();

  push("STEP4. Overlap Matrix");
  push(renderOverlapMatrixTable(overlapMatrix, blueprintNames));
  push();

  push("STEP5. Blueprint Priority");
  for (const p of priority) {
    push(`  ${p.blueprint}: ${p.caseCount} (기존 확정 ${p.fromUnambiguous} + 이번에 해소 ${p.fromResolvedAmbiguous}), ${p.clusterCount}개 클러스터`);
  }
  push();

  push("STEP6. Primitive Refinement Opportunity Map");
  push(renderOpportunityMapTable(opportunityMap));
  push();

  push("성공 기준");
  push(`  Level1(28개 Cluster 전부 Attribution 완료): ${level1 ? "PASS" : "FAIL"} (${resolutions.length}/${ambiguousClusters.length})`);
  push(`  Level2(Blueprint 우선순위 확정): ${level2 ? "PASS" : "FAIL"}`);
  push(`  Level3(다음 Primitive Refinement 대상 확정): ${level3 ? "PASS" : "FAIL"}`);
  push(`  확신도(marginal 아닌 비율): ${confidentResolutions}/${resolutions.length} (${(confidentFraction * 100).toFixed(1)}%)`);
  push(`  Decision: ${decision}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      { ambiguousClusters, specificities, resolutions, overlapMatrix, priority, opportunityMap, levels: { level1, level2, level3 }, confidentFraction, decision },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

main();
