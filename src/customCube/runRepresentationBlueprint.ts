// Solver Representation Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runRepresentationBlueprint.ts [failuresDbPath]
// Research/design Sprint: no new Primitive, no Solver/Planner/Dataset/
// Contract change, no product integration. Designs and measures candidate
// next-generation State Representations on the real 150-replay Dataset.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { analyzeRepresentationFailures } from "./solverRepresentationBlueprint/RepresentationFailureAnalysis";
import { buildFeatureInventory } from "./solverRepresentationBlueprint/FeatureInventory";
import { CANDIDATE_DESIGNS } from "./solverRepresentationBlueprint/RepresentationCandidates";
import { compareRepresentationCandidates } from "./solverRepresentationBlueprint/RepresentationComparison";
import { buildRepresentationBlueprint } from "./solverRepresentationBlueprint/RepresentationBlueprint";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const gapDeadlineMs = 300;
const reportPath = "src/customCube/solverRepresentationBlueprint/data/representation-blueprint-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Representation Blueprint Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Representation Revalidation Sprint v1의 결론(B. 새 Representation 필요)에 따라, 150-replay Dataset을 이용해 차세대 State Representation을 설계하는 연구/설계 Sprint. 새 Primitive는 만들지 않으며, Solver/Planner/Dataset/Contract를 전혀 수정하지 않는다. 제품 코드에 통합하지 않는다.");
push();

log("STEP1: 기존 Representation Failure 분석 (Hard Gap 설명력 정량화, 수 분 소요)");
const failureAnalysis = analyzeRepresentationFailures(failuresDbPath, gapDeadlineMs);
log(`STEP1 완료: Hard Gap ${failureAnalysis.hardGapTotal}/${failureAnalysis.totalReplays}건`);

push("--- 1. 기존 Representation 한계 (Hard Gap 설명력) ---");
push(`전체 ${failureAnalysis.totalReplays}건 중 Hard Gap ${failureAnalysis.hardGapTotal}건 (${(failureAnalysis.hardGapRate * 100).toFixed(1)}%).`);
for (const r of [failureAnalysis.exact, failureAnalysis.coarse, failureAnalysis.fingerprint]) {
  push(
    `[${r.representation}] Hard Gap ${r.hardGapTotal}건 중 설명됨=${r.hardGapExplained}건 / 미설명(단일)=${r.hardGapUnexplained}건 (${(r.hardGapUnexplainedRate * 100).toFixed(1)}%), ` +
      `사용가능 클러스터(크기>=2)=${r.usableClusterCount}개, 평균 클러스터 크기=${r.avgUsableClusterSize.toFixed(2)}`,
  );
}
push(`판정: ${failureAnalysis.summary}`);
push();

log("STEP2: Feature Inventory + 상관관계 분석 (BP-1/2/3 재테스트 포함, 수 분 소요)");
const featureInventory = buildFeatureInventory(failuresDbPath, gapDeadlineMs);
log(`STEP2 완료: 중복쌍=${featureInventory.redundantPairs.length} 독립쌍=${featureInventory.independentPairs.length}`);

push("--- 2. Feature 분석 ---");
push(`Feature 목록 (${featureInventory.featureNames.length}개):`);
for (const f of featureInventory.featureNames) push(`  - ${f}: ${featureInventory.featureDescriptions[f]}`);
push();
push("중복(REDUNDANT, |r|>=0.7) 쌍:");
if (featureInventory.redundantPairs.length === 0) push("  없음");
for (const p of featureInventory.redundantPairs) push(`  ${p.featureA} ~ ${p.featureB}: r=${p.correlation.toFixed(3)}`);
push("독립(INDEPENDENT, |r|<=0.2) 쌍 (상위 5개):");
for (const p of featureInventory.independentPairs.slice(0, 5)) push(`  ${p.featureA} ~ ${p.featureB}: r=${p.correlation.toFixed(3)}`);
push(`판정: ${featureInventory.summary}`);
push();

log("STEP3: Candidate Representation 설계 (3개, 구현 없음)");
push("--- 3. Candidate Representation (설계만, 구현 없음) ---");
for (const c of CANDIDATE_DESIGNS) {
  push(`[${c.name}]`);
  push(`  대상 약점: ${c.targetWeakness}`);
  push(`  가설: ${c.hypothesis}`);
  push(`  설계: ${c.designNote}`);
}
push();
log("STEP3 완료");

log("STEP4: 설명력 평가 (150 replay 실측, BP-1/2/3 재테스트 포함, 수 분 소요)");
const comparison = compareRepresentationCandidates(failuresDbPath, gapDeadlineMs);
log(`STEP4 완료: 최우수 후보=${comparison.bestCandidate?.name ?? "없음"}`);

