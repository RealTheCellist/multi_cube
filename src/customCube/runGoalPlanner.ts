// Architecture Evolution Sprint v1 -- GOSP prototype driver.
//   npx tsx src/customCube/runGoalPlanner.ts [dbPath] [totalReplayBudget] [maxDepth] [maxNodesPerReplay] [primitiveDeadlineMs] [benchmarkTopK]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runGoalPlannerSprint, DEFAULT_GOAL_PLANNER_OPTIONS, type GoalPlannerOptions } from "./goalPlanner/GoalPlanner";
import { createEmptyGoalDatabase, addGoalCandidate, saveGoalDatabase } from "./goalPlanner/GoalDatabase";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const totalReplayBudget = Number(process.argv[3] ?? DEFAULT_GOAL_PLANNER_OPTIONS.totalReplayBudget);
const maxDepth = Number(process.argv[4] ?? DEFAULT_GOAL_PLANNER_OPTIONS.searchOptions.maxDepth);
const maxNodesPerReplay = Number(process.argv[5] ?? DEFAULT_GOAL_PLANNER_OPTIONS.searchOptions.maxNodesPerReplay);
const primitiveDeadlineMs = Number(process.argv[6] ?? DEFAULT_GOAL_PLANNER_OPTIONS.searchOptions.primitiveDeadlineMs);
const benchmarkTopK = Number(process.argv[7] ?? DEFAULT_GOAL_PLANNER_OPTIONS.benchmarkTopK);

const goalDbPath = "src/customCube/goalPlanner/data/goals.json";
const plannerReportPath = "src/customCube/goalPlanner/data/goal-planner-report.txt";
const goalGraphPath = "src/customCube/goalPlanner/data/goal-graph.txt";
const benchmarkReportPath = "src/customCube/goalPlanner/data/goal-benchmark.txt";

const options: GoalPlannerOptions = {
  totalReplayBudget,
  searchOptions: { maxDepth, maxNodesPerReplay, primitiveDeadlineMs },
  benchmarkTopK,
  level1MinReplays: DEFAULT_GOAL_PLANNER_OPTIONS.level1MinReplays,
  clusterGoalMinOccurrences: DEFAULT_GOAL_PLANNER_OPTIONS.clusterGoalMinOccurrences,
};

console.log(
  `STEP: GOSP 탐색 시작 -- Replay ${totalReplayBudget}개, maxDepth=${maxDepth}, maxNodesPerReplay=${maxNodesPerReplay}, primitiveDeadlineMs=${primitiveDeadlineMs}`
);
const startedAt = Date.now();
const result = runGoalPlannerSprint(dbPath, options);
const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`STEP: 탐색 완료 (${elapsedSec}s) -- Replay ${result.replaysAnalyzed}개, Goal Candidate ${result.allCandidates.length}개`);

// --- Persist Goal Database ------------------------------------------------
const goalDb = createEmptyGoalDatabase();
let newlyStored = 0;
for (const c of result.allCandidates) {
  if (addGoalCandidate(goalDb, c)) newlyStored++;
}
saveGoalDatabase(goalDbPath, goalDb);
console.log(`STEP: Goal Database 저장 -- ${newlyStored}개 신규 Goal Candidate (${goalDbPath})`);

// --- Deliverable (1): Goal Planner Report ---------------------------------
function scoreHistogram(scores: number[]): string[] {
  if (scores.length === 0) return ["  (Goal Candidate 없음)"];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const bucketCount = 6;
  const span = Math.max(1e-9, max - min);
  const buckets = new Array(bucketCount).fill(0);
  for (const s of scores) {
    const idx = Math.min(bucketCount - 1, Math.floor(((s - min) / span) * bucketCount));
    buckets[idx]++;
  }
  return buckets.map((count, i) => {
    const lo = (min + (span * i) / bucketCount).toFixed(1);
    const hi = (min + (span * (i + 1)) / bucketCount).toFixed(1);
    return `  [${lo}, ${hi}] : ${"#".repeat(count)} (${count})`;
  });
}

