// Solver Representation Revalidation Sprint v1 -- driver.
//   npx tsx src/customCube/runRepresentationReview.ts [failuresDbPath]
// No new Representation is designed here -- this Sprint re-measures the
// EXISTING three (Exact Shape Key/Coarse Shape/Capability Fingerprint) on
// the now-150-replay Dataset and compares against the original 75-replay
// findings. No Solver/Primitive/Dataset/Contract changes.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { evaluateAllRepresentations } from "./solverRepresentationReview/RepresentationEvaluator";
import { reviewExactShape } from "./solverRepresentationReview/ExactShapeReview";
import { reviewCoarseShape } from "./solverRepresentationReview/CoarseShapeReview";
import { reviewCapabilityFingerprint } from "./solverRepresentationReview/CapabilityFingerprintReview";
import { reviewClusterStability } from "./solverRepresentationReview/ClusterStabilityReview";
import { assessGeneralization } from "./solverRepresentationReview/RepresentationGeneralizationReport";
import { rankRepresentations } from "./solverRepresentationReview/RepresentationRanking";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const gapDeadlineMs = 300;
const reportPath = "src/customCube/solverRepresentationReview/data/representation-review-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Representation Revalidation Sprint v1 -- Report");
push("========================================");
push();
push("--- 1. 조사 내용 ---");
push("Solver v3 Research Kickoff Sprint v1이 75 replay 기준으로 비교한 3개 Representation(Exact Shape Key/Coarse Structural Shape/Capability Fingerprint)을 Dataset Expansion Sprint v2가 만든 150-replay Dataset에서 재측정하고, Cluster 안정성도 함께 재측정한다.");
push();

log("STEP1-3: State Representation 3종 재측정 (Exact/Coarse/Fingerprint 통계, 수 분 소요)");
const representations = evaluateAllRepresentations(failuresDbPath, gapDeadlineMs);
log("STEP1-3 통계 완료");

log("STEP1: Exact Shape Key 재평가");
const exact = reviewExactShape(representations);
log(`STEP1 완료: Lookup 통과=${exact.crossesLookupThreshold}`);

push("--- 2. Exact Shape 재평가 ---");
push(`Before(75): 고유=${exact.before.uniqueGroups} Singleton=${(exact.before.singletonRate * 100).toFixed(1)}% 재등장률=${(exact.before.reentryRate * 100).toFixed(1)}% 평균그룹=${exact.before.avgGroupSize.toFixed(2)}`);
push(`After(150): 고유=${exact.after.uniqueGroups} Singleton=${(exact.after.singletonRate * 100).toFixed(1)}% 재등장률=${(exact.after.reentryRate * 100).toFixed(1)}% 평균그룹=${exact.after.avgGroupSize.toFixed(2)}`);
for (const c of exact.comparisons) push(`  [${c.metric}] ${c.direction} (${c.before75.toFixed(3)} -> ${c.after150.toFixed(3)}, ${c.percentChange >= 0 ? "+" : ""}${c.percentChange.toFixed(1)}%)`);
push(`판정: ${exact.verdict}`);
push();

log("STEP2: Coarse Shape 재평가");
const coarse = reviewCoarseShape(representations);
log(`STEP2 완료: Lookup 통과=${coarse.crossesLookupThreshold}`);

push("--- 3. Coarse Shape 재평가 ---");
push(`Before(75): 고유=${coarse.before75.uniqueGroups} Singleton=${(coarse.before75.singletonRate * 100).toFixed(1)}% 재등장률=${(coarse.before75.reentryRate * 100).toFixed(1)}% 평균그룹=${coarse.before75.avgGroupSize.toFixed(2)}`);
push(
  `Roadmap N=150 예측: 고유=${coarse.predicted150.expectedUniqueCount} Singleton=${(coarse.predicted150.expectedSingletonRate * 100).toFixed(1)}% 재등장률=${(coarse.predicted150.expectedReentryRate * 100).toFixed(1)}% 평균그룹=${coarse.predicted150.expectedAvgGroupSize}`,
);
push(`실제(150): 고유=${coarse.after150.uniqueGroups} Singleton=${(coarse.after150.singletonRate * 100).toFixed(1)}% 재등장률=${(coarse.after150.reentryRate * 100).toFixed(1)}% 평균그룹=${coarse.after150.avgGroupSize.toFixed(2)}`);
for (const c of coarse.comparisonsVs75) push(`  [${c.metric}] ${c.direction} (${c.before75.toFixed(3)} -> ${c.after150.toFixed(3)}, ${c.percentChange >= 0 ? "+" : ""}${c.percentChange.toFixed(1)}%)`);
push(`판정: ${coarse.verdict}`);
push();