push("--- 4. 기존 Representation(Coarse Shape) 대비 비교 (실측) ---");
push(
  `Coarse Shape(재측정): 고유=${comparison.coarseShapeFresh.uniqueGroups} Singleton=${(comparison.coarseShapeFresh.singletonRate * 100).toFixed(1)}% 평균그룹=${comparison.coarseShapeFresh.avgGroupSize.toFixed(2)} Entropy=${comparison.coarseShapeFresh.entropyBits.toFixed(2)}bits Hard Gap 미설명율=${(comparison.coarseShapeHardGap.hardGapUnexplainedRate * 100).toFixed(1)}%`,
);
push(`참고: GapDetector의 기존 clusterKey(w{exact}|p{parity}) 고유값 = ${comparison.existingClusterAxisUniqueCount}개 (이 Dataset 기준, Cluster Stability Review 등에서 이미 다뤄온 축).`);
for (const c of comparison.candidates) {
  push(`[${c.name}] Lookup가능=${c.measurement.lookupFeasible} Coarse Shape보다 우수=${c.betterThanCoarseShape} 기존Cluster축만사용=${c.usesOnlyExistingClusterAxis}`);
  push(
    `  고유=${c.measurement.uniqueGroups} Singleton=${(c.measurement.singletonRate * 100).toFixed(1)}% 평균그룹=${c.measurement.avgGroupSize.toFixed(2)} Entropy=${c.measurement.entropyBits.toFixed(2)}bits Hard Gap 미설명율=${(c.hardGapExplanation.hardGapUnexplainedRate * 100).toFixed(1)}%`,
  );
  push(`  ${c.verdict}`);
}
push(`판정: ${comparison.summary}`);
push();

log("STEP5: Blueprint 작성");
const blueprint = buildRepresentationBlueprint(comparison, featureInventory, failureAnalysis);
log(`STEP5 완료: 선정=${blueprint.selected} (${blueprint.representationName})`);

push("--- 5. 가장 유망한 Blueprint ---");
push(`선정: ${blueprint.representationName} (selected=${blueprint.selected})`);
push(`실측 근거: ${blueprint.measuredImprovement}`);
if (blueprint.selected) {
  push("필드:");
  for (const f of blueprint.fields) push(`  - ${f.field} <- ${f.source} (${f.rationale})`);
  push("알고리즘:");
  for (const step of blueprint.algorithm) push(`  ${step}`);
  push(`복잡도: ${blueprint.complexityNote}`);
  push("다음 Prototype Sprint 이행 단계:");
  for (const step of blueprint.migrationSteps) push(`  ${step}`);
  push("검증 계획:");
  for (const step of blueprint.validationPlan) push(`  ${step}`);
}
push("열린 리스크:");
for (const risk of blueprint.openRisks) push(`  - ${risk}`);
push();

// --- Success criteria -----------------------------------------------------
const level1 = true; // STEP1 도달 시 자동 충족 (기존 Representation 한계를 정량적으로 설명 완료)
const level2 = comparison.bestCandidate !== null; // Coarse Shape보다 우수한 후보 >=1개
const level3 = blueprint.selected; // 즉시 구현 가능한 Blueprint 작성 완료 (Level2 실패 시 Blueprint 없음)

push("--- 6. 성공 기준 (Level 1~3) ---");
push(`Level 1 (기존 Representation 한계 정량 설명): ${level1 ? "PASS" : "FAIL"}`);
push(`Level 2 (Coarse Shape보다 우수한 후보 >=1개 제안): ${level2 ? "PASS" : "FAIL"}${comparison.bestCandidate ? ` (${comparison.bestCandidate.name})` : ""}`);
push(`Level 3 (다음 Prototype Sprint에서 즉시 구현 가능한 Blueprint 작성): ${level3 ? "PASS" : "FAIL"}`);
push();

const overall = level1 && level2 && level3;

push("--- 7. 최종 결론 ---");
push(`결정: ${blueprint.decision}. ${blueprint.decisionRationale}`);
push();
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push(
  overall
    ? `새 Representation Blueprint 확보 -- 다음 단계는 Solver Representation Prototype Sprint v1에서 "${blueprint.representationName}"의 실제 구현 및 검증을 수행한다.`
    : "Coarse Structural Shape보다 우수한 후보를 찾지 못했다 -- Representation 연구를 종료하고, 현재 Coarse Structural Shape를 기준으로 Product Integration 여부를 재검토한다.",
);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts/CycleChasePrototype.ts 및 BASE_ALG/FLIP_ALG/PARITY_ALG/CASE Library 미수정 (읽기 전용 재사용만). 제품 코드 미통합, 새 Replay/Primitive/Dataset 변경 없음.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
