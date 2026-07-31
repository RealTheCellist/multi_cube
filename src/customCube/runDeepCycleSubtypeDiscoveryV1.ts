// Solver Primitive Discovery Sprint -- Deep Cycle Subtype Discovery Sprint
// v1 -- driver.
//   npx tsx src/customCube/runDeepCycleSubtypeDiscoveryV1.ts
//
// Naming disclosure: the user's own directive titled this
// "Solver Primitive Discovery Sprint #4 -- Deep Cycle Subtype Discovery
// Sprint v1", reusing the "#4" label already used earlier in this arc for
// the broader State Taxonomy Sprint v1 (src/customCube/solverPrimitiveDiscovery4/,
// which covered the FULL 142-case Hole Dataset, not just Deep Cycle's 30
// cases). To avoid confusion with that unrelated, already-complete Sprint,
// this driver/directory uses the distinct name
// "deepCycleSubtypeDiscoveryV1" while keeping the user's own Sprint title
// in the doc header.
//
// Question: is the 30-case Deep Cycle Primary Cluster (Blueprint
// Attribution Refinement Sprint v1's own output) one homogeneous
// mechanism, or does it secretly contain 2+ structurally AND
// behaviorally distinct subtypes? No new Primitive, no Gate/Search
// change to BoundedResolver.ts -- read-only structural + behavioral
// analysis only.
import * as fs from "fs";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { loadTargetPopulation, splitPopulation } from "./deepCycleRefinementV1/TargetPopulation";
import { extractAllExtendedFeatures } from "./deepCycleSubtypeDiscoveryV1/ExtendedFeatureExtraction";
import { clusterByStructuralTaxonomy, clusterByFeatureSimilarity, clusterByGraphTopology, pairwiseAgreement, type Cluster } from "./deepCycleSubtypeDiscoveryV1/ClusteringMethods";
import { computeAllRescueProfiles } from "./deepCycleSubtypeDiscoveryV1/BehavioralProfiling";
import { summarizeClusterBehavior, computeBehavioralDivergence } from "./deepCycleSubtypeDiscoveryV1/SubtypeStabilityAnalysis";
import { decideSubtype } from "./deepCycleSubtypeDiscoveryV1/SubtypeDecision";

const DATA_DIR = "src/customCube/deepCycleSubtypeDiscoveryV1/data";
const REPORT_PATH = `${DATA_DIR}/deep-cycle-subtype-discovery-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/deep-cycle-subtype-discovery-v1-result.json`;