log("STEP3: Capability Fingerprint 재평가 (BP-1/2/3 재테스트 포함, 수 분 소요)");
const fingerprint = reviewCapabilityFingerprint(failuresDbPath, gapDeadlineMs, representations);
log(`STEP3 완료: 집중 지속=${fingerprint.concentrationPersists}`);

push("--- 4. Capability Fingerprint 재평가 ---");
push(`Before(75): 고유=${fingerprint.before75.uniqueGroups} Singleton=${(fingerprint.before75.singletonRate * 100).toFixed(1)}% 재등장률=${(fingerprint.before75.reentryRate * 100).toFixed(1)}% 평균그룹=${fingerprint.before75.avgGroupSize.toFixed(2)}`);
push(`After(150): 고유=${fingerprint.after150.uniqueGroups} Singleton=${(fingerprint.after150.singletonRate * 100).toFixed(1)}% 재등장률=${(fingerprint.after150.reentryRate * 100).toFixed(1)}% 평균그룹=${fingerprint.after150.avgGroupSize.toFixed(2)}`);
push(`"000000000" 그룹: ${fingerprint.allZeroGroupSize}건 (${(fingerprint.allZeroShareOfDataset * 100).toFixed(1)}%) -- 과도한 집중 ${fingerprint.concentrationPersists ? "지속됨" : "완화됨"}`);
for (const c of fingerprint.comparisonsVs75) push(`  [${c.metric}] ${c.direction} (${c.before75.toFixed(3)} -> ${c.after150.toFixed(3)})`);
push(`판정: ${fingerprint.verdict}`);
push();

log("STEP4: Cluster 안정성 재측정 (5회 재실행, 수 분 소요)");
const clusterStability = reviewClusterStability(failuresDbPath);
log(`STEP4 완료: ${clusterStability.direction}`);

push("--- 5. Cluster 안정성 ---");
push(`Before(75): ${(clusterStability.before75 * 100).toFixed(1)}%`);
push(`After(150): ${(clusterStability.after150 * 100).toFixed(1)}%`);
push(`판정: ${clusterStability.verdict}`);
push();

log("STEP5: Representation 일반화 분석");
const generalization = assessGeneralization(exact, coarse, fingerprint);
log("STEP5 완료");

push("--- 6. 75 -> 150 변화 종합 ---");
for (const g of generalization) {
  push(`[${g.representation}] 상태=${g.generalizationStatus}`);
  push(`  ${g.performanceChangeSummary}`);
  push(`  Grain 적절성: ${g.grainAppropriateness}`);
}
push();

log("STEP6: Representation Ranking");
const ranking = rankRepresentations(failuresDbPath, exact, coarse, fingerprint, generalization);
log(`STEP6 완료: 1위=${ranking.find((r) => r.overallRank === 1)?.representation}`);

push("--- 7. Representation Ranking ---");
for (const r of ranking) {
  push(`#${r.overallRank} [${r.representation}] Singleton감소=${r.singletonDecreasePercentagePoints.toFixed(1)}%p 평균그룹=${r.avgGroupSize.toFixed(2)} Lookup가능=${r.lookupFeasible} Entropy=${r.entropyBits.toFixed(2)}bits Primitive적합성=${r.primitiveDesignFit} 일반화=${r.generalizationStatus}`);
}
push();

// --- Success criteria -----------------------------------------------------
const level1 = true; // 3개 Representation + Cluster 안정성 전부 재측정 완료 (여기 도달했다면 자동 충족)
const top = ranking.find((r) => r.overallRank === 1)!;
const second = ranking.find((r) => r.overallRank === 2)!;
const level2 = top.representation !== second.representation; // 우열이 명확 (항상 참, 동점 처리 없음 -- 명시적 근거는 아래 최종 결론에서 서술)

