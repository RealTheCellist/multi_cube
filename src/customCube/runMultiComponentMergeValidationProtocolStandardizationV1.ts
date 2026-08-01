// Multi-Component Merge Validation Protocol Standardization Sprint v1 --
// driver.
//
// Usage:
//   npx tsx .../runMultiComponentMergeValidationProtocolStandardizationV1.ts
//
// Documentation / Framework Extension Sprint -- NO Production/Primitive/
// Validation Framework code is modified. This driver assembles the
// Validation Scope Matrix (STEP1), Validation Flow (STEP2), KPI Mapping
// (STEP3), Applicability Matrix (STEP4, real RESERVED_SLICE_MS code audit)
// and Compatibility Audit (STEP5, real ReleaseGates.ts/ChangeClassification.ts
// code audit) into a final Standardization Decision (STEP6).
import * as fs from "fs";
import { VALIDATION_SCOPE_MATRIX } from "./solverPrimitiveMultiComponentMergeValidationProtocol/ValidationScopeMatrix";
import { VALIDATION_FLOW } from "./solverPrimitiveMultiComponentMergeValidationProtocol/ProtocolDefinition";
import { KPI_MAPPING_TABLE, PROPOSED_UNADOPTED_KPI } from "./solverPrimitiveMultiComponentMergeValidationProtocol/KpiMapping";
import { buildApplicabilityMatrix } from "./solverPrimitiveMultiComponentMergeValidationProtocol/ApplicabilityAnalysis";
import { auditCompatibility } from "./solverPrimitiveMultiComponentMergeValidationProtocol/CompatibilityAudit";
import { evaluateStandardizationDecision } from "./solverPrimitiveMultiComponentMergeValidationProtocol/StandardizationDecision";

const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeValidationProtocol/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-validation-protocol-standardization-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-validation-protocol-standardization-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log("STEP1: Validation Scope Matrix...");
  console.log(`  ${VALIDATION_SCOPE_MATRIX.length} axes defined.`);

  console.log("STEP2: Protocol Definition (Validation Flow)...");
  console.log(`  ${VALIDATION_FLOW.length} stages defined, order: ${VALIDATION_FLOW.map((s) => s.stage).join(" -> ")}`);

  console.log("STEP3: KPI Mapping Table...");
  console.log(`  ${KPI_MAPPING_TABLE.length} KPIs mapped. Proposed-but-unadopted KPI: ${PROPOSED_UNADOPTED_KPI.name} (${PROPOSED_UNADOPTED_KPI.status}).`);

  console.log("STEP4: Applicability Analysis (real RESERVED_SLICE_MS code audit)...");
  const applicabilityMatrix = buildApplicabilityMatrix();
  for (const r of applicabilityMatrix) {
    console.log(`  ${r.type}: dedicatedBudgetMs=${r.dedicatedBudgetMs}, applicability=${r.applicability}`);
  }

  console.log("STEP5: Compatibility Audit (real ReleaseGates.ts/ChangeClassification.ts code audit)...");
  const compatibility = auditCompatibility();
  for (const g of compatibility.gateChecks) console.log(`  Gate ${g.gate} (${g.functionName}): signatureIsGeneric=${g.signatureIsGeneric}`);
  console.log(`  categoryCCoversRequiredGates=${compatibility.categoryCCoversRequiredGates}, frameworkModificationRequired=${compatibility.frameworkModificationRequired}`);

  console.log("STEP6: Standardization Decision...");
  const decisionResult = evaluateStandardizationDecision(VALIDATION_SCOPE_MATRIX, VALIDATION_FLOW, applicabilityMatrix, compatibility);
  console.log(`  Level1=${decisionResult.level1Pass}, Level2=${decisionResult.level2Pass}, Level3=${decisionResult.level3Pass}`);
  console.log(`  Decision=${decisionResult.decision}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Validation Protocol Standardization Sprint v1 -- Report ===");
  push();
  push("STEP1. Validation Scope Matrix");
  for (const row of VALIDATION_SCOPE_MATRIX) {
    push(`  [${row.axis}] path=${row.path}`);
    push(`    purpose: ${row.purpose}`);
    push(`    budgetRequirement: ${row.budgetRequirement}`);
    push(`    evidenceSource: ${row.evidenceSource}`);
    push();
  }
  push("STEP2. Protocol Definition -- Validation Flow");
  for (const s of VALIDATION_FLOW) {
    push(`  ${s.order}. ${s.stage}`);
    push(`    description: ${s.description}`);
    push(`    reusedModule: ${s.reusedModule}`);
    push(`    inputRequirement: ${s.inputRequirement}`);
    push(`    outputConsumedBy: ${s.outputConsumedBy}`);
    push();
  }
  push("STEP3. KPI Mapping Table");
  for (const k of KPI_MAPPING_TABLE) {
    push(`  [${k.tier}/${k.role}] ${k.kpi} -- ${k.definition}`);
    push(`    realFieldSource: ${k.realFieldSource}`);
  }
  push(`  (제안되었으나 미채택) ${PROPOSED_UNADOPTED_KPI.name} -- status=${PROPOSED_UNADOPTED_KPI.status}, origin=${PROPOSED_UNADOPTED_KPI.origin}`);
  push();
  push("STEP4. Applicability Matrix");
  for (const r of applicabilityMatrix) {
    push(`  ${r.type}: dedicatedBudgetMs=${r.dedicatedBudgetMs}, exceedsRecoveryReserve=${r.exceedsRecoveryReserve}, empiricalSolveE2ECapabilityConfirmed=${r.empiricalSolveE2ECapabilityConfirmed}`);
    push(`    applicability=${r.applicability}`);
    push(`    empiricalEvidence: ${r.empiricalEvidence}`);
    push(`    rationale: ${r.rationale}`);
    push();
  }
  push("STEP5. Compatibility Audit");
  for (const g of compatibility.gateChecks) push(`  ${g.evidence}`);
  push(`  categoryCCoversRequiredGates=${compatibility.categoryCCoversRequiredGates}`);
  push(`  frameworkModificationRequired=${compatibility.frameworkModificationRequired}`);
  push(`  evidenceSummary: ${compatibility.evidenceSummary}`);
  push();
  push("STEP6. Standardization Decision");
  push(`  Level1(Validation Protocol 정의)=${decisionResult.level1Pass ? "PASS" : "FAIL"}`);
  push(`  Level2(기존 Framework와 충돌 없음)=${decisionResult.level2Pass ? "PASS" : "FAIL"}`);
  push(`  Level3(향후 재사용 가능)=${decisionResult.level3Pass ? "PASS" : "FAIL"}`);
  push(`  Decision=${decisionResult.decision}`);
  push(`  rationale: ${decisionResult.rationale}`);
  if (decisionResult.openFollowUps.length > 0) {
    push(`  openFollowUps:`);
    for (const f of decisionResult.openFollowUps) push(`    - ${f}`);
  }

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        validationScopeMatrix: VALIDATION_SCOPE_MATRIX,
        validationFlow: VALIDATION_FLOW,
        kpiMappingTable: KPI_MAPPING_TABLE,
        proposedUnadoptedKpi: PROPOSED_UNADOPTED_KPI,
        applicabilityMatrix,
        compatibility,
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
