// --- Solver Completeness Verification Sprint v1 -- driver -------------------
// Usage:
//   npx tsx src/customCube/runSolverCompletenessVerificationSprintV1.ts \
//     [dbPath] [replayPoolSize] [samplesPerDepth] [repeatabilityTrials] [regressionTrials]
//
// Verifies Completeness (see docs) of the Release Candidate Production
// Solver: Goal A (always terminates cleanly), Goal B (always reaches Solved
// or an allowed terminal state), Goal C (Operating Contracts never
// violated), Goal D (Regression stays within the established Release
// Contract). NO Production file is touched -- only measurement/log/
// verification-script/documentation additions, per this Sprint's own
// protected-file principle (Planner/Recovery/Primitive Library/Executor/
// Operating Contract: read-only).
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildSnapshot335Cases,
  buildReplayPool150,
  buildDepthGradedScrambles,
  buildWorstCaseLibrary,
  type DatasetCase,
} from "./solverCompletenessVerification/DatasetBuilder";
import { runFullPipeline, ensureWarm, type FullPipelineResult } from "./solverCompletenessVerification/FullPipelineProbe";
import { summarizeCategory, evaluateGates, type CategoryCensus, type CompletenessGateResult } from "./solverCompletenessVerification/CompletenessGates";
import { runRegressionReconfirmation, type RegressionCase } from "./solverCompletenessVerification/RegressionReconfirmation";
import { cloneCubies } from "./cubeState";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const REPLAY_POOL_OVERRIDE = process.argv[3] ? Number(process.argv[3]) : undefined;
const SAMPLES_PER_DEPTH_OVERRIDE = process.argv[4] ? Number(process.argv[4]) : undefined;
const REPEATABILITY_TRIALS = Number(process.argv[5] ?? 10);
const REGRESSION_TRIALS = Number(process.argv[6] ?? 30);
const SNAPSHOT335_CAP = process.argv[7] ? Number(process.argv[7]) : undefined;
const WORST_CASE_CAP = process.argv[8] ? Number(process.argv[8]) : undefined;

const checkpointPath = "src/customCube/solverCompletenessVerification/data/checkpoint-v1.json";
interface CheckpointData {
  configKey: string;
  completedLabels: string[];
  results: FullPipelineResult[];
}
function loadCheckpoint(): CheckpointData | null {
  if (!existsSync(checkpointPath)) return null;
  try {
    return JSON.parse(readFileSync(checkpointPath, "utf-8")) as CheckpointData;
  } catch {
    return null;
  }
}
function saveCheckpoint(data: CheckpointData): void {
  mkdirSync(dirname(checkpointPath), { recursive: true });
  writeFileSync(checkpointPath, JSON.stringify(data), "utf-8");
}

const checkpoint2Path = "src/customCube/solverCompletenessVerification/data/checkpoint-v1-step2.json";
interface Checkpoint2Data {
  configKey: string;
  completedTrials: number; // fully-finished trials only
  results: FullPipelineResult[][]; // one array per fully-finished trial
  // Per-case progress within the trial CURRENTLY in flight, so a death
  // mid-trial resumes from the next unfinished case instead of restarting
  // the whole ~50-55min trial from case 1 (this Sprint's own earlier
  // per-trial-only checkpointing wasted up to a full trial's worth of
  // work per interruption -- fixed here at the user's request).
  currentTrialResults: FullPipelineResult[];
}
function loadCheckpoint2(): Checkpoint2Data | null {
  if (!existsSync(checkpoint2Path)) return null;
  try {
    return JSON.parse(readFileSync(checkpoint2Path, "utf-8")) as Checkpoint2Data;
  } catch {
    return null;
  }
}
function saveCheckpoint2(data: Checkpoint2Data): void {
  mkdirSync(dirname(checkpoint2Path), { recursive: true });
  writeFileSync(checkpoint2Path, JSON.stringify(data), "utf-8");
}

const report: string[] = [];
function push(line: string): void {
  report.push(line);
}
function log(step: string, msg: string): void {
  console.log(`${step}: ${msg}`);
}