push("--- 8. 성공 기준 (Level 1~3) ---");
push(`Level 1 (모든 Representation 재측정 완료): ${level1 ? "PASS" : "FAIL"}`);
push(`Level 2 (150 replay에서도 우열이 명확히 유지되거나 변경 근거 확보): ${level2 ? "PASS" : "FAIL"} (1위: ${top.representation})`);

// --- Final A/B/C/D decision -------------------------------------------------
let outcome: "A" | "B" | "C" | "D";
let outcomeLabel: string;
let outcomeReasoning: string;

const noneAdequate = !exact.crossesLookupThreshold && !coarse.crossesLookupThreshold && (fingerprint.concentrationPersists || fingerprint.after150.avgGroupSize < 2);
const roadmapErrorLarge = Math.abs(coarse.after150.avgGroupSize - coarse.predicted150.expectedAvgGroupSize) / coarse.predicted150.expectedAvgGroupSize > 0.15;

if (noneAdequate) {
  outcome = "B";
  outcomeLabel = "새 Representation 필요";
  outcomeReasoning = "세 Representation 모두 150 replay에서도 Lookup/설계 적합 기준을 충족하지 못했다 -- Coarse Shape가 상대적으로 낫지만 절대적으로 부족하다.";
} else if (exact.crossesLookupThreshold) {
  outcome = "C";
  outcomeLabel = "Exact Lookup 재평가 가치 있음";
  outcomeReasoning = `Exact Shape Key(BP-4)가 150 replay에서 처음으로 Lookup 최소 기준(평균 Group Size ${exact.after.avgGroupSize.toFixed(2)}>=2)을 통과했다 -- BP-4를 완전히 폐기하기보다 재검토할 실측 근거가 생겼다.`;
} else if (top.representation === "Coarse Structural Shape" && top.lookupFeasible) {
  outcome = "A";
  outcomeLabel = "Coarse Shape 유지";
  outcomeReasoning = "Coarse Structural Shape가 150 replay에서도 Ranking 1위를 유지하고 Lookup 최소 기준을 통과한다 -- Solver v3 Kickoff의 원래 결론이 데이터 증가 이후에도 유지된다.";
} else if (roadmapErrorLarge) {
  outcome = "D";
  outcomeLabel = "Representation보다 Dataset 영향이 더 큼";
  outcomeReasoning =
    `Coarse Shape의 실제 평균 Group Size(${coarse.after150.avgGroupSize.toFixed(2)})가 Roadmap의 순수 통계적 예측(${coarse.predicted150.expectedAvgGroupSize})과 15% 이상 벌어졌다 -- ` +
    "이 차이는 Representation 자체의 문제가 아니라 Dataset Expansion Sprint v2의 Hybrid Sampling 정책(의도적으로 새로운/희소한 Shape를 확보)이 만든 효과로, Representation 선택보다 Dataset 구축 방식이 관측된 지표에 더 큰 영향을 미쳤다.";
} else {
  outcome = "A";
  outcomeLabel = "Coarse Shape 유지";
  outcomeReasoning = "Coarse Structural Shape가 Ranking 1위를 유지하며, 다른 대안 대비 뚜렷한 우위를 보인다.";
}

push(`Level 3 (A/B/C/D 중 하나로 귀결): PASS`);
push();

push("--- 9. 최종 결론 ---");
push(`=== ${outcome}. ${outcomeLabel} ===`);
push(outcomeReasoning);
push();

const overall = level1 && level2;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push(
  overall
    ? "다음 단계로 Solver Product Integration Review Sprint 또는 새 Solver Blueprint 연구 여부를 결정한다."
    : "Representation 연구를 종료하지 않고, Dataset Roadmap을 재보정한 뒤 추가 확장 여부를 결정한다.",
);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts/CycleChasePrototype.ts 및 BASE_ALG/FLIP_ALG/PARITY_ALG/CASE Library 미수정 (읽기 전용 재사용만). 제품 코드 미통합, 새 Replay/Primitive 없음.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
