// Solver v3 Primitive Prototype Sprint v1 (BP-5) -- driver.
//   npx tsx src/customCube/runSolverV3PrototypeBP5.ts [failuresDbPath] [deadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { loadAll75 } from "./solverV2PrototypeBP4/ReplayBenchmark";
import { detectSparseWrongnessCandidates } from "./solverV3PrototypeBP5/SparseWrongnessDetector";
import { runBoundedLookaheadOn, type BoundedLookaheadResult } from "./solverV3PrototypeBP5/BoundedLookaheadPrototype";
import { profileContractCost } from "./solverV3PrototypeBP5/ContractCostProfiler";
import { buildEffectReport } from "./solverV3PrototypeBP5/PrototypeEffectReport";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const deadlineMs = Number(process.argv[3] ?? 500);
const gapDeadlineMs = 300;
const reportPath = "src/customCube/solverV3PrototypeBP5/data/prototype-report.txt";

// A vs B threshold when Contract PASS -- spec did not fix an exact number
// for this Sprint (unlike prior BP Sprints' "8/~29" Level1 threshold), so
// this Sprint sets one explicitly and discloses it: 30% of BP-5's own
// (already narrowly curated) candidate population improving is treated as
// "채택할 만큼 강한 효과", roughly matching the ~27% (8/29) bar prior BP
// Sprints used, adjusted slightly upward since this population is already
// pre-selected to be BP-5's best-case target (not "all Hard Gap").
const ADOPT_IMPROVED_RATE_THRESHOLD = 0.3;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver v3 Primitive Prototype Sprint v1 (BP-5) -- Prototype Report");
push("========================================");
push();

log("STEP2: Sparse Wrongness Candidate 탐지 (Extended Hard Gap 판정 포함, 수 분 소요)");
const allCandidates = detectSparseWrongnessCandidates(failuresDbPath, gapDeadlineMs);
const candidates = allCandidates.filter((c) => c.isCandidate);
log(`STEP2 완료: ${candidates.length}건 candidate (전체 ${allCandidates.length}건 중)`);

push("--- STEP2: Sparse Wrongness Candidate ---");
push(`전체 Replay: ${allCandidates.length}건`);
push(`Extended Hard Gap (9개 능력 전부 실패): ${allCandidates.filter((c) => c.extendedHardGap).length}건`);
push(`Sparse 프로파일 일치 (WrongWing bucket<=3 AND Cycle<=2): ${allCandidates.filter((c) => c.matchesSparseProfile).length}건`);
push(`BP-5 Candidate (둘 다 충족): ${candidates.length}건`);
for (const c of candidates) {
  push(`  ${c.hash}  WrongWing=${c.shapeProfile.wrongWingCount} CycleCount=${c.shapeProfile.cycleCount} Conflict=${c.shapeProfile.conflictEdgeCount} Parity=${c.shapeProfile.parity}`);
}
push();

if (candidates.length === 0) {
  push("Candidate 0건 -- STEP3 이후 진행 불가.");
  push("=== 결론: C. BP-5 기각 (겨냥 대상 자체가 이번 run에서 확인되지 않음) → Solver v3 Blueprint 재검토 ===");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join("\n"), "utf-8");
  log("\n" + lines.join("\n"));
  process.exit(0);
}

log("STEP3: Bounded Lookahead 실행 (실측 branching factor/시간/노드 수)");
warmupFiveByFiveEdgeLibraries();
const lib = buildWingLibrary();
const all75 = loadAll75(failuresDbPath);
const candidateHashes = new Set(candidates.map((c) => c.hash));
const candidateSnapshots = all75.filter((s) => candidateHashes.has(s.hash));

const lookaheadResults: BoundedLookaheadResult[] = candidateSnapshots.map((s) => runBoundedLookaheadOn(s, lib, deadlineMs));
log("STEP3 완료");

push("--- STEP3: Bounded Lookahead 실측 ---");
for (const r of lookaheadResults) {
  const bfAvg = r.branchingFactorSamples.length ? r.branchingFactorSamples.reduce((a, b) => a + b, 0) / r.branchingFactorSamples.length : 0;
  push(`  ${r.hash}  leaves=${r.leavesExplored} nodes=${r.nodesVisited} avgBF=${bfAvg.toFixed(2)} time=${r.wallTimeMs}ms deadlineHit=${r.hitOverallDeadline}`);
}
push();

log("STEP4: Contract Feasibility 판정");
const contractReport = profileContractCost(lookaheadResults);
log(`STEP4 완료: ${contractReport.verdict}`);