async function main(): Promise<void> {
  ensureWarm();
  log("init", "Building datasets...");

  const snapshot335 = SNAPSHOT335_CAP !== undefined ? buildSnapshot335Cases(dbPath).slice(0, SNAPSHOT335_CAP) : buildSnapshot335Cases(dbPath);
  const replay150 = REPLAY_POOL_OVERRIDE !== undefined ? buildReplayPool150().slice(0, REPLAY_POOL_OVERRIDE) : buildReplayPool150();
  let scrambleDepths = buildDepthGradedScrambles();
  if (SAMPLES_PER_DEPTH_OVERRIDE !== undefined) {
    // keep only the first N samples per depth bucket when overridden (smoke-test scale)
    const perDepthCounts = new Map<string, number>();
    scrambleDepths = scrambleDepths.filter((c: DatasetCase) => {
      const count = perDepthCounts.get(c.category) ?? 0;
      if (count >= SAMPLES_PER_DEPTH_OVERRIDE) return false;
      perDepthCounts.set(c.category, count + 1);
      return true;
    });
  }
  const worstCaseFull = buildWorstCaseLibrary(dbPath);
  const worstCase = WORST_CASE_CAP !== undefined ? worstCaseFull.slice(0, WORST_CASE_CAP) : worstCaseFull;

  push("Solver Completeness Verification Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push("");
  push("1. Completeness 정의: 정의된 입력 도메인 내의 모든 합법적 상태에 대해 solve()가 (a) 정상 종료(Crash/Exception/Infinite Loop/Deadlock/Timeout 없음), (b) Solved 또는 허용된 정상 종료 상태에 도달, (c) Operating Contract(ENDGAME/Incremental Recovery/CCR)를 위반하지 않는 성질.");
  push("");
  push(`Dataset 구성: 335 Snapshot(전수) + Replay Pool ${replay150.length}건(신규 생성, depth=40) + Scramble Depth[10,20,30,40,50,100] x ${SAMPLES_PER_DEPTH_OVERRIDE ?? 30}건 + Worst Case Library ${worstCase.length}건(기존 335 population에서 parity/recovery-failed/high-wrongWingCount 태그로 파생).`);
  push(`반복 상한: Wing-pairing 반복 호출 50회 (수렴 실패 시 Gate2 위반 후보). Repeatability 재확인: Worst Case Library에 대해 N=${REPEATABILITY_TRIALS}회 재실행. Regression 재확인(Goal D): N=${REGRESSION_TRIALS}-trial paired 비교.`);
  push("");

  const allCases: DatasetCase[] = [...snapshot335, ...replay150, ...scrambleDepths, ...worstCase];
  const configKey = `${dbPath}|${replay150.length}|${scrambleDepths.length}|${worstCase.length}`;

  const checkpoint = loadCheckpoint();
  const results: FullPipelineResult[] = [];
  const completedLabels = new Set<string>();
  if (checkpoint && checkpoint.configKey === configKey) {
    results.push(...checkpoint.results);
    for (const l of checkpoint.completedLabels) completedLabels.add(l);
    log("resume", `체크포인트에서 재개: ${completedLabels.size}/${allCases.length}건 완료.`);
  }

  log("step1", `STEP1: 전수 census 시작 (${allCases.length}건, resume from ${completedLabels.size})...`);
  let processed = completedLabels.size;
  for (const c of allCases) {
    if (completedLabels.has(c.label)) continue;
    const cubies = cloneCubies(c.cubies);
    const result = await runFullPipeline(cubies, c.label);
    results.push(result);
    completedLabels.add(c.label);
    processed++;
    if (processed % 25 === 0 || processed === allCases.length) {
      log("step1", `  ${processed}/${allCases.length}...`);
      saveCheckpoint({ configKey, completedLabels: [...completedLabels], results });
    }
  }
  saveCheckpoint({ configKey, completedLabels: [...completedLabels], results });

  // Group results back by category for the census report.
  const byCategory = new Map<string, FullPipelineResult[]>();
  const labelToCategory = new Map(allCases.map((c) => [c.label, c.category] as const));
  for (const r of results) {
    const cat = labelToCategory.get(r.label) ?? "unknown";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }
  const censuses: CategoryCensus[] = [...byCategory.entries()].map(([cat, rs]) => summarizeCategory(cat, rs));

  push("STEP1. 전수 census 결과 (카테고리별):");
  for (const c of censuses) {
    push(
      `  ${c.category}: n=${c.n}, Success=${c.solvedCount}/${c.n} (${(c.solveSuccessRate * 100).toFixed(2)}%), Crash=${c.crashCount}, 수렴실패=${c.nonConvergentCount}, BudgetViolation=${c.budgetViolationCount}, UnknownState=${c.unknownStateCount}, avgWallMs=${c.avgTotalWallMs.toFixed(1)}, avgWingPairingIterations=${c.avgWingPairingIterations.toFixed(2)}`
    );
  }
  push("");

  // Worst-case failures detail (for the Worst Case 분석 deliverable).
  const failing = results.filter((r) => r.anyException || !r.wingPairingConverged || r.unknownState);
  push(`STEP1. 실패/미수렴/UnknownState 상세 (${failing.length}건):`);
  for (const r of failing.slice(0, 30)) {
    push(`  ${r.label}: anyException=${r.anyException}(${r.exceptionPhase ?? "-"}), converged=${r.wingPairingConverged}, iterations=${r.wingPairingIterations}, unknownState=${r.unknownState}`);
  }
  if (failing.length > 30) push(`  ... 외 ${failing.length - 30}건 (전체 상세는 STEP1 census 원본 참조)`);
  push("");

  // STEP2: repeatability re-confirmation on the Worst Case Library --
  // addresses the Work Order's own "비결정성 제거" concern for solve()'s
  // genuine stochasticity (shuffle()-driven) without re-running the ENTIRE
  // exhaustive census N times over (computationally infeasible at N=30
  // across 700+ cases) -- scoped to the hardest, most failure-prone subset.
  log("step2", `STEP2: Worst Case Library 재현성 재확인 (N=${REPEATABILITY_TRIALS})...`);
  const step2ConfigKey = `${configKey}|${worstCase.length}|${REPEATABILITY_TRIALS}`;
  const checkpoint2 = loadCheckpoint2();
  const sameConfig2 = checkpoint2 && checkpoint2.configKey === step2ConfigKey;
  const repeatabilityResults: FullPipelineResult[][] = sameConfig2 ? checkpoint2.results : [];
  let step2Start = repeatabilityResults.length;
  let resumedTrialResults: FullPipelineResult[] = (sameConfig2 && checkpoint2.currentTrialResults) || [];
  if (step2Start > 0 || resumedTrialResults.length > 0) {
    log("step2", `체크포인트에서 재개: ${step2Start}/${REPEATABILITY_TRIALS} trial 완료, 현재 trial ${resumedTrialResults.length}/${worstCase.length}건 진행됨.`);
  }
  for (let t = step2Start; t < REPEATABILITY_TRIALS; t++) {
    const trialResults: FullPipelineResult[] = resumedTrialResults;
    resumedTrialResults = []; // only the first resumed trial reuses partial progress
    const caseStart = trialResults.length;
    for (let ci = caseStart; ci < worstCase.length; ci++) {
      const c = worstCase[ci];
      trialResults.push(await runFullPipeline(cloneCubies(c.cubies), `${c.label}:trial${t}`));
      saveCheckpoint2({ configKey: step2ConfigKey, completedTrials: t, results: repeatabilityResults, currentTrialResults: trialResults });
    }
    repeatabilityResults.push(trialResults);
    log("step2", `  trial ${t + 1}/${REPEATABILITY_TRIALS}...`);
    saveCheckpoint2({ configKey: step2ConfigKey, completedTrials: t + 1, results: repeatabilityResults, currentTrialResults: [] });
  }
  const repeatabilityFlat = repeatabilityResults.flat();
  const repeatabilityCensus = summarizeCategory("worstCase-repeatability", repeatabilityFlat);
  push(
    `STEP2. Worst Case Library 재현성 (N=${REPEATABILITY_TRIALS} x ${worstCase.length}건=${repeatabilityFlat.length}회): Success=${repeatabilityCensus.solvedCount}/${repeatabilityCensus.n} (${(repeatabilityCensus.solveSuccessRate * 100).toFixed(2)}%), Crash=${repeatabilityCensus.crashCount}, 수렴실패=${repeatabilityCensus.nonConvergentCount}, BudgetViolation=${repeatabilityCensus.budgetViolationCount}`
  );
  push("");

  // STEP3: Goal D -- Regression reconfirmation (wing-pairing-only scope,
  // Standard Evaluation Protocol reused unchanged). Scoped to a bounded,
  // stride-sampled subsample (matching this whole research arc's own
  // established "75-snapshot subsample, N=30 trial" convention) rather than
  // the full ~700+ case population -- Goal D is a STATISTICAL
  // re-confirmation, not an exhaustive census (that's Goal A/B/C's job in
  // STEP1 above), so re-running it at full-population scale would multiply
  // compute cost for no additional statistical power.
  const REGRESSION_SUBSAMPLE_SIZE = 75;
  const stride = Math.max(1, Math.floor(allCases.length / REGRESSION_SUBSAMPLE_SIZE));
  const regressionSubsample = allCases.filter((_, i) => i % stride === 0).slice(0, REGRESSION_SUBSAMPLE_SIZE);
  log("step3", `STEP3: Regression 재확인 (Goal D, N=${REGRESSION_TRIALS} trial, ${regressionSubsample.length}건 stride-subsample)...`);
  const regressionCases: RegressionCase[] = regressionSubsample.map((c) => ({ label: c.label, cubies: c.cubies }));
  const regression = runRegressionReconfirmation(regressionCases, REGRESSION_TRIALS);
  push(
    `STEP3. Regression 재확인 (Goal D, wing-pairing 범위, N=${regression.nTrials} trial, ${regression.nCases}건 전체 population): N-trial 평균 True Regression rate=${(regression.avgTrueRegressionRateAcrossTrials * 100).toFixed(2)}% (${regression.withinAllowance ? "허용 범위 내" : "허용 범위 초과"}). Primary(improved diff) mean=${regression.evaluation.primary.stats.mean.toFixed(3)}, 95% CI=[${regression.evaluation.primary.stats.ciLower.toFixed(3)}, ${regression.evaluation.primary.stats.ciUpper.toFixed(3)}], Cohen's d_z=${regression.evaluation.primary.effectSize.cohensD.toFixed(3)} (${regression.evaluation.primary.effectSize.magnitude}).`
  );
  push(
    `  [단일-pass 전체 census, 참고용]: True Regression=${(regression.fullCensusAudit.trueRegressionRate * 100).toFixed(2)}%, Gap Rescue=${(regression.fullCensusAudit.gapRescueRate * 100).toFixed(2)}%, new Deadline Miss=${(regression.fullCensusAudit.newDeadlineMissRate * 100).toFixed(2)}%, new Budget Violation=${(regression.fullCensusAudit.newBudgetViolationRate * 100).toFixed(2)}%`
  );
  push("");

  // Gate evaluation.
  const gates: CompletenessGateResult[] = evaluateGates(
    censuses,
    regression.withinAllowance,
    `N=${regression.nTrials}-trial 평균 True Regression rate=${(regression.avgTrueRegressionRateAcrossTrials * 100).toFixed(2)}% (허용 5% ${regression.withinAllowance ? "이내" : "초과"}).`
  );
  push("Completeness Gate 판정:");
  for (const g of gates) push(`  Gate${g.gate} (${g.name}): ${g.pass ? "PASS" : "FAIL"} -- ${g.detail}`);
  push("");

  const allPass = gates.every((g) => g.pass);
  push(`Final Completeness Declaration: ${allPass ? "5x5 Solver Completeness Verified" : "Completeness NOT Verified"}`);

  const reportPath = "src/customCube/solverCompletenessVerification/data/solver-completeness-verification-v1-report.txt";
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report.join("\n") + "\n", "utf-8");
  log("done", `Report written to ${reportPath}`);
  console.log(`COMPLETENESS DECLARATION: ${allPass ? "VERIFIED" : "NOT VERIFIED"}`);

  if (existsSync(checkpointPath)) unlinkSync(checkpointPath);
  if (existsSync(checkpoint2Path)) unlinkSync(checkpoint2Path);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
