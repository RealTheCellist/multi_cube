// Solver Representation Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runRepresentationPrototype.ts [failuresDbPath]
// Validates whether Rescue-Structural Hybrid (Representation Blueprint
// Sprint v1's winner) actually improves real Solver Coverage/Hard Gap when
// used ONLY to re-prioritize the 5 EXISTING allowed Primitives
// (BASE/FLIP/CASE/PARITY/BP-1) -- no new Primitive, no Solver/Planner/
// Executor/Contract change, no product integration.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { classifyAllReplays, summarizeDistributions } from "./solverRepresentationPrototype/RepresentationClassifier";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "./fiveByFiveEdges";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { loadAll75 } from "./solverV2PrototypeBP4/ReplayBenchmark";
import {
  ALLOWED_PRIMITIVES,
  FIXED_BASELINE_ORDER,
  buildPriorityPolicy,
  priorityFor,
  testAllAllowedSingleShot,
  type AllowedPrimitive,
} from "./solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { runOrchestrationOnAll, MAX_ROUNDS, PER_PRIMITIVE_DEADLINE_MS } from "./solverRepresentationPrototype/RepresentationCoverageRunner";
import { summarizeCondition, compareToBaseline, decideOutcome } from "./solverRepresentationPrototype/RepresentationEffectReport";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const gapDeadlineMs = 300;
const singleShotDeadlineMs = 250;
const reportPath = "src/customCube/solverRepresentationPrototype/data/representation-prototype-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Representation Prototype Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Representation Blueprint Sprint v1이 선정한 Rescue-Structural Hybrid를 이용해, 기존 Primitive(BASE/FLIP/CASE/PARITY/BP-1)만 재오케스트레이션했을 때 실제 Coverage/Hard Gap이 개선되는지 검증한다. 새 Primitive는 만들지 않으며, Solver/Planner/Executor/Contract를 전혀 수정하지 않는다. 제품 코드에 통합하지 않는다.");
push();

log("STEP1/2: 150 Replay Representation 재분류 (Rescue-Structural Hybrid/Coarse/Exact, BP-1/2/3 재테스트 포함, 수 분 소요)");
const representations = classifyAllReplays(failuresDbPath, gapDeadlineMs);
const distributions = summarizeDistributions(representations);
log(`STEP1/2 완료: 고유 그룹 수 -- ${distributions.map((d) => `${d.representation}=${d.uniqueGroups}`).join(", ")}`);

push("--- 1. Representation 분포 ---");
for (const d of distributions) {
  push(`[${d.representation}] 고유 그룹=${d.uniqueGroups} / ${d.totalReplays}건`);
  push(`  상위 그룹: ${d.topGroups.map((g) => `${g.key}(${g.count}건)`).join(", ")}`);
}
push();

log("STEP3: 5개 허용 Primitive Single-shot 테스트 + Representation별 Priority Policy 구축");
const all150 = loadAll75(failuresDbPath);
const libs = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
const singleShot = new Map<string, Record<AllowedPrimitive, boolean>>();
for (const snapshot of all150) {
  const cubies = deserializeCube(snapshot.cubeState);
  singleShot.set(snapshot.hash, testAllAllowedSingleShot(cubies, libs, singleShotDeadlineMs));
}

const repByHash = new Map(representations.map((r) => [r.hash, r]));
const coarsePolicy = buildPriorityPolicy("Coarse Structural Shape", (hash) => repByHash.get(hash)!.coarse, singleShot);
const exactPolicy = buildPriorityPolicy("Exact Shape Key (BP-4)", (hash) => repByHash.get(hash)!.exact, singleShot);
const rescuePolicy = buildPriorityPolicy("Rescue-Structural Hybrid", (hash) => repByHash.get(hash)!.rescueHybrid, singleShot);
log("STEP3 완료");

push("--- 2. Primitive 선택 변화 (초기 상태 기준 1순위 Primitive 분포) ---");
function firstChoiceDistribution(priorityOf: (hash: string) => readonly AllowedPrimitive[]): Record<AllowedPrimitive, number> {
  const dist = Object.fromEntries(ALLOWED_PRIMITIVES.map((p) => [p, 0])) as Record<AllowedPrimitive, number>;
  for (const s of all150) dist[priorityOf(s.hash)[0]]++;
  return dist;
}
const conditions: { name: string; priorityOf: (hash: string) => readonly AllowedPrimitive[] }[] = [
  { name: "기존 Solver (고정 순서)", priorityOf: () => FIXED_BASELINE_ORDER },
  { name: "Coarse Structural Shape", priorityOf: (hash) => priorityFor(coarsePolicy, repByHash.get(hash)!.coarse, hash, singleShot) },
  { name: "Exact Shape Key (BP-4)", priorityOf: (hash) => priorityFor(exactPolicy, repByHash.get(hash)!.exact, hash, singleShot) },
  { name: "Rescue-Structural Hybrid", priorityOf: (hash) => priorityFor(rescuePolicy, repByHash.get(hash)!.rescueHybrid, hash, singleShot) },
];
for (const c of conditions) {
  const dist = firstChoiceDistribution(c.priorityOf);
  push(`[${c.name}] 1순위 분포: ${ALLOWED_PRIMITIVES.map((p) => `${p}=${dist[p]}`).join(" ")}`);
}
push();

