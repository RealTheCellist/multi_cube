// Solver v3 Research Kickoff Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverV3ResearchKickoff.ts [failuresDbPath]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { evaluateDatasetAdequacy } from "./solverV3Research/FailureDatasetAdequacy";
import { reclassifyHardGap } from "./solverV3Research/HardGapReclassifier";
import { evaluateStateRepresentationCandidates } from "./solverV3Research/StateRepresentationCandidates";
import { buildPrimitiveCapabilityGapReport } from "./solverV3Research/PrimitiveCapabilityGapReport";
import { reviewWantsGraph } from "./solverV3Research/WantsGraphReview";
import { synthesizeSolverV3Blueprint } from "./solverV3Research/SolverV3Blueprint";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const gapDeadlineMs = 300;
const reportPath = "src/customCube/solverV3Research/data/kickoff-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => {
  console.log(s);
};

push("========================================");
push("Solver v3 Research Kickoff Sprint v1 -- Kickoff Report");
push("========================================");
push();

// --- STEP0: Gate -----------------------------------------------------------
log("STEP0: Failure Dataset Adequacy Gate 측정 시작 (수 분 소요)");
const gate = evaluateDatasetAdequacy(failuresDbPath);
log(`STEP0 완료: ${gate.overall}`);

push("--- STEP0: Failure Dataset Adequacy Gate ---");
push(`Shape 재등장률: ${(gate.metrics.shapeReentryRate * 100).toFixed(1)}% -> ${gate.shapeReentryTier}`);
push(`Cluster 안정성: ${(gate.metrics.clusterStabilityRate * 100).toFixed(1)}% -> ${gate.clusterStabilityTier}`);
push(`Replay 다양성: ${(gate.metrics.replayDiversityRate * 100).toFixed(1)}% -> ${gate.replayDiversityTier}`);
push(`참고: Hard Gap 빈도 (5회 평균) ${(gate.metrics.hardGapFrequency * 100).toFixed(1)}% (${gate.metrics.hardGapCountsAcrossRuns.join(", ")})`);
push(`=== STEP0 Gate 종합 판정: ${gate.overall} ===`);
push();

if (gate.overall === "FAIL") {
  push("STEP0 FAIL -- STEP1~5를 수행하지 않고 Sprint를 여기서 종료한다.");
  push("STEP0의 FAIL은 Sprint 실패가 아니라, 연구 지속의 전제가 성립하지 않음을 확인한 유효한 연구 결과다.");
  push("결론: D. Dataset 부적합으로 판단 보류. 13절 Research Exit Criteria의 Dataset 조항 발동 -- Solver v3 Primitive 연구 트랙 전체 종료.");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join("\n"), "utf-8");
  log("\n" + lines.join("\n"));
  process.exit(0);
}

push(`(Gate=${gate.overall} -- 이하 모든 결론에 데이터 한계가 명시적으로 반영됨)`);
push();

// --- STEP1: Hard Gap Reclassification ---------------------------------------
log("STEP1: Hard Gap 재분류 (BP-1/2/3 결합 측정 3회, 수 분 소요)");
const reclassification = reclassifyHardGap(failuresDbPath, gapDeadlineMs);
log(`STEP1 완료: avg over-classification rate ${(reclassification.avgOverClassificationRate * 100).toFixed(1)}%`);

push("--- STEP1: Hard Gap 재분류 ---");
push(`평균 원본 Hard Gap: ${reclassification.avgOriginalHardGapCount.toFixed(1)}건`);
push(`평균 구제 건수 (BP-1/2/3 결합): ${reclassification.avgRescuedCount.toFixed(1)}건`);
push(`평균 재분류 후 Hard Gap: ${reclassification.avgNewHardGapCount.toFixed(1)}건`);
push(`평균 과다분류율: ${(reclassification.avgOverClassificationRate * 100).toFixed(1)}% (range ${(reclassification.overClassificationRateRange[0] * 100).toFixed(1)}~${(reclassification.overClassificationRateRange[1] * 100).toFixed(1)}%)`);
for (const r of reclassification.runs) {
  push(`  run: hardGap=${r.originalHardGapCount} rescued=${r.rescuedCount} (BP1=${r.rescuedByBP1Count} BP2=${r.rescuedByBP2Count} BP3=${r.rescuedByBP3Count}) newHardGap=${r.newHardGapCount}`);
}
push();

// --- STEP2: State Representation Candidates ---------------------------------
log("STEP2: State Representation 후보 평가 (수 분 소요)");
const representations = evaluateStateRepresentationCandidates(failuresDbPath, gapDeadlineMs);
log("STEP2 완료");

