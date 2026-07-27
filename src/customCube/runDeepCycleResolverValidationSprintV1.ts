// Deep Cycle Resolver Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runDeepCycleResolverValidationSprintV1.ts
//
// Research Sprint: validates whether Primitive-Candidate-A ("Deep Cycle
// Resolver", State Taxonomy Sprint v2's Primitive Opportunity Map) is a
// genuine research opportunity for Recovery Necessity Validation Sprint
// v1's 3 RECOVERY_REQUIRED cases -- WITHOUT implementing any new
// Primitive or Prototype (this Sprint's own Directive forbids it).
//
// Central finding, established via direct measurement in this driver's own
// STEP0-2 (not assumed): the target mechanism already exists in production
// as CCR (Clean-Cycle Resolution, solverPrimitiveCCRPrototype/
// CCRPrototype.ts, wired into fiveByFiveEdgeRecovery.ts's genCCR) --
// CCR's own Gate (cycleLength 5~6, conflictEdgeCount=0) matches the
// RECOVERY_REQUIRED profile exactly.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { computeDeepCycleStructuralProfile, type DeepCycleStructuralProfile } from "./deepCycleResolverValidation/StructuralProfile";
import { buildCaseFailureMap, type CaseFailureMap } from "./deepCycleResolverValidation/PrimitiveFailureMap";
import { probeCcrMechanism, compareAcrossCases, type CcrMechanismProbe } from "./deepCycleResolverValidation/MechanismIdentification";
import { buildStructuralComparison } from "./deepCycleResolverValidation/StructuralComparison";
import { buildCapabilitySpec } from "./deepCycleResolverValidation/CapabilitySpecification";
import { buildOpportunityMapRevision } from "./deepCycleResolverValidation/OpportunityMapUpdate";
import { decideReadiness } from "./deepCycleResolverValidation/PrototypeReadinessDecision";
import type { NecessityGroundTruthRow } from "./recoveryNecessity/NecessityGroundTruth";

const DATA_DIR = "src/customCube/deepCycleResolverValidation/data";
const REPORT_PATH = `${DATA_DIR}/deep-cycle-resolver-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/deep-cycle-resolver-validation-v1-result.json`;
const RECOVERY_NECESSITY_RESULT_PATH = "src/customCube/recoveryNecessity/data/recovery-necessity-validation-v1-result.json";

const RECOVERY_REQUIRED_LABELS = ["worstCase:b714481", "worstCase:1e928fb1", "scrambleDepth10:8"];

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

