// Solver Primitive Integration Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runIntegrationBlueprint.ts
// Design-only Sprint: no Prototype execution, no benchmark, no dataset
// iteration -- assembles STEP1~5's findings (grounded in directly
// reading the real fiveByFiveEdgeSolverEngine.ts/fiveByFiveEdgePlanner.ts/
// fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts, all read-only,
// none modified) into the Integration Blueprint report and applies
// Level 1~3. Absolute prohibitions honored: no Solver/Planner/Executor/
// Recovery/Primitive Registry modification, no Hard Coding, no Planner
// Integration implementation, no product code change, no new Prototype.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { INTEGRATION_POINT_CANDIDATES, CHOSEN_INTEGRATION_POINT } from "./solverPrimitiveIntegrationBlueprint/IntegrationPointSurvey";
import {
  PLANNER_CALL_ORDER,
  FAILURE_HANDLING,
  DEFERRED_VALIDATION_LOCATIONS,
  PLANNER_FEATURES_CURRENTLY_USED,
  FEATURES_REQUIRED_IF_W2_ADDED,
  PLANNER_CHANGE_REQUIRED,
  PLANNER_CHANGE_RATIONALE,
} from "./solverPrimitiveIntegrationBlueprint/PlannerDependencyAnalysis";
import { OVERLAP_ANALYSIS } from "./solverPrimitiveIntegrationBlueprint/OverlapAnalysis";
import { W2_INTEGRATION_CONTRACT } from "./solverPrimitiveIntegrationBlueprint/IntegrationContract";
import { RISK_ANALYSIS } from "./solverPrimitiveIntegrationBlueprint/RiskAnalysis";
import { decideOutcome } from "./solverPrimitiveIntegrationBlueprint/IntegrationBlueprintDecision";

const reportPath = "src/customCube/solverPrimitiveIntegrationBlueprint/data/integration-blueprint-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Integration Blueprint Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Prototype Refinement Sprint v2에서 확정된 W2_widerHop(A1_wideCycle Gate + hop당 후보 수 3)을 실제 Solver에 통합하기 위한 Blueprint를 설계한다. 이번 Sprint는 설계만 수행하며, Solver/Planner/Executor/Recovery/Primitive Registry/제품 코드는 전혀 수정하지 않는다. 새 Prototype도 구현하지 않는다 -- fiveByFiveEdgeSolverEngine.ts/fiveByFiveEdgePlanner.ts/fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts를 직접 읽어 실제 아키텍처에 근거해 설계했다.");
push();

push("--- 0-1. 핵심 발견: 연구 프레임워크와 실제 production의 불일치 ---");
push("이 연구 시리즈 전체가 사용해온 'BASE/FLIP/CASE/PARITY/BP1' 5개 Primitive는 연구용 시뮬레이션 하네스(RepresentationPrimitiveSelector.ts의 testAllAllowedSingleShot/tryPrimitiveOn)이며, 실제 production Solver가 쓰는 코드가 아니다. 실제 production은 SolveTaskType('PAIR'|'FLIP'|'PARITY'|'ENDGAME')으로 분기한다. 코드를 직접 대조한 결과:");
push("  research BASE(tryFixWing, no shuffle)          -> production PAIR task");
push("  research FLIP(tryFlipWingsInPlace)              -> production FLIP task");
push("  research CASE(tryExactCaseMatch)                -> production PARITY task");
push("  research PARITY(bestFixOverall+tryEndgameMultiPly) -> production ENDGAME task grinder");
push("  research BP1(tryBoundedMultiCycleResolver)      -> production에 전혀 연결된 적 없음");
push("W2_widerHop이 잇는 BP-1 계보는 production에 한 번도 배선된 적이 없다 -- 즉 이번 Integration은 '교체'가 아니라 '신규 도입'이다.");
push("또한 goalPlanner/GoalIntegration.ts(Phase 76-88에서 만든 실험적 Goal 기반 Planner)도 fiveByFiveEdgeSolverEngine.ts 어디에서도 import되지 않는다 -- A/B 벤치마크는 했지만 실제 solve() 경로에 배선된 적이 없다. 이 Blueprint가 말하는 'Planner'는 fiveByFiveEdgePlanner.ts의 planEdgeTasks다.");
push();

log("STEP1: Integration Point 조사");
push("--- 1. Integration Point 조사 (STEP1) ---");
for (const c of INTEGRATION_POINT_CANDIDATES) {
  push(`[${c.chosen ? "선택" : "기각"}] ${c.name}`);
  push(`  위치: ${c.location}`);
  push(`  호출 가능: ${c.callable}, 상태 보존: ${c.statePreservation}`);
  push(`  필요 입력: ${c.requiredInputs}`);
  push(`  필요 출력: ${c.requiredOutputs}`);
  push(`  기존 Primitive와 충돌: ${c.conflictsWithExisting}`);
  if (c.rejectionReason) push(`  기각 사유: ${c.rejectionReason}`);
  push();
}
log("STEP1 완료");

