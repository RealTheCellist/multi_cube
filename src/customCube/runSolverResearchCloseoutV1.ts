// Solver Research Closeout Sprint v1 -- driver.
//
// Usage:
//   npx tsx .../runSolverResearchCloseoutV1.ts
//
// Documentation / Consolidation Sprint -- NO Production/Primitive/
// Scheduler/Budget/Validation Framework modification. Reads real,
// already-committed artifacts (docs/*.md file listing, production source
// constants, Validation Framework source) to assemble the final Research
// Closeout report.
import * as fs from "fs";
import { buildResearchInventoryMatrix } from "./solverResearchCloseoutV1/ResearchInventoryMatrix";
import { FINAL_ARCHITECTURE_V1 } from "./solverResearchCloseoutV1/FinalArchitecture";
import { OPERATING_CONTRACT_CATALOG } from "./solverResearchCloseoutV1/OperatingContractCatalog";
import { buildValidationStandard } from "./solverResearchCloseoutV1/ValidationStandard";
import { KNOWN_LIMITATION_REGISTER } from "./solverResearchCloseoutV1/KnownLimitationRegister";
import { evaluateResearchCloseoutDecision } from "./solverResearchCloseoutV1/ResearchCloseoutDecision";

const DATA_DIR = "src/customCube/solverResearchCloseoutV1/data";
const REPORT_PATH = `${DATA_DIR}/solver-research-closeout-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/solver-research-closeout-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log("STEP1: Research Inventory Audit (real docs/*.md scan)...");
  const inventory = buildResearchInventoryMatrix();
  console.log(`  totalFiles=${inventory.totalFiles}`);
  console.log(`  ${JSON.stringify(inventory.countsByCategory)}`);

  console.log("STEP2: Final Architecture Freeze...");
  console.log(`  ${FINAL_ARCHITECTURE_V1.recoveryPipelineDefaultOrder.length}-stage Recovery Pipeline order confirmed.`);

  console.log("STEP3: Operating Contract Catalog Finalization...");
  console.log(`  ${OPERATING_CONTRACT_CATALOG.length} Contracts documented.`);

  console.log("STEP4: Validation Standard Consolidation (real source audit)...");
  const validationStandard = buildValidationStandard();
  console.log(`  ${validationStandard.gates.length} Gates, ${validationStandard.categories.length} Categories confirmed.`);

  console.log("STEP5: Known Limitation Review...");
  console.log(`  ${KNOWN_LIMITATION_REGISTER.length} limitations registered.`);

  console.log("STEP6: Research Closeout Decision...");
  const decisionResult = evaluateResearchCloseoutDecision(inventory, FINAL_ARCHITECTURE_V1, OPERATING_CONTRACT_CATALOG, validationStandard, KNOWN_LIMITATION_REGISTER);
  console.log(`  Level1=${decisionResult.level1PrimitiveLifecycleComplete}, Level2=${decisionResult.level2ProductionReleaseComplete}, Level3=${decisionResult.level3MaintenanceTransitionPossible}`);
  console.log(`  Decision=${decisionResult.decision}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Solver Research Closeout Sprint v1 -- Report ===");
  push();
  push("STEP1. Research Inventory Matrix");
  push(`  총 ${inventory.totalFiles}개 docs/*.md 실측 분류:`);
  for (const [cat, count] of Object.entries(inventory.countsByCategory)) push(`    ${cat}: ${count}건`);
  push(`  분류 규칙: 우선순위 정렬 키워드 규칙(재현 가능, 파일별 수작업 판단 아님). 상세: ResearchInventoryMatrix.ts`);
  push();
  push("STEP2. Final Architecture v1 -- Recovery Pipeline Default Order (schedulingStrategy=reservedBudget, multiComponentMergeOrder=AFTER_CCR)");
  for (const s of FINAL_ARCHITECTURE_V1.recoveryPipelineDefaultOrder) {
    push(`  ${s.order}. ${s.candidateType} -- Gate: ${s.gate} | Budget: ${s.budgetContract} | shortCircuitEligible=${s.shortCircuitEligible}`);
  }
  push(`  recoveryEligibleCondition: ${FINAL_ARCHITECTURE_V1.recoveryEligibleCondition}`);
  push(`  Outer Deadlines:`);
  for (const d of FINAL_ARCHITECTURE_V1.outerDeadlines) push(`    ${d.component}: ${d.valueMs}ms (parameterized=${d.parameterized})`);
  push(`  Planner 역할: ${FINAL_ARCHITECTURE_V1.plannerRole}`);
  push(`  Primitive Library: ${FINAL_ARCHITECTURE_V1.primitiveLibraryFile}`);
  push(`  Validation Framework: ${FINAL_ARCHITECTURE_V1.validationFrameworkSummary}`);
  push(`  Dedicated Budget Primitive Protocol: ${FINAL_ARCHITECTURE_V1.dedicatedBudgetPrimitiveProtocolSummary}`);
  push();
  push("STEP3. Operating Contract Catalog");
  for (const c of OPERATING_CONTRACT_CATALOG) {
    push(`  [${c.contract}] = ${c.currentValue}`);
    push(`    Origin: ${c.originSprint}`);
    push(`    Integration: ${c.integrationSprint}`);
    push(`    Validation: ${c.validationSprint}`);
    push(`    Status: ${c.currentStatus}`);
  }
  push();
  push("STEP4. Validation Standard Consolidation (real source audit)");
  push(`  Gates: ${validationStandard.gates.map((g) => `${g.gate}(${g.name})`).join(", ")}`);
  for (const c of validationStandard.categories) {
    push(`  Category ${c.category}(${c.name}): requiredGates=[${c.requiredGates}], minN prototype=${c.minNPrototype}/production=${c.minNProduction}`);
  }
  push(`  Decision Rule: ${validationStandard.decisionRule}`);
  push(`  Dedicated Budget Primitive Protocols:`);
  for (const p of validationStandard.dedicatedBudgetProtocols) push(`    ${p.primitive}: ${p.status} (${p.decisionSprint})`);
  push();
  push("STEP5. Known Limitation Register");
  for (const l of KNOWN_LIMITATION_REGISTER) {
    push(`  [${l.disposition}] ${l.limitation}`);
    push(`    evidenceSprint: ${l.evidenceSprint}`);
    push(`    note: ${l.note}`);
  }
  push();
  push("STEP6. Research Closeout Decision");
  push(`  Level1(모든 Primitive Lifecycle 완료)=${decisionResult.level1PrimitiveLifecycleComplete ? "PASS" : "FAIL"}`);
  push(`  Level2(Production Release 체계 완료)=${decisionResult.level2ProductionReleaseComplete ? "PASS" : "FAIL"}`);
  push(`  Level3(운영 단계 전환 가능)=${decisionResult.level3MaintenanceTransitionPossible ? "PASS" : "FAIL"}`);
  push(`  Decision=${decisionResult.decision}`);
  push(`  rationale: ${decisionResult.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        inventory,
        finalArchitecture: FINAL_ARCHITECTURE_V1,
        operatingContractCatalog: OPERATING_CONTRACT_CATALOG,
        validationStandard,
        knownLimitationRegister: KNOWN_LIMITATION_REGISTER,
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
