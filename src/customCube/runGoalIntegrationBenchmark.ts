// Solver Integration Sprint v1 -- OFFLINE Goal reliability benchmark.
// Node-only (uses `fs` via failureDatabase.ts/GoalDatabase.ts) -- NEVER
// imported by product code (fiveByFiveEdgeSolverEngine.ts/App.tsx). Re-tests
// each stored Goal Candidate's `primitiveSequence` as a portable STRATEGY
// (spec section 5: WHICH Primitives to try, in WHICH order -- never the
// literal recorded moves, which were tailored to one specific scramble)
// against ALL 75 real Failure Replays, computes the section 6 gate
// (Expected WrongWing 감소 > 0 AND Replay Success Rate >= 60% AND
// Regression Rate <= 20%), and writes the ELIGIBLE, priority-sorted subset
// to goalPlanner/EligibleGoals.generated.ts -- a plain, browser-safe TS
// module (no fs) that fiveByFiveEdgeSolverEngine.ts can safely import.
//   npx tsx src/customCube/runGoalIntegrationBenchmark.ts [failuresDbPath] [goalsDbPath] [perStepDeadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "./fiveByFiveEdges";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { allSnapshots, loadDatabase } from "./failureAnalysis/failureDatabase";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { loadGoalDatabase, allGoalCandidates } from "./goalPlanner/GoalDatabase";
import { runPrimitiveChain } from "./goalPlanner/GoalAnalyzer";
import type { GoalCandidate, PortableGoal } from "./goalPlanner/GoalDescriptor";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const goalsDbPath = process.argv[3] ?? "src/customCube/goalPlanner/data/goals.json";
const perStepDeadlineMs = Number(process.argv[4] ?? 80);

const eligibleGoalsPath = "src/customCube/goalPlanner/EligibleGoals.generated.ts";
const reliabilityReportPath = "src/customCube/goalPlanner/data/goal-reliability-report.txt";

// Section 6's gate, applied literally.
const SUCCESS_RATE_GATE = 0.6;
const REGRESSION_RATE_GATE = 0.2;

interface ReliabilityStats {
  candidate: GoalCandidate;
  successCount: number;
  regressionCount: number;
  invalidCount: number;
  successRate: number;
  regressionRate: number;
  invalidRate: number;
  eligible: boolean;
  reasonIfNotEligible: string | null;
}

function computeReliability(candidate: GoalCandidate, replaySnapshots: readonly { cubeState: string }[], libs: ExecutorLibraries): ReliabilityStats {
  let successCount = 0;
  let regressionCount = 0;
  let invalidCount = 0;

  for (const snapshot of replaySnapshots) {
    const clone = deserializeCube(snapshot.cubeState);
    const result = runPrimitiveChain(clone, candidate.primitiveSequence, libs, perStepDeadlineMs);
    if (result.completed && result.wrongWingAfter < result.wrongWingBefore) {
      successCount++;
    } else if (result.wrongWingAfter > result.wrongWingBefore || result.pairAfter < result.pairBefore) {
      regressionCount++;
    } else {
      invalidCount++;
    }
  }

  const total = replaySnapshots.length;
  const successRate = total ? successCount / total : 0;
  const regressionRate = total ? regressionCount / total : 0;
  const invalidRate = total ? invalidCount / total : 0;

  const wrongWingDecrease = candidate.wrongWingBefore - candidate.wrongWingAfter;
  let reasonIfNotEligible: string | null = null;
  if (wrongWingDecrease <= 0) reasonIfNotEligible = "Expected WrongWing 감소 <= 0";
  else if (successRate < SUCCESS_RATE_GATE) reasonIfNotEligible = `Replay Success Rate ${(successRate * 100).toFixed(1)}% < 60%`;
  else if (regressionRate > REGRESSION_RATE_GATE) reasonIfNotEligible = `Regression Rate ${(regressionRate * 100).toFixed(1)}% > 20%`;

  return {
    candidate,
    successCount,
    regressionCount,
    invalidCount,
    successRate,
    regressionRate,
    invalidRate,
    eligible: reasonIfNotEligible === null,
    reasonIfNotEligible,
  };
}

function toPortableGoal(stats: ReliabilityStats): PortableGoal {
  const c = stats.candidate;
  return {
    id: `${c.replayHash}::${c.goalHash}`,
    primitiveSequence: c.primitiveSequence,
    wrongWingDecrease: c.wrongWingBefore - c.wrongWingAfter,
    pairIncrease: c.pairAfter - c.pairBefore,
    originalMoveCount: c.moveSequence.length,
    replaySuccessRate: stats.successRate,
    replayRegressionRate: stats.regressionRate,
    replayInvalidRate: stats.invalidRate,
  };
}

// Spec section 5's priority order.
function comparePriority(a: PortableGoal, b: PortableGoal): number {
  return (
    b.wrongWingDecrease - a.wrongWingDecrease ||
    b.pairIncrease - a.pairIncrease ||
    b.replaySuccessRate - a.replaySuccessRate ||
    a.originalMoveCount - b.originalMoveCount
  );
}