log("STEP2: Planner Dependency 분석");
push("--- 2. Planner Dependency 분석 (STEP2) ---");
push("Primitive 호출 순서:");
for (const s of PLANNER_CALL_ORDER) push(`  ${s.step}. ${s.description}`);
push("Primitive 실패 처리:");
for (const f of FAILURE_HANDLING) push(`  [${f.taskType}] ${f.onFailure}`);
push("Deferred Validation 위치:");
for (const d of DEFERRED_VALIDATION_LOCATIONS) push(`  - ${d}`);
push(`Planner가 현재 사용하는 Feature: ${PLANNER_FEATURES_CURRENTLY_USED.join(", ")}`);
push(`W2가 추가되면 필요한 Feature: ${FEATURES_REQUIRED_IF_W2_ADDED.join(" / ")}`);
push(`Planner 코드 변경 필요 여부: ${PLANNER_CHANGE_REQUIRED}`);
push(`근거: ${PLANNER_CHANGE_RATIONALE}`);
push();
log("STEP2 완료");

log("STEP3: Overlap 분석");
push("--- 3. Overlap 분석 (STEP3) ---");
for (const o of OVERLAP_ANALYSIS) {
  push(`[${o.productionCapability}] (연구 라벨: ${o.researchLabelEquivalent})`);
  push(`  Coverage overlap: ${o.coverageOverlap}`);
  push(`  Gap overlap: ${o.gapOverlap}`);
  push(`  Expected redundancy: ${o.expectedRedundancy}`);
  push(`  Expected replacement: ${o.expectedReplacement}`);
  push();
}
log("STEP3 완료");

log("STEP4: Integration Contract 작성");
push("--- 4. Integration Contract (STEP4, 핵심 산출물) ---");
push(`Preconditions: ${W2_INTEGRATION_CONTRACT.preconditions}`);
push(`Input: ${W2_INTEGRATION_CONTRACT.input}`);
push(`Output: ${W2_INTEGRATION_CONTRACT.output}`);
push(`Allowed Operations: ${W2_INTEGRATION_CONTRACT.allowedOperations}`);
push(`Success Criteria: ${W2_INTEGRATION_CONTRACT.successCriteria}`);
push(`Failure Criteria: ${W2_INTEGRATION_CONTRACT.failureCriteria}`);
push(`Deferred Validation: ${W2_INTEGRATION_CONTRACT.deferredValidation}`);
push(`Fallback: ${W2_INTEGRATION_CONTRACT.fallback}`);
push(`Planner Contract: ${W2_INTEGRATION_CONTRACT.plannerContract}`);
push(`Primitive Priority: ${W2_INTEGRATION_CONTRACT.primitivePriority}`);
push();
log("STEP4 완료");

log("STEP5: Risk 분석");
push("--- 5. Risk 분석 (STEP5) ---");
for (const r of RISK_ANALYSIS) {
  push(`[${r.name}] 가능성=${r.likelihood} 영향도=${r.impact}`);
  push(`  대응: ${r.mitigation}`);
}
push();
log("STEP5 완료");

log("STEP6: 성공 기준 판정 + 최종 결정");
const outcome = decideOutcome(INTEGRATION_POINT_CANDIDATES, PLANNER_CHANGE_REQUIRED, PLANNER_CHANGE_RATIONALE, W2_INTEGRATION_CONTRACT, RISK_ANALYSIS);
log(`STEP6 완료: 결정=${outcome.decision}`);

push("--- 6. 성공 기준 (Level 1~3) ---");
push(`Level 1 (Integration Point를 명확히 정의): ${outcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (Planner Contract 작성): ${outcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (Prototype을 실제 Solver에 넣을 수 있을 만큼 Blueprint 완성): ${outcome.level3Pass ? "PASS" : "FAIL"}`);
push();

push("--- 7. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
push(`선택된 Integration Point: ${CHOSEN_INTEGRATION_POINT.name}`);
push();

const nextStep =
  outcome.decision === "A"
    ? "다음 단계: Solver Primitive Integration Prototype Sprint v1 (fiveByFiveEdgeRecovery.ts에 REPAIR 타입 후보를 실제로 배선)."
    : outcome.decision === "B"
      ? "다음 단계: Integration Blueprint Sprint v2 (미비 항목 보완)."
      : "다음 단계: Integration 자체 재검토 Sprint.";
push(`=== Sprint 종료: ${outcome.decision === "A" ? "성공" : "추가 조치 필요"} ===`);
push(nextStep);
push("보호 파일: fiveByFiveEdgeSolverEngine.ts/fiveByFiveEdgePlanner.ts/fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts 및 Primitive Registry 전부 미수정(읽기 전용 조사만). Hard Coding/Planner Integration 구현 없음. 새 Prototype 미구현. 제품 코드 미변경.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (outcome.decision !== "A") process.exitCode = 1;
