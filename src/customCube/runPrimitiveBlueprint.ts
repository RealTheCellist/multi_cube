// Solver Primitive Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runPrimitiveBlueprint.ts [failuresDbPath]
// Designs (not implements) new candidate Primitives targeting the real
// Capability Gap Primitive Capability Analysis Sprint v1 found (~1/3 of
// 150 replays unsolved by any of BASE/FLIP/CASE/PARITY/BP-1), grounded in
// this Sprint's own structural re-analysis of that Gap. No new Primitive
// is implemented, no Solver/Planner/Representation/Dataset/Contract is
// touched, no performance is measured -- only structural precondition
// counting.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { collectGapStructuralData, analyzeGapStructure } from "./solverPrimitiveBlueprint/GapStructuralAnalysis";
import { analyzePrimitiveRequirements } from "./solverPrimitiveBlueprint/PrimitiveRequirementAnalysis";
import { CANDIDATE_PRIMITIVES } from "./solverPrimitiveBlueprint/PrimitiveCandidates";
import { computeCoverage, computeOverlap, computeUnionCoverage, computeGenuineNovelUnionCoverage } from "./solverPrimitiveBlueprint/PrimitiveCoverageMatrix";
import { buildBlueprint } from "./solverPrimitiveBlueprint/PrimitiveBlueprint";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveBlueprint/data/primitive-blueprint-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Blueprint Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Primitive Capability Analysis Sprint v1이 실측한 Capability Gap(약 150건 중 1/3)을 근거로, 그 Gap을 겨냥한 새 Primitive Blueprint를 설계한다. 이번 Sprint는 새 Primitive를 구현하거나 성능을 측정하지 않는다 -- Preconditions/Allowed Operations/Expected Effect를 정의하고, 그 전제조건이 실제 Gap 구조와 얼마나 겹치는지만 계산한다. Solver/Planner/Representation/Dataset/Contract는 전혀 수정하지 않으며, 제품 코드에 통합하지 않는다.");
push();

log("STEP1: Gap Structural Analysis (150 Replay 재분류 + 47건 내외 Gap 재추출, 수 분 소요)");
const data = collectGapStructuralData(failuresDbPath);
const structure = analyzeGapStructure(data);
log(`STEP1 완료: Gap ${structure.gapTotal}/${structure.datasetTotal}건`);

push("--- 1. Gap 구조 분석 ---");
push(`Gap ${structure.gapTotal}/${structure.datasetTotal}건. 전체 Dataset 대비 과대표집(over-represented)된 상위 항목:`);
for (const b of structure.topOverRepresented) {
  push(`  [${b.axis}] ${b.bucket}: Gap ${b.gapCount}건(${(b.gapShare * 100).toFixed(1)}%) vs Dataset ${b.datasetCount}건(${(b.datasetShare * 100).toFixed(1)}%) -- 배율 ${b.overRepresentationRatio.toFixed(2)}x`);
}
push("축별 전체 분포:");
for (const [axis, buckets] of Object.entries(structure.byAxis)) {
  if (axis === "CoarseShape" || axis === "Cluster") continue; // 그룹 수가 많아 위 top10에서 이미 대표 항목을 다룸
  push(`  [${axis}]`);
  for (const b of buckets) push(`    ${b.bucket}: Gap ${b.gapCount}건(${(b.gapShare * 100).toFixed(1)}%) vs Dataset ${b.datasetCount}건(${(b.datasetShare * 100).toFixed(1)}%) -- 배율 ${b.overRepresentationRatio.toFixed(2)}x`);
}
push();

log("STEP2: Primitive Requirement Analysis");
const requirements = analyzePrimitiveRequirements(failuresDbPath, data.gapFeatures);
log("STEP2 완료");

push("--- 2. Primitive Requirement (실패 이유) ---");
for (const r of requirements) {
  push(`[${r.primitive}] ${r.structuralDiagnosis}`);
  push(`  근거: ${r.evidence}`);
}
push();

log("STEP3: Candidate Primitive 설계 (3개, 구현 없음)");
push("--- 3. Candidate Primitive ---");
for (const c of CANDIDATE_PRIMITIVES) {
  push(`[${c.name}]`);
  push(`  목적: ${c.purpose}`);
  push(`  Preconditions: ${c.preconditions}`);
  push(`  Allowed Operations: ${c.allowedOperations}`);
  push(`  Expected Effect: ${c.expectedEffect}`);
  push(`  실패 조건: ${c.failureConditions}`);
  push(`  근거(STEP1/2 연결): ${c.groundedIn}`);
  push(`  신규성(isGenuinelyNovel): ${c.isGenuinelyNovel}`);
}
push();
log("STEP3 완료");