console.log("STEP: 라이브러리 준비 + 데이터 로드");
warmupFiveByFiveEdgeLibraries();
const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

const replaySnapshots = allSnapshots(loadDatabase(failuresDbPath));
const candidates = allGoalCandidates(loadGoalDatabase(goalsDbPath));
console.log(`  Replay ${replaySnapshots.length}건, Goal Candidate ${candidates.length}개, perStepDeadlineMs=${perStepDeadlineMs}`);

console.log("STEP: Goal Candidate별 신뢰도 벤치마크 (전략으로 재실행, 문자 그대로의 move 재생 아님)");
const startedAt = Date.now();
const allStats = candidates.map((c, i) => {
  const stats = computeReliability(c, replaySnapshots, libs);
  console.log(
    `  [${i + 1}/${candidates.length}] ${stats.candidate.replayHash.slice(0, 8)}::${stats.candidate.goalHash.slice(0, 8)} ` +
      `[${c.primitiveSequence.join(">")}]  success=${(stats.successRate * 100).toFixed(1)}%  regression=${(stats.regressionRate * 100).toFixed(1)}%  ` +
      `invalid=${(stats.invalidRate * 100).toFixed(1)}%  eligible=${stats.eligible}`
  );
  return stats;
});
console.log(`STEP: 완료 (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);

const eligibleStats = allStats.filter((s) => s.eligible);
const eligibleGoals = eligibleStats.map(toPortableGoal).sort(comparePriority);

// --- Write the browser-safe generated module --------------------------------
const generatedLines: string[] = [];
const gpush = (s = "") => generatedLines.push(s);
gpush("// AUTO-GENERATED by runGoalIntegrationBenchmark.ts -- do not hand-edit.");
gpush("// Browser-safe (no `fs`): the ELIGIBLE, priority-sorted Goal strategies");
gpush("// that passed Solver Integration Sprint v1's section 6 gate");
gpush("// (Expected WrongWing 감소 > 0 AND Replay Success Rate >= 60% AND");
gpush("// Regression Rate <= 20%), computed against all 75 real Failure Replays.");
gpush(`// Regenerate via: npx tsx src/customCube/runGoalIntegrationBenchmark.ts`);
gpush(`import type { PortableGoal } from "./GoalDescriptor";`);
gpush();
gpush(`export const ELIGIBLE_GOALS: PortableGoal[] = ${JSON.stringify(eligibleGoals, null, 2)};`);
gpush();
mkdirSync(dirname(eligibleGoalsPath), { recursive: true });
writeFileSync(eligibleGoalsPath, generatedLines.join("\n"), "utf-8");
console.log(`STEP: ${eligibleGoalsPath} 작성 (${eligibleGoals.length}개 ELIGIBLE Goal)`);

// --- Reliability report ------------------------------------------------------
const reportLines: string[] = [];
const rpush = (s = "") => reportLines.push(s);
rpush("========================================");
rpush("Goal Reliability Report -- Solver Integration Sprint v1");
rpush("========================================");
rpush();
rpush(`검증 대상 Goal Candidate: ${candidates.length}개 (Architecture Evolution Sprint v1에서 생성된 것만 사용, 신규 Goal 생성 없음)`);
rpush(`검증 방식: 각 후보의 primitiveSequence를 "전략"으로 재실행 (문자 그대로의 move 재생 아님), 75개 Replay 전체에 대해`);
rpush(`ELIGIBLE (section 6 게이트 통과): ${eligibleGoals.length}개`);
rpush();
rpush("--- 전체 후보 (게이트 판정 포함) ---");
for (const s of [...allStats].sort((a, b) => b.successRate - a.successRate)) {
  const c = s.candidate;
  rpush(
    `  ${c.replayHash.slice(0, 8)}::${c.goalHash.slice(0, 8)}  [${c.primitiveSequence.join(">")}]  ` +
      `WrongWing ${c.wrongWingBefore}->${c.wrongWingAfter}  success=${(s.successRate * 100).toFixed(1)}%  ` +
      `regression=${(s.regressionRate * 100).toFixed(1)}%  invalid=${(s.invalidRate * 100).toFixed(1)}%  ` +
      `${s.eligible ? "[ELIGIBLE]" : `[제외: ${s.reasonIfNotEligible}]`}`
  );
}
rpush();
rpush("--- ELIGIBLE Goal 우선순위 (section 5: WrongWing 감소량 > Pair 증가량 > Replay 성공률 > Move 수) ---");
for (const g of eligibleGoals) {
  rpush(
    `  ${g.id}  [${g.primitiveSequence.join(">")}]  wrongWingDecrease=${g.wrongWingDecrease}  pairIncrease=${g.pairIncrease}  ` +
      `successRate=${(g.replaySuccessRate * 100).toFixed(1)}%  originalMoveCount=${g.originalMoveCount}`
  );
}
if (eligibleGoals.length === 0) rpush("  (없음 -- 게이트를 통과한 Goal이 하나도 없음)");
mkdirSync(dirname(reliabilityReportPath), { recursive: true });
writeFileSync(reliabilityReportPath, reportLines.join("\n"), "utf-8");
console.log("\n" + reportLines.join("\n"));
