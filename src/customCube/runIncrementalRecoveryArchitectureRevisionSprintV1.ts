// Incremental Recovery Architecture Blueprint Revision Sprint v1 -- driver.
//   npx tsx src/customCube/runIncrementalRecoveryArchitectureRevisionSprintV1.ts
//
// STEP1-6 per the Work Order. Analysis and Blueprint design only -- no new
// Prototype implementation, no Production/Planner/Executor/Recovery/
// enumerateWingCandidates/existing Primitive/existing Prototype changes.
// Every number cited here is a real, already-committed measurement from
// Prototype Sprint v1 and Prototype Refinement Sprint v1's own report
// files -- this Sprint re-runs nothing, it only re-organizes and
// interprets what was already measured, plus direct (read-only) source
// inspection of fiveByFiveEdges.ts to ground STEP5's Production analysis.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BOTTLENECKS, summarizeByLayer } from "./solverPrimitiveIncrementalRecoveryArchitectureRevision/BottleneckAttribution";
import { BUDGET_MODEL_REVIEWS, concludeBudgetArchitecture } from "./solverPrimitiveIncrementalRecoveryArchitectureRevision/BudgetArchitectureReview";
import { REGISTRY_POLICY_DESIGNS, recommendRegistryPolicy } from "./solverPrimitiveIncrementalRecoveryArchitectureRevision/RegistryPolicyBlueprint";
import { EVALUATION_METRICS } from "./solverPrimitiveIncrementalRecoveryArchitectureRevision/EvaluationBlueprintRevision";
import { PRODUCTION_CHANGE_CANDIDATES, sortedByPriority } from "./solverPrimitiveIncrementalRecoveryArchitectureRevision/ArchitectureImpactAnalysis";
import { buildDecisionMatrix, splitWrapperVsProduction, decideArchRevision } from "./solverPrimitiveIncrementalRecoveryArchitectureRevision/ArchitectureDecisionMatrix";

const reportPath = "src/customCube/solverPrimitiveIncrementalRecoveryArchitectureRevision/data/incremental-recovery-architecture-revision-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

push("========================================");
push("Incremental Recovery Architecture Blueprint Revision Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push(
  "Prototype Refinement Sprint v1(Decision C)에서 확인된 구조적 한계(Budget Granularity, Visited Registry Regression, Whole-Cube Floor Effect)를 계층별로 분리하고, " +
    "Wrapper 수준에서 해결 가능한 영역과 Production 변경이 필요한 영역을 구분하는 분석/설계 전용 Sprint다. " +
    "새 Prototype 구현이나 Production 코드 수정 없음 -- 모든 수치는 Prototype Sprint v1/Prototype Refinement Sprint v1의 실측 보고서를 인용했고, " +
    "STEP5의 Production 분석은 fiveByFiveEdges.ts의 실제 소스(읽기 전용)를 직접 확인해 근거를 세웠다.",
);
push();

// --- STEP1 ---
push("--- STEP1: Bottleneck Attribution (계층별 병목 분류) ---");
const layerCounts = summarizeByLayer(BOTTLENECKS);
push(`계층별 병목 수: Wrapper ${layerCounts.Wrapper}건, Primitive ${layerCounts.Primitive}건, Production ${layerCounts.Production}건`);
push();
for (const b of BOTTLENECKS) {
  push(`[${b.layer}] ${b.name}`);
  push(`  위치: ${b.location}`);
  push(`  근거: ${b.evidence}`);
  push(`  예상 영향 범위: ${b.expectedImpactScope}`);
  push();
}

// --- STEP2 ---
push("--- STEP2: Budget Architecture Review ---");
for (const m of BUDGET_MODEL_REVIEWS) {
  push(`[${m.model}] 이론적 상한=${m.theoreticalCeilingMs}ms, 실제 평균=${m.realAverageMs}ms, 성공률=${(m.successRate * 100).toFixed(1)}%, Production 수정 필요=${m.productionChangeRequired}`);
  push(`  Granularity 영향: ${m.granularityImpact}`);
  push(`  출처: ${m.source}`);
  push();
}
const budgetConclusion = concludeBudgetArchitecture();
push(`결론: 최선의 Wrapper-only 모델 = ${budgetConclusion.bestWrapperOnlyModel}`);
push(`Wrapper-only 한계: ${budgetConclusion.wrapperOnlyCeiling}`);
push(`완전한 해결에 Production 변경 필요: ${budgetConclusion.productionChangeNeededForFullFix}`);
push();