const scores = result.allCandidates.map((c) => c.goalScore ?? 0);
const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

const reportLines: string[] = [];
const rpush = (s = "") => reportLines.push(s);
rpush("========================================");
rpush("Goal Planner Report -- Architecture Evolution Sprint v1 (GOSP)");
rpush("========================================");
rpush();
rpush(`분석한 Replay 수: ${result.replaysAnalyzed}`);
rpush(`탐색 옵션: maxDepth=${maxDepth}, maxNodesPerReplay=${maxNodesPerReplay}, primitiveDeadlineMs=${primitiveDeadlineMs}ms`);
rpush(`State Graph 총 노드 수: ${result.graphs.reduce((s, g) => s + g.nodes.length, 0)}`);
rpush(`State Graph 총 Edge 수: ${result.graphs.reduce((s, g) => s + g.edges.length, 0)}`);
rpush(`발견한 Goal Candidate 수: ${result.allCandidates.length}`);
rpush(`Cluster Goal로 승격된 수 (동일 Cluster 내 ${options.clusterGoalMinOccurrences}회+ 반복): ${result.clusterGoals.length}`);
rpush();
rpush("--- Goal Score 분포 ---");
rpush(`  평균: ${avgScore.toFixed(2)}, 최소: ${scores.length ? Math.min(...scores).toFixed(2) : "-"}, 최대: ${scores.length ? Math.max(...scores).toFixed(2) : "-"}`);
rpush(...scoreHistogram(scores));
rpush();
rpush("--- Cluster Goal (동일 Cluster 내 반복 발견된 Goal, 상위 15) ---");
for (const cg of result.clusterGoals.slice(0, 15)) {
  rpush(
    `  Cluster ${cg.clusterKey}  Goal ${cg.goalSignature}  발생 Replay ${cg.occurrences}개  ` +
      `대표 score=${(cg.representativeCandidate.goalScore ?? 0).toFixed(1)}  경로=[${cg.representativeCandidate.primitiveSequence.join(">")}]`
  );
}
if (result.clusterGoals.length === 0) rpush("  (없음)");
rpush();
rpush("--- Level 1 (전역, Cluster 무관, 동일 Goal Signature 5개+ Replay) ---");
for (const g of result.globalGoalGroups.slice(0, 10)) {
  rpush(`  Goal ${g.goalSignature}  Replay ${g.replayHashes.length}개`);
}
writeFileSync(plannerReportPath, reportLines.join("\n"), "utf-8");
console.log("\n" + reportLines.join("\n"));

// --- Deliverable (2): Goal Graph (textual State Graph / Goal Node / Transition 시각화) ---
const graphLines: string[] = [];
const gpush = (s = "") => graphLines.push(s);
gpush("========================================");
gpush("Goal Graph -- Architecture Evolution Sprint v1 (GOSP)");
gpush("========================================");
gpush("(텍스트 기반 시각화: Replay별 State Graph를 depth 순 Edge 목록으로 표현. [GOAL] 표시는 해당 노드가 Goal Candidate로 선정됨을 뜻한다.)");
const goalHashSet = new Set(result.allCandidates.map((c) => `${c.replayHash}::${c.goalHash}`));
for (const graph of result.graphs) {
  gpush();
  gpush(`--- Replay ${graph.replayHash} (Cluster ${graph.clusterKey}) ---`);
  const root = graph.nodes.find((n) => n.hash === graph.rootHash)!;
  gpush(`  ROOT ${root.hash}  wrongWing=${root.wrongWingCount} pair=${root.pairCount} parity=${root.parity ? 1 : 0}`);
  const byHash = new Map(graph.nodes.map((n) => [n.hash, n]));
  const sortedEdges = [...graph.edges].sort((a, b) => (byHash.get(a.to)?.depth ?? 0) - (byHash.get(b.to)?.depth ?? 0));
  for (const edge of sortedEdges) {
    const to = byHash.get(edge.to);
    if (!to) continue;
    const isGoal = goalHashSet.has(`${graph.replayHash}::${to.hash}`);
    gpush(
      `    ${edge.from.slice(0, 8)} --[${edge.primitive}, ${edge.moves.length}수]--> ${to.hash.slice(0, 8)}` +
        ` (depth=${to.depth}, wrongWing=${to.wrongWingCount}, pair=${to.pairCount}, parity=${to.parity ? 1 : 0})${isGoal ? " [GOAL]" : ""}`
    );
  }
  if (graph.edges.length === 0) gpush("    (Edge 없음 -- 4개 Primitive 전부 이 상태에서 즉시 실패)");
}
mkdirSync(dirname(goalGraphPath), { recursive: true });
writeFileSync(goalGraphPath, graphLines.join("\n"), "utf-8");

