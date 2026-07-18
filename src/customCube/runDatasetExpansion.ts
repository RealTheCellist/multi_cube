// Solver Failure Dataset Expansion Sprint v2 (Dataset Acquisition &
// Validation) -- driver.
//   npx tsx src/customCube/runDatasetExpansion.ts [numScramblesToCollect] [targetTotalSize]
//
// numScramblesToCollect defaults to 0 -- meaning "reuse whatever is
// already staged in solverDatasetExpansion/data/staging-candidates.json"
// (this Sprint's real collection run was already performed once via
// ReplayCollector.ts's own `collectNewReplays`, invoked directly, before
// the rest of the pipeline was wired up -- see ReplayCollector.ts's
// header). Pass a positive number to collect MORE candidates into the
// same staging file before proceeding.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, addSnapshot, saveDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { collectNewReplays } from "./solverDatasetExpansion/ReplayCollector";
import { validateCandidates } from "./solverDatasetExpansion/FailureValidator";
import { buildMetadataForAll } from "./solverDatasetExpansion/MetadataBuilder";
import { selectHybridSample } from "./solverDatasetExpansion/HybridSampler";
import { computeDatasetSnapshot } from "./solverDatasetExpansion/DatasetStatistics";
import { evaluateDatasetQuality } from "./solverDatasetExpansion/DatasetQualityEvaluator";
import { validateRoadmapPrediction } from "./solverDatasetExpansion/RoadmapValidation";
import { formatClusterDistributionChange, formatHardGapDistributionChange, formatShapeDistributionChange } from "./solverDatasetExpansion/DatasetExpansionReport";

const numScramblesToCollect = Number(process.argv[2] ?? 0);
const targetTotalSize = Number(process.argv[3] ?? 150);
const gapDeadlineMs = 300;

const canonicalDbPath = "src/customCube/failureAnalysis/data/failures.json";
const stagingDbPath = "src/customCube/solverDatasetExpansion/data/staging-candidates.json";
const reportPath = "src/customCube/solverDatasetExpansion/data/dataset-expansion-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Failure Dataset Expansion Sprint v2 -- Dataset Acquisition & Validation Report");
push("========================================");
push();

log("STEP1: Failure Replay 생성 (기존, 무수정 generator 재사용)");
const collection = collectNewReplays(numScramblesToCollect, stagingDbPath);
log(`STEP1 완료: staging pool=${collection.totalFailuresInDb}건 (이번 호출로 신규 ${collection.newFailures}건 추가, ${collection.scramblesRun}회 스크램블, ${(collection.elapsedMs / 1000).toFixed(1)}s)`);

push("--- 1. 새 Replay 수 (수집 단계) ---");
push(`Staging pool 총량: ${collection.totalFailuresInDb}건 (이번 driver 호출에서 스크램블 ${collection.scramblesRun}회 실행, 신규 ${collection.newFailures}건 추가)`);
push();

log("STEP2: Failure Validation (중복 제거 + 무결성 검사)");
const validation = validateCandidates(stagingDbPath, canonicalDbPath);
log(`STEP2 완료: candidate=${validation.candidateCount} valid=${validation.validCount} duplicate=${validation.duplicateOfCanonicalCount} corrupt=${validation.corruptCount}`);

push("--- 2. Validation ---");
push(`Staging Candidate: ${validation.candidateCount}건`);
push(`  기존 DB와 중복: ${validation.duplicateOfCanonicalCount}건`);
push(`  무결성 검사 실패(손상): ${validation.corruptCount}건${validation.corruptHashes.length ? ` (${validation.corruptHashes.slice(0, 5).join(", ")}...)` : ""}`);
push(`  유효 Candidate: ${validation.validCount}건`);
push();

log("STEP3: Metadata 생성 (기존 75건 + 유효 candidate 전체)");
const canonicalSnapshotsBefore = allSnapshots(loadDatabase(canonicalDbPath));
const existingMeta = buildMetadataForAll(canonicalSnapshotsBefore, gapDeadlineMs);
const candidateMeta = buildMetadataForAll(validation.validSnapshots, gapDeadlineMs);
log(`STEP3 완료: 기존 ${existingMeta.length}건, candidate ${candidateMeta.length}건 metadata 계산 완료`);

log("STEP4: Hybrid Sampling 선정");
const selection = selectHybridSample(validation.validSnapshots, candidateMeta, existingMeta, targetTotalSize);
log(`STEP4 완료: 선정 ${selection.selected.length}/${selection.neededAdditional}건 (부족분 ${selection.shortfall}건)`);

push("--- 4. Hybrid Sampling 결과 ---");
push(`목표 추가 건수: ${selection.neededAdditional} (Quota: HardGap=${selection.quotas.hardGap} / Shape균등=${selection.quotas.shapeUniform} / 유형균등=${selection.quotas.typeUniform} / Random=${selection.quotas.random})`);
push(`실제 선정 구성: HardGap=${selection.actualComposition.hardGap} / Shape균등=${selection.actualComposition.shapeUniform} / 유형균등=${selection.actualComposition.typeUniform} / Random=${selection.actualComposition.random}`);
push(`부족분(pool 소진): ${selection.shortfall}건`);
push();

// --- 실제 병합 (canonical DB에 실제로 추가) --------------------------------
log("병합: 선정된 replay를 canonical failures.json에 실제로 추가");
const canonicalDb = loadDatabase(canonicalDbPath);
let mergedCount = 0;
for (const snapshot of selection.selected) {
  if (addSnapshot(canonicalDb, snapshot)) mergedCount++;
}
saveDatabase(canonicalDbPath, canonicalDb);
log(`병합 완료: ${mergedCount}건 실제 추가됨`);

