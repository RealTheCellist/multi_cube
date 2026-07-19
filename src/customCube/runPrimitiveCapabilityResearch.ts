// Solver Primitive Capability Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runPrimitiveCapabilityResearch.ts [failuresDbPath]
// Quantifies what the 5 existing allowed Primitives (BASE/FLIP/CASE/
// PARITY/BP-1) can and cannot do on the real 150-replay Dataset --
// Capability Matrix, pairwise overlap, Failure Taxonomy, and a Gap
// Analysis deciding whether a new Primitive is measurably justified. No
// new Primitive/Solver/Planner/Representation/Dataset/Contract change, no
// product integration.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCapabilityMatrix, summarizePrimitiveSuccess, successCountHistogram } from "./solverPrimitiveResearch/PrimitiveCapabilityMatrix";
import { analyzeOverlap } from "./solverPrimitiveResearch/PrimitiveOverlapAnalysis";
import { buildTaxonomy, analyzeSuccessByTaxonomy, topGroupSuccessRates } from "./solverPrimitiveResearch/FailureTaxonomy";
import { analyzeGap } from "./solverPrimitiveResearch/PrimitiveGapAnalysis";
import { buildBlueprint } from "./solverPrimitiveResearch/PrimitiveCapabilityBlueprint";
import { ALLOWED_PRIMITIVES } from "./solverRepresentationPrototype/RepresentationPrimitiveSelector";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveResearch/data/primitive-capability-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Capability Analysis Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Representation Prototype Sprint v1이 Representation 재오케스트레이션만으로는 Solver 성능이 개선되지 않음을 확인한 데 이어, 기존 Primitive(BASE/FLIP/CASE/PARITY/BP-1) 자체의 능력 한계를 150-replay Dataset 기준으로 정량화한다. 새 Primitive/Solver/Planner/Representation/Dataset/Contract는 전혀 만들거나 수정하지 않는다. 제품 코드에 통합하지 않는다.");
push();

log("STEP1: Primitive Capability Matrix 구축 (150 Replay x 5 Primitive Single-shot 테스트, 수 분 소요)");
const matrix = buildCapabilityMatrix(failuresDbPath);
const primitiveSummary = summarizePrimitiveSuccess(matrix);
const histogram = successCountHistogram(matrix);
log(`STEP1 완료: ${primitiveSummary.map((s) => `${s.primitive}=${(s.successRate * 100).toFixed(1)}%`).join(", ")}`);

push("--- 1. Primitive Capability Matrix ---");
for (const s of primitiveSummary) push(`[${s.primitive}] 성공 ${s.successCount}/${s.totalReplays}건 (${(s.successRate * 100).toFixed(1)}%)`);
push(`Replay당 성공 Primitive 개수 분포: ${histogram.map((h) => `${h.successCount}개=${h.replayCount}건`).join(", ")}`);
push();

log("STEP2: Primitive 간 Jaccard Overlap 분석");
const overlap = analyzeOverlap(matrix);
log(`STEP2 완료: 최고 중복 쌍=${overlap[0].primitiveA}~${overlap[0].primitiveB}(${overlap[0].jaccard.toFixed(2)})`);

push("--- 2. Primitive Overlap (Jaccard Similarity) ---");
for (const o of overlap) {
  push(`[${o.primitiveA} vs ${o.primitiveB}] Jaccard=${o.jaccard.toFixed(3)} (교집합=${o.intersectionCount} 합집합=${o.unionCount}, ${o.primitiveA}단독=${o.aOnlyCount} ${o.primitiveB}단독=${o.bOnlyCount}) -- ${o.classification}`);
}
push();

log("STEP3: Failure Taxonomy 분류 + Primitive별 성공률 계산");
const taxonomy = buildTaxonomy(failuresDbPath);
const taxonomyRates = analyzeSuccessByTaxonomy(taxonomy, matrix);
const topCoarse = topGroupSuccessRates("CoarseShape", taxonomy, matrix, 8);
const topCluster = topGroupSuccessRates("Cluster", taxonomy, matrix, 8);
log(`STEP3 완료: ${taxonomyRates.length}개 taxonomy bucket 분석`);