async function main() {
  const holes: HoleCase[] = loadRawHoleDataset();
  const libs = buildLibs();
  log("init", `loaded ${holes.length} holes`);

  const groundTruthRows: NecessityGroundTruthRow[] = JSON.parse(fs.readFileSync(RECOVERY_NECESSITY_RESULT_PATH, "utf-8")).groundTruthRows;
  const gtByLabel = new Map(groundTruthRows.map((r) => [r.label, r]));

  // STEP: population-wide structural profile (RQ-1 features, all 142 cases)
  log("structural-profile", "computing DeepCycleStructuralProfile for all cases...");
  const profiles: DeepCycleStructuralProfile[] = holes.map((h) => computeDeepCycleStructuralProfile(h.cubies, h.label, libs.lib));
  const profileByLabel = new Map(profiles.map((p) => [p.label, p]));
  log("structural-profile", "done");

  const requiredProfiles = holes.filter((h) => gtByLabel.get(h.label)?.requiresRecovery).map((h) => profileByLabel.get(h.label)!);
  const optionalProfiles = holes.filter((h) => gtByLabel.get(h.label)?.recoveryOptional).map((h) => profileByLabel.get(h.label)!);
  const unnecessaryProfiles = holes
    .filter((h) => !gtByLabel.get(h.label)?.requiresRecovery && !gtByLabel.get(h.label)?.recoveryOptional)
    .map((h) => profileByLabel.get(h.label)!);
  const structuralComparison = buildStructuralComparison(requiredProfiles, optionalProfiles, unnecessaryProfiles);
  log("structural-comparison", `required n=${requiredProfiles.length}, optional n=${optionalProfiles.length}, unnecessary n=${unnecessaryProfiles.length}`);

  // STEP: Primitive Failure Map (RQ-2) -- budget sweep + repeat-trial
  // stability, restricted to the 3 RECOVERY_REQUIRED cases (the direct
  // object of study; population-wide budget sweeps for all 142 cases
  // duplicate Recovery Necessity Sprint's own already-delivered work).
  log("failure-map", "budget sweep + repeat-trial stability on RECOVERY_REQUIRED cases...");
  const requiredHoles = RECOVERY_REQUIRED_LABELS.map((label) => holes.find((h) => h.label === label)!);
  const failureMaps: CaseFailureMap[] = requiredHoles.map((h) => buildCaseFailureMap(h.cubies, h.label, libs));
  log("failure-map", "done");

  // STEP: Mechanism Identification (RQ-3/RQ-4) -- CCR Gate + strategy probes
  log("mechanism-id", "probing CCR gate + singleCycle/multiCycle strategies...");
  const mechanismProbes: CcrMechanismProbe[] = requiredHoles.map((h) => probeCcrMechanism(h.cubies, h.label, libs.lib));
  const crossCaseComparison = compareAcrossCases(mechanismProbes);
  log("mechanism-id", `verdict=${crossCaseComparison.verdict}`);

  const capabilitySpec = buildCapabilitySpec(mechanismProbes, failureMaps);
  const opportunityMapRevision = buildOpportunityMapRevision(crossCaseComparison);
  const readinessDecision = decideReadiness(crossCaseComparison, opportunityMapRevision);

  const lines: string[] = [];
  lines.push("Deep Cycle Resolver Validation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Structural Comparison (RECOVERY_REQUIRED vs OPTIONAL vs UNNECESSARY)");
  for (const g of [structuralComparison.required, structuralComparison.optional, structuralComparison.unnecessary]) {
    lines.push(
      `  ${g.necessityClass} (n=${g.n}): cycleLength=${g.avgCycleLength.toFixed(2)}, cycleCount=${g.avgCycleCount.toFixed(2)}, componentCount=${g.avgComponentCount.toFixed(
        2
      )}, wrongWing=${g.avgWrongWingCount.toFixed(2)}, conflictEdge=${g.avgConflictEdgeCount.toFixed(2)}, swapEdge=${g.avgSwapEdgeCount.toFixed(2)}, dependencyDepth=${g.avgDependencyDepth.toFixed(
        2
      )}, bridgeDistance=${g.avgBridgeDistance.toFixed(2)}, branchingFactor=${g.avgBranchingFactor.toFixed(2)}, parityRate=${(g.parityRate * 100).toFixed(1)}%, singleCycleShare=${(
        g.singleCycleShare * 100
      ).toFixed(1)}%`
    );
  }
  lines.push("");

  lines.push("2. Per-case Structural Profile (RECOVERY_REQUIRED, RQ-1)");
  for (const label of RECOVERY_REQUIRED_LABELS) {
    const p = profileByLabel.get(label)!;
    lines.push(
      `  ${label}: cycleTopology=${JSON.stringify(p.cycleTopology)}, dependencyDepth=${p.dependencyDepth}, bridgeDistance=${p.bridgeDistance}, branchingFactor=${p.branchingFactor.toFixed(2)}`
    );
  }
  lines.push("");

  lines.push("3. Primitive Failure Map (RQ-2, budget sweep across BASE/FLIP/CASE/PARITY/RECOVERY)");
  for (const fm of failureMaps) {
    lines.push(`  ${fm.label}:`);
    for (const s of fm.sweeps) {
      lines.push(`    ${s.primitive}: terminationReason=${s.terminationReason}, minSucceedingBudgetMs=${s.minSucceedingBudgetMs ?? "N/A"}`);
    }
    lines.push(
      `    RECOVERY repeat-trial stability (N=${fm.recoveryStability.trials} @ ${fm.recoveryStability.atBudgetMs}ms): ${fm.recoveryStability.successCount}/${fm.recoveryStability.trials} = ${(
        fm.recoveryStability.successRate * 100
      ).toFixed(0)}%, candidateTypes=${fm.recoveryStability.chosenCandidateTypes.join(",") || "(none)"}`
    );
  }
  lines.push("");

  lines.push("4. Mechanism Identification (RQ-3/RQ-4: CCR Gate + strategy probes)");
  for (const probe of mechanismProbes) {
    lines.push(`  ${probe.label}: gate=${JSON.stringify(probe.gate)}`);
    for (const sp of probe.strategyProbes) {
      lines.push(`    strategy=${sp.strategy}: succeededAtAnyBudget=${sp.succeededAtAnyBudget}, minSucceedingBudgetMs=${sp.minSucceedingBudgetMs ?? "N/A"}`);
    }
  }
  lines.push(`  Cross-case comparison: allGateEligible=${crossCaseComparison.allGateEligible}, solvedByCcr=${crossCaseComparison.solvedByCcr}/${crossCaseComparison.totalCases}`);
  lines.push(`  unsolvedLabels: ${crossCaseComparison.unsolvedLabels.join(", ") || "(none)"}`);
  lines.push(`  verdict: ${crossCaseComparison.verdict}`);
  lines.push(`  rationale: ${crossCaseComparison.verdictRationale}`);
  lines.push("");

  lines.push("5. Deep Cycle Resolver Capability Specification (RQ-3, definition only, no implementation)");
  lines.push(`  inputCondition: ${capabilitySpec.inputCondition}`);
  lines.push(`  requiredState: ${capabilitySpec.requiredState}`);
  lines.push(`  expectedOutput: ${capabilitySpec.expectedOutput}`);
  lines.push(`  searchDirection: ${capabilitySpec.searchDirection}`);
  lines.push(`  expectedCost: ${capabilitySpec.expectedCost}`);
  lines.push(`  evidenceNote: ${capabilitySpec.evidenceNote}`);
  lines.push("");

  lines.push("6. Primitive Opportunity Map Revision");
  lines.push(`  candidateId: ${opportunityMapRevision.candidateId}`);
  lines.push(`  revisedPriority: ${opportunityMapRevision.revisedPriority}`);
  lines.push(`  rationale: ${opportunityMapRevision.rationale}`);
  lines.push(`  redirectRecommendation: ${opportunityMapRevision.redirectRecommendation}`);
  lines.push("");

  lines.push("7. Prototype Readiness Decision");
  lines.push(`  decision: ${readinessDecision.decision}`);
  lines.push(`  conclusionLabel: ${readinessDecision.conclusionLabel}`);
  lines.push(`  rationale: ${readinessDecision.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        structuralComparison,
        requiredCaseProfiles: RECOVERY_REQUIRED_LABELS.map((l) => profileByLabel.get(l)),
        failureMaps,
        mechanismProbes,
        crossCaseComparison,
        capabilitySpec,
        opportunityMapRevision,
        readinessDecision,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