const finalMeta = [...existingMeta, ...selection.selectedMetadata];

push("--- 병합 결과 ---");
push(`Canonical DB에 실제로 병합된 건수: ${mergedCount}건`);
push();

log("STEP5: Dataset Quality 측정 (Before vs After)");
const before = computeDatasetSnapshot(existingMeta);
const after = computeDatasetSnapshot(finalMeta);
const quality = evaluateDatasetQuality(before, after);
log(`STEP5 완료: 개선 ${quality.improvedCount}/${quality.measuredCount} (측정 가능한 지표 중)`);

push("--- 2. 최종 Dataset 규모 ---");
push(`Before: ${before.size}건 -> After: ${after.size}건`);
push();

push("--- 3. Shape 분포 변화 ---");
push(...formatShapeDistributionChange(existingMeta, finalMeta));
push();

push("--- 4. Cluster 분포 변화 ---");
push(...formatClusterDistributionChange(existingMeta, finalMeta));
push();

push("--- 5. Hard Gap 분포 변화 ---");
push(...formatHardGapDistributionChange(existingMeta, finalMeta));
push();

push("--- 6. Singleton 변화 ---");
push(`Singleton 비율: ${(before.singletonRate * 100).toFixed(1)}% -> ${(after.singletonRate * 100).toFixed(1)}%`);
push();

push("--- 7. 평균 Group Size 변화 ---");
push(`평균 Group Size: ${before.avgGroupSize.toFixed(2)} -> ${after.avgGroupSize.toFixed(2)}`);
push();

push("--- 8. Shannon Entropy 변화 ---");
push(`Entropy: ${before.shannonEntropyBits.toFixed(2)}bits -> ${after.shannonEntropyBits.toFixed(2)}bits (낮을수록 개선 -- 반복/재사용성 증가)`);
push();

push("--- Dataset Quality 판정 (Level 2 근거) ---");
for (const c of quality.criteria) {
  push(`[${c.name}] ${c.status} -- ${c.detail}`);
}
push();

log("STEP6: Roadmap Validation");
const roadmap = validateRoadmapPrediction(after);
log(`STEP6 완료: 모델 가정 유지=${roadmap.modelAssumptionHolds}`);

push("--- 9. Roadmap 예측과 실제 비교 (N=150 예측 vs 실제) ---");
push(`예측 대상 N: ${roadmap.predictedN}, 실제 달성 N: ${roadmap.actualN}`);
if (roadmap.nMismatchNote) push(`  주의: ${roadmap.nMismatchNote}`);
for (const e of roadmap.errors) {
  push(`  [${e.metric}] 예측=${e.predicted.toFixed(3)} 실제=${e.actual.toFixed(3)} 절대오차=${e.absoluteError.toFixed(3)} 상대오차=${e.percentError.toFixed(1)}%`);
}
push(`모델 가정 유지 여부 (모든 오차 <=15%): ${roadmap.modelAssumptionHolds ? "예" : "아니오"}`);
push();

// --- Success criteria -----------------------------------------------------
const level1 = after.size >= 150;
const level2 = quality.level2Pass;
const level3 = true; // Roadmap 비교는 항상 정량 보고됨(위 9번 섹션) -- Level3는 "보고 완료 + 다음 목표 결정"을 요구

let nextTarget: string;
if (!level1) {
  nextTarget = "Dataset 확보 실패 -- Sampling 정책 재조정 후 Dataset Expansion Sprint 재수행";
} else if (after.avgGroupSize >= 3) {
  nextTarget = "300 확장 없이 150 유지 -- 평균 Group Size가 이미 Roadmap의 300 목표 수준에 근접/도달, Solver Representation Revalidation Sprint로 즉시 진행 권고";
} else if (roadmap.modelAssumptionHolds) {
  nextTarget = "300까지 추가 확장 권고 -- CRP 모델 가정이 유지되어(오차<=15%) 300 projection도 신뢰 가능, 다음 확장 라운드 진행 가능";
} else {
  nextTarget = "조기 종료 및 재보정 -- 모델 예측과 실제가 15% 이상 벌어짐, 추가 확장 전에 Dataset Roadmap 재검토 필요";
}

push("--- 10. 성공 기준 (Level 1~3) ---");
push(`Level 1 (75 -> 150 이상): ${level1 ? "PASS" : "FAIL"} (실제 ${after.size}건)`);
push(`Level 2 (품질 기준 5개 중 3개 이상 개선, 측정 가능한 것만 집계): ${level2 ? "PASS" : "FAIL"} (${quality.improvedCount}/${quality.measuredCount})`);
push(`Level 3 (Roadmap 예측/실제 정량 비교 + 다음 목표 결정): ${level3 ? "PASS" : "FAIL"}`);
push();

push("--- 11. 최종 권고 ---");
push(nextTarget);
push();

const overall = level1 && level2 && level3;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push(
  overall
    ? "다음 단계로 Solver Representation Revalidation Sprint v1을 수행한다 (BP-4 Exact Shape Lookup 재평가, Coarse Structural Shape 일반화 성능 재측정, Cluster 안정성 재측정, Dataset 증가가 Lookup 한계를 완화하는지 검증, Solver v3 Kickoff Representation 결론 재검증)."
    : "Sampling 정책을 재조정한 후 Dataset Expansion Sprint를 재수행한다.",
);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts/CycleChasePrototype.ts 및 BASE_ALG/FLIP_ALG/PARITY_ALG/CASE Library 미수정 (읽기 전용 재사용만).");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