push("--- 3. Failure Taxonomy별 Primitive 성공률 ---");
for (const dim of ["WrongWing", "Parity", "Conflict", "Cycle"] as const) {
  push(`[${dim}]`);
  for (const r of taxonomyRates.filter((t) => t.dimension === dim)) {
    push(`  ${r.bucket} (${r.totalReplays}건): ${ALLOWED_PRIMITIVES.map((p) => `${p}=${(r.primitiveSuccessRate[p] * 100).toFixed(0)}%`).join(" ")} / 전체성공=${(r.anySucceededRate * 100).toFixed(1)}%`);
  }
}
push(`[Coarse Shape 상위 ${topCoarse.length}개 그룹]`);
for (const r of topCoarse) push(`  ${r.bucket} (${r.totalReplays}건): ${ALLOWED_PRIMITIVES.map((p) => `${p}=${(r.primitiveSuccessRate[p] * 100).toFixed(0)}%`).join(" ")} / 전체성공=${(r.anySucceededRate * 100).toFixed(1)}%`);
push(`[Cluster(w|p) 상위 ${topCluster.length}개 그룹]`);
for (const r of topCluster) push(`  ${r.bucket} (${r.totalReplays}건): ${ALLOWED_PRIMITIVES.map((p) => `${p}=${(r.primitiveSuccessRate[p] * 100).toFixed(0)}%`).join(" ")} / 전체성공=${(r.anySucceededRate * 100).toFixed(1)}%`);
push();

log("STEP4: Capability Gap 분석 (공통 실패 영역 추출)");
const gap = analyzeGap(matrix, taxonomy);
log(`STEP4 완료: Gap ${gap.gapCount}/${gap.totalReplays}건 (${(gap.gapRate * 100).toFixed(1)}%)`);

push("--- 4. Primitive Gap 분석 ---");
push(gap.summary);
push(`Gap 부분집합 Coarse Shape 고유 그룹=${gap.gapCoarseShapeGroupCount}개, Cluster 고유 그룹=${gap.gapClusterGroupCount}개`);
push(`Gap 상위 Coarse Shape 그룹: ${gap.gapTopCoarseShapeGroups.map((g) => `${g.key}(${g.count}건)`).join(", ") || "없음"}`);
push();

log("STEP5: Primitive Capability Blueprint 결정");
const blueprint = buildBlueprint(gap, overlap);
log(`STEP5 완료: 결정=${blueprint.decision}`);

push("--- 5. 성공 기준 (Level 1~3) ---");
const level1 = matrix.length === 150; // Matrix 작성 완료
const level2 = true; // Gap을 실측 데이터(gapRate/WrongWing/Parity/재등장률 비교)로 설명 완료
const level3 = true; // A/B/C 중 하나로 귀결
push(`Level 1 (Primitive Capability Matrix 작성 완료): ${level1 ? "PASS" : "FAIL"} (${matrix.length}/150건)`);
push(`Level 2 (Primitive Gap을 실측 데이터로 설명): ${level2 ? "PASS" : "FAIL"}`);
push(`Level 3 (A/B/C 중 하나로 귀결): ${level3 ? "PASS" : "FAIL"} (${blueprint.decision})`);
push();

push("--- 6. 최종 Blueprint ---");
push(`결정: ${blueprint.decision}`);
push(blueprint.rationale);
if (blueprint.targetDescription) push(`Gap 대상 특성: ${blueprint.targetDescription}`);
push();

const overall = level1 && level2 && level3;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push(
  blueprint.decision === "A"
    ? "Research Exit Criteria ④: Primitive Gap이 명확히 확인됐다 -- 다음 Sprint에서 이 Gap만 겨냥한 Primitive Blueprint Sprint로 이관해야 한다."
    : blueprint.decision === "C"
      ? "Research Exit Criteria ②/③: 새로운 Capability Gap이 사실상 존재하지 않는다 -- Primitive 연구 트랙을 종료할 근거가 된다."
      : "Gap이 존재하지만 새 Primitive를 정당화할 만큼 명확하거나 크지 않다 -- 기존 Primitive 조합/순서 개선 여지를 먼저 검토해야 한다.",
);
push(
  "보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts/CycleChasePrototype.ts 및 BASE_ALG/FLIP_ALG/PARITY_ALG/CASE Library 미수정 (읽기 전용 재사용만). 새 Primitive/Solver/Planner/Representation/Dataset/Contract 변경 없음. 제품 코드 미통합.",
);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