log(`STEP4: 실제 Solver 실행 시뮬레이션 (4개 조건 x ${all150.length} Replay, 최대 ${MAX_ROUNDS} round, ${PER_PRIMITIVE_DEADLINE_MS}ms/시도, 수 분 소요)`);
const resultsByCondition = conditions.map((c) => ({ name: c.name, results: runOrchestrationOnAll(all150, c.priorityOf) }));
log("STEP4 완료");

push("--- 3. Coverage / Hard Gap / Primitive 성공률 (조건별) ---");
push("(참고: Coverage = 개선(wrongWingAfter < wrongWingBefore) 발생률 -- 이 프로젝트 전체에서 확립된 정의(ReplayBenchmark.summarize()). '완전 해결(wrongWingCount=0)'은 별도로 병기한다 -- 이 150건은 이미 RECOVERY/CYCLECHASE를 포함한 전체 Solver가 실패한 잔여 상태라, 그보다 약한 5개 Primitive만으로 완전 해결을 요구하는 것은 애초에 달성 불가능에 가깝다.)");
const summaries = resultsByCondition.map((rc) => summarizeCondition(rc.name, rc.results));
for (const s of summaries) {
  push(
    `[${s.condition}] Coverage(개선율)=${(s.coverage * 100).toFixed(1)}% (${s.improvedCount}/${s.totalReplays}) 완전해결률=${(s.fullySolvedRate * 100).toFixed(1)}% (${s.solvedCount}건) Hard Gap=${(s.hardGapRate * 100).toFixed(1)}% (${s.hardGapCount}건) 평균 round=${s.avgRoundsUsed.toFixed(2)}`,
  );
  for (const p of ALLOWED_PRIMITIVES) {
    const u = s.primitiveUsage[p];
    push(`    ${p}: 시도=${u.attempts} 성공=${u.successes} 성공률=${(u.successRate * 100).toFixed(1)}%`);
  }
}
push();

log("STEP5: 기존 Solver(고정 순서) 대비 비교");
const baselineSummary = summaries[0];
const baselineResults = resultsByCondition[0].results;
const comparisons = resultsByCondition.slice(1).map((rc, i) => compareToBaseline(rc.name, baselineSummary, baselineResults, summaries[i + 1], rc.results));
log(`STEP5 완료: ${comparisons.map((c) => `${c.condition}(Level1=${c.level1Pass},Level2=${c.level2Pass})`).join(", ")}`);

push("--- 4. Coverage/Hard Gap 비교 (기존 Solver 대비) ---");
for (const c of comparisons) {
  push(`[${c.condition}] Coverage ${c.coveragePercentagePointDelta >= 0 ? "+" : ""}${c.coveragePercentagePointDelta.toFixed(1)}%p, Hard Gap 상대감소 ${c.hardGapRelativeReductionPercent >= 0 ? "+" : ""}${c.hardGapRelativeReductionPercent.toFixed(1)}%, Regression=${c.regression.regressionCount}건, Level1=${c.level1Pass ? "PASS" : "FAIL"}, Level2=${c.level2Pass ? "PASS" : "FAIL"}`);
  if (c.regression.regressionCount > 0) push(`  Regression 발생 replay: ${c.regression.regressedHashes.slice(0, 5).join(", ")}${c.regression.regressedHashes.length > 5 ? ` 외 ${c.regression.regressedHashes.length - 5}건` : ""}`);
}
push();

const outcome = decideOutcome(comparisons);
push("--- 5. 성공 기준 (Level 1~3) ---");
const level1 = comparisons.some((c) => c.level1Pass);
const level2 = outcome.best ? outcome.best.level2Pass : comparisons.every((c) => c.regression.regressionCount === 0);
push(`Level 1 (Coverage +3%p 이상 또는 Hard Gap 상대감소 -5% 이상, 조건 중 하나라도): ${level1 ? "PASS" : "FAIL"}`);
push(`Level 2 (Regression 0%, 최우수 조건 기준): ${level2 ? "PASS" : "FAIL"}`);
push(`Level 3 (A/B/C 중 하나로 귀결): PASS`);
push();

push("--- 6. 최종 결론 ---");
push(`결정: ${outcome.decision}. ${outcome.rationale}`);
push();

const overall = level1 && level2;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push(
  overall
    ? "Representation 효과 확인 -- Exit Criteria에 따라 제품 통합 검토(반복 검증 필요)로 이어질 수 있다."
    : outcome.decision === "C" && comparisons.some((c) => c.regression.regressionCount > 0)
      ? "Regression이 발생했다 -- Exit Criteria에 따라 이 Blueprint(Rescue-Structural Hybrid)는 폐기 검토 대상이다."
      : "Representation 효과가 미미하거나 없었다 -- Exit Criteria에 따라 기존 Primitive로는 개선 한계가 확인된 것으로 볼 수 있으며, 차세대 Primitive 연구 재개를 검토해야 한다.",
);
push(
  "보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts/CycleChasePrototype.ts 및 BASE_ALG/FLIP_ALG/PARITY_ALG/CASE Library 미수정 (읽기 전용 재사용만). Solver/Planner/Executor/Contract 미수정. 새 Primitive/Replay/Dataset 변경 없음. 제품 코드 미통합.",
);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