// --- Deliverable (3): Goal Benchmark ---------------------------------------
const benchLines: string[] = [];
const bpush = (s = "") => benchLines.push(s);
bpush("========================================");
bpush("Goal Benchmark -- Architecture Evolution Sprint v1 (GOSP)");
bpush("========================================");
bpush(`검증 대상 (Goal Score 상위): ${result.benchmarkResults.length}개`);
bpush(`Goal 도달 성공: ${result.benchmarkResults.filter((r) => r.goalReached).length}/${result.benchmarkResults.length}`);
bpush(`Solver 성공률 (Goal 없이, 원본 Failure State 직접 재실행): ${(result.successRateWithoutGoal * 100).toFixed(1)}%`);
bpush(`Solver 성공률 (Goal 경유 후 재실행): ${(result.successRateAfterGoal * 100).toFixed(1)}%`);
const wwDeltas = result.benchmarkResults.map((r) => r.wrongWingAfterGoal - r.wrongWingWithoutGoal);
const avgWwDelta = wwDeltas.length ? wwDeltas.reduce((a, b) => a + b, 0) / wwDeltas.length : 0;
bpush(`평균 WrongWing 변화 (Goal 경유 - Goal 없이): ${avgWwDelta.toFixed(2)}`);
bpush(`개선된 Replay 수 (Goal 경유가 더 나음): ${result.benchmarkResults.filter((r) => r.improved).length}/${result.benchmarkResults.length}`);
bpush();
bpush("--- 개별 결과 (상위 15) ---");
for (const r of result.benchmarkResults.slice(0, 15)) {
  bpush(
    `  Replay ${r.replayHash.slice(0, 10)}  Goal ${r.goalHash.slice(0, 10)}  도달=${r.goalReached}  ` +
      `WrongWing(없이=${r.wrongWingWithoutGoal}, 경유=${r.wrongWingAfterGoal})  개선=${r.improved}`
  );
}
writeFileSync(benchmarkReportPath, benchLines.join("\n"), "utf-8");
console.log("\n" + benchLines.join("\n"));

// --- Success criteria (spec section 15) -------------------------------------
console.log("\n=== 성공 기준 (Level 1/2/3) ===");
console.log(
  `Level 1 (Replay ${options.totalReplayBudget}개 중 ${options.level1MinReplays}개+에서 동일 Goal Signature 발견): ${result.level1 ? "PASS" : "FAIL"}`
);
console.log(
  `Level 2 (Goal 도달 이후 기존 Solver 성공률 증가: ${(result.successRateWithoutGoal * 100).toFixed(1)}% -> ${(result.successRateAfterGoal * 100).toFixed(1)}%): ${result.level2 ? "PASS" : "FAIL"}`
);
console.log(`Level 3 (Primitive 무변경 + Replay 성공률 증가, Level 2와 동일 사실): ${result.level3 ? "PASS" : "FAIL"}`);