// --- STEP3 ---
push("--- STEP3: Registry Policy Blueprint ---");
for (const p of REGISTRY_POLICY_DESIGNS) {
  push(`[${p.policy}] 구현 난이도=${p.implementationDifficulty}`);
  push(`  설명: ${p.description}`);
  push(`  예상 Duplicate 감소: ${p.expectedDuplicateReduction}`);
  push(`  예상 Regression 위험: ${p.expectedRegressionRisk}`);
  push(`  근거: ${p.rationale}`);
  push();
}
const registryRec = recommendRegistryPolicy();
push(`추천 정책: ${registryRec.recommended} -- ${registryRec.reasoning}`);
push();

// --- STEP4 ---
push("--- STEP4: Evaluation Blueprint Revision (표준 평가 체계) ---");
for (const m of EVALUATION_METRICS) {
  push(`[${m.role}] ${m.name}`);
  push(`  정의: ${m.definition}`);
  push(`  이 Role인 이유: ${m.whyThisRole}`);
  push(`  근거: ${m.evidence}`);
  push();
}

// --- STEP5 ---
push("--- STEP5: Architecture Impact Analysis (Production 변경 후보) ---");
for (const c of sortedByPriority()) {
  push(`[Priority ${c.priority}] ${c.name} (risk=${c.risk})`);
  push(`  설명: ${c.description}`);
  push(`  예상 효과: ${c.expectedEffect}`);
  push(`  기존 코드 영향 범위: ${c.existingCodeImpactScope}`);
  push();
}

// --- STEP6 ---
push("--- STEP6: Architecture Decision Matrix ---");
push("| 변경안 | 위험 | Production 수정 | 우선순위 |");
for (const row of buildDecisionMatrix()) {
  push(`| ${row.changeProposal} | ${row.risk} | ${row.productionChangeRequired} | ${row.priority} |`);
  push(`  효과: ${row.effect}`);
}
push();

const split = splitWrapperVsProduction();
push("Wrapper만으로 가능한 개선:");
for (const s of split.wrapperOnlyFixable) push(`  - ${s}`);
push("Production 변경이 반드시 필요한 개선:");
for (const s of split.productionChangeRequired) push(`  - ${s}`);
push();

// --- 성공 기준 판정 ---
push("--- 성공 기준 판정 ---");
const decisionResult = decideArchRevision();
push(`Level 1 (구조적 병목의 원인을 계층별로 분리): ${decisionResult.level1Pass ? "PASS" : "FAIL"} -- Wrapper ${layerCounts.Wrapper}건, Primitive ${layerCounts.Primitive}건, Production ${layerCounts.Production}건, 모든 병목에 위치/근거/영향범위 명시.`);
push(`Level 2 (Wrapper 해결 가능 영역과 Production 변경 필요 영역을 명확히 구분): ${decisionResult.level2Pass ? "PASS" : "FAIL"} -- Wrapper ${split.wrapperOnlyFixable.length}건, Production ${split.productionChangeRequired.length}건, 모두 구체적 함수/파일명 명시.`);
push(`Level 3 (다음 Sprint에서 구현 가능한 Architecture Blueprint 확정): ${decisionResult.level3Pass ? "PASS" : "FAIL"} -- 최우선 순위 Production 변경 후보(${PRODUCTION_CHANGE_CANDIDATES.find((c) => c.priority === 1)?.name}) 확정, risk/영향범위 명시.`);
push();

push(`--- Decision: ${decisionResult.decision} ---`);
push(decisionResult.rationale);
if (decisionResult.decision === "A") push("-> Incremental Recovery Architecture Prototype Sprint v1 (Production 변경을 포함한 구조적 개선안 검증)");
else if (decisionResult.decision === "B") push("-> Incremental Recovery Architecture Blueprint Revision Sprint v2");
else push("-> Incremental Recovery Research Closeout Sprint v1");
push();

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
console.log(`리포트 저장: ${reportPath}`);
console.log(`Decision: ${decisionResult.decision}`);