function renderClusters(clusters: readonly Cluster[]): string[] {
  return clusters.map((c) => `    [${c.key}] size=${c.memberLabels.length}`);
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lib = buildWingLibrary();

  console.log("Loading Deep Cycle Primary Cluster (30 cases, from Blueprint Attribution Refinement Sprint v1's own resolved output, unmodified)...");
  const allCases = loadTargetPopulation();
  const { target } = splitPopulation(allCases);
  console.log(`  target(Deep Cycle Primary Cluster)=${target.length}`);

  console.log("STEP1: Extended Feature Extraction (graph topology + reused structural features)...");
  const features = extractAllExtendedFeatures(target);
  console.log(`  extracted ${features.length} feature sets`);

  console.log("STEP2: Clustering (3 independent methods)...");
  const structuralTaxonomyClusters = clusterByStructuralTaxonomy(features);
  const featureSimilarityClusters = clusterByFeatureSimilarity(features);
  const graphTopologyClusters = clusterByGraphTopology(features);
  console.log(`  Structural Taxonomy: ${structuralTaxonomyClusters.length} clusters`);
  console.log(`  Feature Similarity(k=2): ${featureSimilarityClusters.length} clusters`);
  console.log(`  Graph Topology: ${graphTopologyClusters.length} clusters`);

  const agreementST_FS = pairwiseAgreement(structuralTaxonomyClusters, featureSimilarityClusters);
  const agreementST_GT = pairwiseAgreement(structuralTaxonomyClusters, graphTopologyClusters);
  const agreementFS_GT = pairwiseAgreement(featureSimilarityClusters, graphTopologyClusters);
  const pairwiseAgreementAvg = (agreementST_FS + agreementST_GT + agreementFS_GT) / 3;
  console.log(`  Pairwise agreement: ST-FS=${agreementST_FS.toFixed(3)}, ST-GT=${agreementST_GT.toFixed(3)}, FS-GT=${agreementFS_GT.toFixed(3)}, avg=${pairwiseAgreementAvg.toFixed(3)}`);

  console.log("STEP3: Behavioral Profiling (rescue vector across Deep Cycle Refinement v1's own 10 Gate configs, unmodified)...");
  const profiles = computeAllRescueProfiles(target, lib);
  const rescuedByAnyCount = profiles.filter((p) => p.rescuedByAny).length;
  console.log(`  rescuedByAny: ${rescuedByAnyCount}/${profiles.length}`);

  console.log("STEP4: Subtype Stability Analysis (structural clusters vs behavioral rescue profiles, using Feature Similarity k=2 split)...");
  const clusterBehaviors = summarizeClusterBehavior(featureSimilarityClusters, profiles);
  for (const cb of clusterBehaviors) {
    console.log(`  [${cb.clusterKey}] size=${cb.size}, rescuedByAnyRate=${(cb.rescuedByAnyRate * 100).toFixed(1)}%`);
  }
  const divergences = computeBehavioralDivergence(clusterBehaviors);
  const topDivergence = [...divergences].sort((a, b) => b.rangePp - a.rangePp)[0];
  console.log(`  Largest divergence: [${topDivergence.configLabel}] range=${topDivergence.rangePp.toFixed(1)}pp (min=${(topDivergence.minRate * 100).toFixed(1)}%, max=${(topDivergence.maxRate * 100).toFixed(1)}%)`);

  console.log("STEP5: Subtype Decision...");
  const decisionResult = decideSubtype({
    structuralTaxonomyClusters,
    featureSimilarityClusters,
    graphTopologyClusters,
    pairwiseAgreementAvg,
    divergences,
  });
  console.log(`  PASS=${decisionResult.pass}, methodsWithMultipleSignificantClusters=${decisionResult.methodsWithMultipleSignificantClusters}/3, meaningfulDivergence=${decisionResult.meaningfulDivergence}`);
  console.log(`  Decision: ${decisionResult.decision} -- ${decisionResult.rationale}`);

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Primitive Discovery Sprint -- Deep Cycle Subtype Discovery Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: Deep Cycle Primary Cluster, n=${target.length} (from blueprintAttributionRefinementV1's own resolved output, unmodified)`);
  push();

  push("STEP1. Extended Feature Extraction");
  push(`  ${features.length} cases, features: cycleCount(dependencyDepth proxy)/cycleLength/pairCount/conflictEdgeCount/parityState(reused) + articulationPointCount/biconnectedComponentCount/cycleOverlap/cycleDensity/conflictAdjacentToCycle/pairGraphDensity(new, graph-topology based)`);
  push(`  bridgeAdjacency/shortestBridgeLength: NOT computed -- disclosed, this population is single-component(bridge=false) by construction, so these axes are constant/inapplicable here.`);
  push();

  push("STEP2. Clustering (3 independent methods)");
  push(`  Structural Taxonomy (${structuralTaxonomyClusters.length} clusters):`);
  push(...renderClusters(structuralTaxonomyClusters));
  push(`  Feature Similarity k=2 (${featureSimilarityClusters.length} clusters):`);
  push(...renderClusters(featureSimilarityClusters));
  push(`  Graph Topology (${graphTopologyClusters.length} clusters):`);
  push(...renderClusters(graphTopologyClusters));
  push(`  Pairwise agreement: ST-FS=${agreementST_FS.toFixed(3)}, ST-GT=${agreementST_GT.toFixed(3)}, FS-GT=${agreementFS_GT.toFixed(3)}, avg=${pairwiseAgreementAvg.toFixed(3)}`);
  push();

  push("STEP3. Behavioral Profiling (rescue vector across 10 Gate configs, unmodified reuse of deepCycleRefinementV1's own GATE_SWEEP_CONFIGS)");
  push(`  rescuedByAny: ${rescuedByAnyCount}/${profiles.length}`);
  for (const p of profiles) {
    const rescuedConfigs = Object.entries(p.rescuedByConfigLabel).filter(([, v]) => v).map(([k]) => k);
    push(`    [${p.label}] rescuedByAny=${p.rescuedByAny}, rescuedByConfigs=${rescuedConfigs.length ? rescuedConfigs.join(", ") : "(none)"}`);
  }
  push();

  push("STEP4. Subtype Stability Analysis (Feature Similarity k=2 clusters vs behavioral rescue profiles)");
  for (const cb of clusterBehaviors) {
    push(`  [${cb.clusterKey}] size=${cb.size}, rescuedByAnyRate=${(cb.rescuedByAnyRate * 100).toFixed(1)}%`);
    for (const [cfgLabel, rate] of Object.entries(cb.rescuedByConfigRate)) push(`      ${cfgLabel}: ${(rate * 100).toFixed(1)}%`);
  }
  push(`  Divergence per Gate config (range across clusters):`);
  for (const d of divergences) push(`    [${d.configLabel}] min=${(d.minRate * 100).toFixed(1)}%, max=${(d.maxRate * 100).toFixed(1)}%, range=${d.rangePp.toFixed(1)}pp`);
  push();

  push("STEP5. Subtype Decision");
  push(`  Methods with >=2 significant(n>=3) clusters: ${decisionResult.methodsWithMultipleSignificantClusters}/3`);
  push(`  Meaningful behavioral divergence(>=30pp on any Gate config): ${decisionResult.meaningfulDivergence}`);
  push(`  PASS: ${decisionResult.pass}`);
  push(`  Decision: ${decisionResult.decision}`);
  push(`  Rationale: ${decisionResult.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        targetLabels: target.map((t) => t.hole.label),
        features,
        structuralTaxonomyClusters,
        featureSimilarityClusters,
        graphTopologyClusters,
        pairwiseAgreement: { ST_FS: agreementST_FS, ST_GT: agreementST_GT, FS_GT: agreementFS_GT, avg: pairwiseAgreementAvg },
        profiles,
        clusterBehaviors,
        divergences,
        decisionResult,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

main();