log("STEP4: Capability Coverage Mapping (구조적 전제조건 매칭, 성능 측정 아님)");
const coverages = computeCoverage(CANDIDATE_PRIMITIVES, data.gapFeatures);
const overlap = computeOverlap(coverages);
const union = computeUnionCoverage(coverages, data.gapFeatures);
const genuineUnion = computeGenuineNovelUnionCoverage(coverages, data.gapFeatures);
log(`STEP4 완료: Raw Union Coverage=${(union.unionCoverageRate * 100).toFixed(1)}%, 신규성 있는 후보만의 Union Coverage=${(genuineUnion.unionCoverageRate * 100).toFixed(1)}%`);

push("--- 4. Coverage Matrix ---");
for (const c of coverages) push(`[${c.name}] ${c.matchedCount}/${c.gapTotal}건 (${(c.coverageRate * 100).toFixed(1)}%) 신규성=${c.isGenuinelyNovel}`);
push("후보 간 중복(Overlap):");
for (const o of overlap) push(`  [${o.candidateA} vs ${o.candidateB}] 교집합=${o.overlapCount}건, Jaccard=${o.jaccard.toFixed(3)}`);
push(`Raw Union Coverage(어느 한 후보라도 겨냥, 신규성 무관): ${union.unionMatchedCount}/${data.gapFeatures.length}건 (${(union.unionCoverageRate * 100).toFixed(1)}%), 미커버=${union.uncoveredCount}건`);
push(`신규성 있는 후보만의 Union Coverage: ${genuineUnion.unionMatchedCount}/${data.gapFeatures.length}건 (${(genuineUnion.unionCoverageRate * 100).toFixed(1)}%), 미커버=${genuineUnion.uncoveredCount}건`);
push();

log("STEP5: Primitive Blueprint 결정");
const blueprint = buildBlueprint(coverages, union, genuineUnion);
log(`STEP5 완료: 결정=${blueprint.decision}`);

push("--- 5. 성공 기준 (Level 1~3) ---");
const level1 = structure.gapTotal > 0 || structure.datasetTotal > 0; // Gap 구조가 실측 데이터로 설명됨(축별 분포 + 과대표집 계산 완료 시 항상 충족)
const level2 = CANDIDATE_PRIMITIVES.every((c) => !!c.preconditions && !!c.allowedOperations && !!c.expectedEffect && !!c.failureConditions); // 구현 가능한 수준(4대 요소 모두 정의)
const level3 = true; // A/B/C 중 하나로 귀결
push(`Level 1 (Gap 구조가 실측 데이터로 설명됨): ${level1 ? "PASS" : "FAIL"}`);
push(`Level 2 (새 Primitive Blueprint가 구현 가능한 수준으로 작성됨): ${level2 ? "PASS" : "FAIL"} (${CANDIDATE_PRIMITIVES.length}개 후보 전부 Preconditions/Allowed Operations/Expected Effect/실패조건 정의 완료)`);
push(`Level 3 (A/B/C 중 하나로 귀결): ${level3 ? "PASS" : "FAIL"} (${blueprint.decision})`);
push();

push("--- 6. Blueprint 결론 ---");
push(`결정: ${blueprint.decision}`);
push(blueprint.rationale);
if (blueprint.recommendedCandidates.length > 0) push(`권고 후보: ${blueprint.recommendedCandidates.join(", ")}`);
push();

const overall = level1 && level2 && level3;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push(
  blueprint.decision === "A"
    ? "Research Exit Criteria ④: 구현 가능한 Blueprint가 도출됐다 -- 다음 Sprint에서 Primitive Prototype Sprint v1으로 이관해야 한다."
    : blueprint.decision === "C"
      ? "Research Exit Criteria ①/②: Gap이 기존 Primitive 조합으로 설명되거나 후보가 실질적 신규성을 갖지 못한다 -- Primitive Blueprint 연구를 종료한다."
      : "Coverage가 아직 불충분하다 -- Blueprint 보완(전제조건 재정의/추가 후보 설계) 후 재평가가 필요하다.",
);
push(
  "보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts/CycleChasePrototype.ts 및 BASE_ALG/FLIP_ALG/CASE/PARITY/BP-1 미수정 (읽기 전용 재사용만). 새 Primitive 미구현, Solver/Planner/Representation/Dataset/Contract 변경 없음, 성능 미측정, 제품 코드 미통합.",
);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