push("--- STEP2: State Representation 후보 비교 ---");
for (const r of [representations.baseline, representations.coarseShape, representations.capabilityFingerprint]) {
  push(`[${r.name}] 고유그룹=${r.uniqueGroups} Singleton비율=${(r.singletonRate * 100).toFixed(1)}% 재등장률=${(r.reentryRate * 100).toFixed(1)}% 평균그룹크기=${r.avgGroupSize.toFixed(2)}`);
}
push();

// --- STEP3: Primitive Capability Gap Report ---------------------------------
log("STEP3: Primitive Capability Gap 분석");
const gapFindings = buildPrimitiveCapabilityGapReport(failuresDbPath, reclassification);
log("STEP3 완료");

push("--- STEP3: 구제된 그룹 vs 여전히 Hard Gap인 그룹 ---");
push(
  `[구제됨] n=${gapFindings.rescuedGroup.count} 평균WrongWing=${gapFindings.rescuedGroup.avgWrongWing.toFixed(2)} 평균Pair=${gapFindings.rescuedGroup.avgPair.toFixed(2)} Parity율=${(gapFindings.rescuedGroup.parityRate * 100).toFixed(1)}% 평균Cycle개수=${gapFindings.rescuedGroup.avgCycleCount.toFixed(2)} 평균최장Cycle=${gapFindings.rescuedGroup.avgLongestCycleLength.toFixed(2)} 평균Conflict=${gapFindings.rescuedGroup.avgConflictEdgeCount.toFixed(2)}`,
);
push(
  `[여전히 Hard] n=${gapFindings.stillHardGroup.count} 평균WrongWing=${gapFindings.stillHardGroup.avgWrongWing.toFixed(2)} 평균Pair=${gapFindings.stillHardGroup.avgPair.toFixed(2)} Parity율=${(gapFindings.stillHardGroup.parityRate * 100).toFixed(1)}% 평균Cycle개수=${gapFindings.stillHardGroup.avgCycleCount.toFixed(2)} 평균최장Cycle=${gapFindings.stillHardGroup.avgLongestCycleLength.toFixed(2)} 평균Conflict=${gapFindings.stillHardGroup.avgConflictEdgeCount.toFixed(2)}`,
);
push();

// --- STEP4: WANTS Graph Review ----------------------------------------------
log("STEP4: WANTS Graph 검토");
const wantsGraph = reviewWantsGraph(representations, gapFindings);
log(`STEP4 완료: ${wantsGraph.verdict}`);

push(`--- STEP4: WANTS Graph 검토 -- 판정: ${wantsGraph.verdict} ---`);
push(wantsGraph.reasoning);
for (const e of wantsGraph.evidence) push(`  - ${e}`);
push();

// --- STEP5: Blueprint Synthesis ---------------------------------------------
log("STEP5: Blueprint 종합");
const blueprint = synthesizeSolverV3Blueprint(gate, reclassification, representations, gapFindings, wantsGraph);
log(`STEP5 완료: 결론 ${blueprint.outcome}`);

push(`--- STEP5: 결론 ---`);
push(`Level 1 (State Representation 개선): ${blueprint.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (Gate 판정 완료 + 반영): ${blueprint.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (결론 구체성): ${blueprint.level3Pass ? "PASS" : "FAIL"}`);
push();
push(`발동된 Exit Criteria: ${blueprint.exitCriteriaTriggered.length ? blueprint.exitCriteriaTriggered.join(" / ") : "없음"}`);
push();
push(`=== 8-1 결론: ${blueprint.outcome} ===`);
push(blueprint.outcomeReasoning);
push();
if (blueprint.blueprints.length > 0) {
  push("--- 새 Blueprint ---");
  for (const b of blueprint.blueprints) {
    push(`[${b.id}] ${b.name}`);
    push(`  derivedFrom: ${b.derivedFrom}`);
    push(`  input: ${b.input}`);
    push(`  expectedEffect: ${b.expectedEffect}`);
    push(`  forbiddenEffect: ${b.forbiddenEffect}`);
    push(`  activationCondition: ${b.activationCondition}`);
    push(`  differsFromExisting: ${b.differsFromExisting}`);
    push(`  unverifiedCaveat: ${b.unverifiedCaveat}`);
    push();
  }
}
push("--- Representation 권고 ---");
push(blueprint.representationRecommendation);
push();
push(`제품 코드 통합 여부: 미통합 (spec -- 이번 Sprint는 Research Kickoff, Prototype/제품 코드 작업 아님)`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));