push("--- STEP4: Contract Feasibility Report ---");
push(`Candidate 수: ${contractReport.candidateCount}`);
push(`Branching Factor: 평균 ${contractReport.avgBranchingFactor.toFixed(2)} / 최대 ${contractReport.maxBranchingFactor} / 최소 ${contractReport.minBranchingFactor}`);
push(`탐색 노드 수: 평균 ${contractReport.avgNodesVisited.toFixed(2)} / 최대 ${contractReport.maxNodesVisited}`);
push(`탐색 시간: 평균 ${contractReport.avgWallTimeMs.toFixed(1)}ms / 최대 ${contractReport.maxWallTimeMs}ms`);
push(`Deadline 도달률: ${(contractReport.deadlineHitRate * 100).toFixed(1)}%`);
push(`Task Budget: ${contractReport.taskLocalBudgetMs}ms (평균 시간 기준) -- ${contractReport.feasibleWithinTaskBudget ? "충족" : "초과"}`);
push(`Plan Budget: ${contractReport.planTimeBudgetMs}ms (최대 시간 기준) -- ${contractReport.feasibleWithinPlanBudget ? "충족" : "초과"}`);
push(`=== Contract 판정: ${contractReport.verdict} ===`);
push();

// --- Level 1 (항상 이 시점까지 도달했다면 PASS: candidate 추출 + branching factor 측정 + 비용 보고 전부 완료) ---
const level1Pass = true;
const level2Pass = contractReport.verdict === "PASS";

if (contractReport.verdict === "FAIL") {
  push("Contract FAIL -- spec 5절/STEP5 규칙에 따라 효과 측정 없이 즉시 Prototype을 종료한다.");
  push("이는 Sprint 실패가 아니라, BP-5가 이 좁혀진 부분집합에서도 Solver Contract 안에서 실행 불가능함을 실측으로 입증한 유효한 연구 결과다.");
  push();
  push("--- Level 1~3 판정 ---");
  push(`Level 1 (Candidate 추출/측정/보고 완료): ${level1Pass ? "PASS" : "FAIL"}`);
  push(`Level 2 (Contract 예산 이내): FAIL (평균 ${contractReport.avgWallTimeMs.toFixed(1)}ms > ${contractReport.taskLocalBudgetMs}ms 또는 최대 ${contractReport.maxWallTimeMs}ms > ${contractReport.planTimeBudgetMs}ms)`);
  push(`Level 3 (비용 초과 근거 제시): PASS (위 STEP3/STEP4 실측 수치로 제시함)`);
  push();
  push("=== 결론: C. BP-5 기각 → Solver v3 Blueprint 재검토 ===");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join("\n"), "utf-8");
  log("\n" + lines.join("\n"));
  process.exit(0);
}

log("STEP5: Prototype Effect 측정 (Contract PASS)");
const effectReport = buildEffectReport(candidateSnapshots, lookaheadResults);
log(`STEP5 완료: 개선율 ${(effectReport.summary.improvedRate * 100).toFixed(1)}%`);

push("--- STEP5: Prototype Effect (Contract PASS이므로 측정) ---");
push(`Candidate 대상: ${effectReport.summary.totalCandidates}건`);
push(`활성화 (Coverage): ${effectReport.summary.activatedCount}건 (${(effectReport.summary.coverage * 100).toFixed(1)}%)`);
push(`WrongWing 개선: ${effectReport.summary.improvedCount}건 (개선율 ${(effectReport.summary.improvedRate * 100).toFixed(1)}%)`);
push(`평균 WrongWing 변화 (활성화된 것 중): ${effectReport.summary.avgWrongWingDelta.toFixed(2)}`);
for (const r of effectReport.records) {
  push(`  ${r.hash}  활성화=${r.activated} WrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}`);
}
push();

const level3Pass = true; // Contract PASS branch always measures effect through to completion

push("--- Level 1~3 판정 ---");
push(`Level 1 (Candidate 추출/측정/보고 완료): ${level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (Contract 예산 이내): ${level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (효과 측정 완료): ${level3Pass ? "PASS" : "FAIL"}`);
push();

const outcome = effectReport.summary.improvedRate >= ADOPT_IMPROVED_RATE_THRESHOLD ? "A" : "B";
push(`판정 기준: 개선율 ${(ADOPT_IMPROVED_RATE_THRESHOLD * 100).toFixed(0)}% 이상 -> A(채택), 미만 -> B(추가 최적화 필요) [본 Sprint에서 설정, 사유는 위 주석 참고]`);
push(`실제 개선율: ${(effectReport.summary.improvedRate * 100).toFixed(1)}%`);
push();
if (outcome === "A") {
  push("=== 결론: A. BP-5 채택 → 제품 통합 검토 ===");
} else {
  push("=== 결론: B. BP-5 추가 최적화 필요 → Prototype Sprint v2 ===");
}
push("제품 코드 통합 여부: 미통합 (spec -- 이번 Sprint는 Prototype 검증만 수행)");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));
