// Parity-Gated Cycle Primitive Prototype Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCyclePrototypeRefinementV1.ts
//
// Read-only w.r.t. the real Primitive algorithms (BridgeCandidateGeneration/
// MultiCycleTraversal/BridgeRemoval/ComponentDetection, all unmodified,
// only reused or disclosed-duplicated with instrumentation). NO
// production Solver file is touched. Population: the SAME 41 real cases
// the prior Integration Architecture Analysis Sprint classified as
// PRIMITIVE_FAILURE (extracted from its own result JSON, not
// re-derived), verifying whether that Sprint's Decision C (the dominant
// cause is Primitive-level, not Integration-level) is itself further
// decomposable into Candidate Generation / Traversal / Validation /
// "needs a new Primitive" root causes. See
// docs/PARITY_GATED_CYCLE_PROTOTYPE_REFINEMENT_V1.md for the full
// STEP1-6 narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { cloneCubies } from "./cubeState";
import { applySeq, buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import type { HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { detectComponents } from "./parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "./parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { buildFailureTaxonomy } from "./solverPrimitiveParityGatedCyclePrototypeRefinement/FailureTaxonomy";
import { auditCandidateGeneration, summarizeCandidateGenerationAudit } from "./solverPrimitiveParityGatedCyclePrototypeRefinement/CandidateGenerationAudit";
import { analyzeTraversal } from "./solverPrimitiveParityGatedCyclePrototypeRefinement/TraversalAnalysis";
import { evaluateCandidateInjection, summarizeCandidateInjection } from "./solverPrimitiveParityGatedCyclePrototypeRefinement/CounterfactualCandidateInjection";
import { benchmarkCase, summarizeBenchmark } from "./solverPrimitiveParityGatedCyclePrototypeRefinement/CapabilityBenchmark";
import { decideRootCause } from "./solverPrimitiveParityGatedCyclePrototypeRefinement/RootCauseDecision";

const DATA_DIR = "src/customCube/solverPrimitiveParityGatedCyclePrototypeRefinement/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-prototype-refinement-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-prototype-refinement-v1-result.json`;
const PRIOR_RESULT_JSON_PATH = "src/customCube/solverPrimitiveParityGatedCycleIntegrationArchitecture/data/parity-gated-cycle-integration-architecture-analysis-v1-result.json";

const TRAVERSAL_DEADLINE_MS = 2000; // matches genParityGatedCycle()'s own reserved-slice budget

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading the prior Sprint's own 41 PRIMITIVE_FAILURE cases (extracted, not re-derived)...");
  const priorResult = JSON.parse(fs.readFileSync(PRIOR_RESULT_JSON_PATH, "utf-8"));
  const failureLabels: Set<string> = new Set(priorResult.perCase.filter((c: { cause: string }) => c.cause === "PRIMITIVE_FAILURE").map((c: { label: string }) => c.label));
  const allHoles = loadRawHoleDataset();
  const holes: HoleCase[] = allHoles.filter((h) => failureLabels.has(h.label));
  console.log(`  n=${holes.length} (expected 41)`);

  console.log("STEP1: Primitive Failure Taxonomy...");
  const { perCase: taxonomyPerCase, summary: taxonomy } = buildFailureTaxonomy(holes, libs);
  for (const cat of Object.keys(taxonomy.counts) as (keyof typeof taxonomy.counts)[]) {
    console.log(`  [${cat}] count=${taxonomy.counts[cat]}, %=${taxonomy.percent[cat].toFixed(1)}%`);
  }

  console.log("STEP2: Candidate Generation Audit...");
  const candidateAuditPerCase = holes.map((h) => auditCandidateGeneration(h, detectComponents(h.cubies)));
  const candidateAudit = summarizeCandidateGenerationAudit(candidateAuditPerCase);
  console.log(`  avgPairsAttempted=${candidateAudit.avgPairsAttempted.toFixed(1)}, avgValidCount=${candidateAudit.avgValidCount.toFixed(2)}, avgRejectedCount=${candidateAudit.avgRejectedCount.toFixed(1)}, neverGeneratesAnyBridge=${candidateAudit.neverGeneratesAnyBridgeCount}/${candidateAudit.totalCases} (${candidateAudit.neverGeneratesAnyBridgePercent.toFixed(1)}%)`);

  console.log("STEP3: Multi-Cycle Traversal analysis (post-first-bridge, or original state if no bridge)...");
  const traversalPerCase = holes.map((h) => {
    const components = detectComponents(h.cubies);
    const bridges = generateBridgeCandidates(h.cubies, components, Date.now() + 300, "largestTwo");
    const cubiesForTraversal = cloneCubies(h.cubies);
    if (bridges.length > 0 && bridges[0].moves.length > 0) applySeq(cubiesForTraversal, bridges[0].moves);
    const result = analyzeTraversal(cubiesForTraversal, libs.lib, Date.now() + TRAVERSAL_DEADLINE_MS);
    return { label: h.label, ...result };
  });
  const avgLeaves = traversalPerCase.reduce((s, t) => s + t.leavesExplored, 0) / traversalPerCase.length;
  const avgDepth = traversalPerCase.reduce((s, t) => s + t.maxDepthReached, 0) / traversalPerCase.length;
  const hitCapOrDeadlineCount = traversalPerCase.filter((t) => t.hitLeafCap || t.hitDeadline).length;
  const improvingLeafCount = traversalPerCase.filter((t) => t.improvingLeafFound).length;
  console.log(`  avgLeavesExplored=${avgLeaves.toFixed(1)}, avgMaxDepthReached=${avgDepth.toFixed(1)}, hitCapOrDeadline=${hitCapOrDeadlineCount}/${traversalPerCase.length}, improvingLeafFound=${improvingLeafCount}/${traversalPerCase.length}`);

  console.log("STEP4: Counterfactual Candidate Injection (widened search, same algorithm)...");
  const injectionPerCase = holes.map((h, i) => evaluateCandidateInjection(h, candidateAuditPerCase[i].totalValidCount));
  const injection = summarizeCandidateInjection(injectionPerCase);
  console.log(`  originalZeroCandidateCount=${injection.originalZeroCandidateCount}, recoveredByWideningCount=${injection.recoveredByWideningCount}, recoveryRate=${injection.recoveryRatePercent.toFixed(1)}%`);

  console.log("STEP5: Capability Benchmark (3-arm: Baseline / Current / Counterfactual Injection)...");
  const benchmarkPerCase = holes.map((h) => benchmarkCase(h, libs.lib));
  const benchmark = summarizeBenchmark(benchmarkPerCase);
  console.log(`  n=${benchmark.n}, currentImproved=${benchmark.currentImprovedCount}, injectedImproved=${benchmark.injectedImprovedCount}, currentRegression=${benchmark.currentRegressionCount}, injectedRegression=${benchmark.injectedRegressionCount}`);
  console.log(`  improvedCountDiff: mean=${benchmark.improvedCountDiffStats.mean.toFixed(4)}, 95% CI=[${benchmark.improvedCountDiffStats.ciLower.toFixed(4)}, ${benchmark.improvedCountDiffStats.ciUpper.toFixed(4)}], Cohen's dz=${benchmark.improvedCountDiffEffectSize.cohensD.toFixed(3)} (${benchmark.improvedCountDiffEffectSize.magnitude})`);

  console.log("STEP6: Root Cause Decision...");
  const decision = decideRootCause(taxonomy, candidateAudit, injection, benchmark);
  console.log(`  rootCause=${decision.rootCause}`);
  console.log(`  rationale: ${decision.rootCauseRationale}`);
  console.log(`  finalDecision=${decision.finalDecision}`);
  console.log(`  rationale: ${decision.finalDecisionRationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Primitive Prototype Refinement Sprint v1 -- Report ===");
  push();
  push(`Population: n=${holes.length} (the prior Architecture Analysis Sprint's own 41 real PRIMITIVE_FAILURE cases)`);
  push();
  push("STEP1. Primitive Failure Taxonomy");
  for (const cat of Object.keys(taxonomy.counts) as (keyof typeof taxonomy.counts)[]) {
    push(`  [${cat}] count=${taxonomy.counts[cat]}, %=${taxonomy.percent[cat].toFixed(1)}%`);
  }
  push();
  push("STEP2. Candidate Generation Audit");
  push(`  avgPairsAttempted=${candidateAudit.avgPairsAttempted.toFixed(1)}`);
  push(`  avgValidCount=${candidateAudit.avgValidCount.toFixed(2)}`);
  push(`  avgRejectedCount=${candidateAudit.avgRejectedCount.toFixed(1)}`);
  push(`  avgDuplicateRatio=${candidateAudit.avgDuplicateRatio.toFixed(3)}`);
  push(`  neverGeneratesAnyBridge=${candidateAudit.neverGeneratesAnyBridgeCount}/${candidateAudit.totalCases} (${candidateAudit.neverGeneratesAnyBridgePercent.toFixed(1)}%)`);
  push();
  push("STEP3. Multi-Cycle Traversal analysis");
  push(`  avgLeavesExplored=${avgLeaves.toFixed(1)}`);
  push(`  avgMaxDepthReached=${avgDepth.toFixed(1)}`);
  push(`  hitCapOrDeadlineCount=${hitCapOrDeadlineCount}/${traversalPerCase.length}`);
  push(`  improvingLeafFoundCount=${improvingLeafCount}/${traversalPerCase.length}`);
  push();
  push("STEP4. Counterfactual Candidate Injection (widened search)");
  push(`  originalZeroCandidateCount=${injection.originalZeroCandidateCount}/${injection.totalCases}`);
  push(`  recoveredByWideningCount=${injection.recoveredByWideningCount}`);
  push(`  recoveryRatePercent=${injection.recoveryRatePercent.toFixed(1)}%`);
  push();
  push("STEP5. Capability Benchmark (3-arm real replay)");
  push(`  n=${benchmark.n}`);
  push(`  currentImprovedCount=${benchmark.currentImprovedCount}, currentRegressionCount=${benchmark.currentRegressionCount}`);
  push(`  injectedImprovedCount=${benchmark.injectedImprovedCount}, injectedRegressionCount=${benchmark.injectedRegressionCount}`);
  push(`  currentAvgRuntimeMs=${benchmark.currentAvgRuntimeMs.toFixed(1)}, injectedAvgRuntimeMs=${benchmark.injectedAvgRuntimeMs.toFixed(1)}`);
  push(`  currentAvgTraversalCount=${benchmark.currentAvgTraversalCount.toFixed(2)}, injectedAvgTraversalCount=${benchmark.injectedAvgTraversalCount.toFixed(2)}`);
  push(`  improvedCountDiff (Injection - Current): mean=${benchmark.improvedCountDiffStats.mean.toFixed(4)}, stddev=${benchmark.improvedCountDiffStats.stddev.toFixed(4)}, 95% CI=[${benchmark.improvedCountDiffStats.ciLower.toFixed(4)}, ${benchmark.improvedCountDiffStats.ciUpper.toFixed(4)}]`);
  push(`  Cohen's dz=${benchmark.improvedCountDiffEffectSize.cohensD.toFixed(3)} (${benchmark.improvedCountDiffEffectSize.magnitude})`);
  push();
  push("STEP6. Root Cause Decision");
  push(`  rootCause=${decision.rootCause}`);
  push(`  rootCauseRationale: ${decision.rootCauseRationale}`);
  push(`  finalDecision=${decision.finalDecision}`);
  push(`  finalDecisionRationale: ${decision.finalDecisionRationale}`);
  push(`  Level1(원인 분리)=${decision.level1CausesSeparated ? "PASS" : "FAIL"}`);
  push(`  Level2(기여도 정량화)=${decision.level2ContributionQuantified ? "PASS" : "FAIL"}`);
  push(`  Level3(방향 확정)=${decision.level3DirectionConfirmed ? "PASS" : "FAIL"}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        taxonomy,
        taxonomyPerCase,
        candidateAudit,
        candidateAuditPerCase,
        traversalPerCase,
        injection,
        injectionPerCase,
        benchmark,
        benchmarkPerCase,
        decision,
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
