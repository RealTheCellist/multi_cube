// Solver Primitive Prototype Refinement Sprint v2 -- driver.
//   npx tsx src/customCube/runPrototypeRefinementV2.ts [failuresDbPath]
// Adopts A1_wideCycle (cycleLength 2~4 AND conflictEdgeCount>0) as the
// new baseline -- Evaluation Stabilization Sprint v2 confirmed it beats
// the old A0 baseline with a paired-diff CI excluding zero at every
// N=5/10/15 checkpoint, replicated across two independent full runs.
// This Sprint does NOT modify Evaluation methodology -- it applies the
// CONFIRMED Standard Evaluation Protocol (Majority Vote Gap
// classification + paired-diff 95% CI, N>=15, adaptively extended if
// inconclusive) as-is, and focuses research effort back on Primitive
// design: Strategy A extends the cycle-length band further (2~5),
// Strategy B varies the bounded DFS's search behavior on the NEW
// baseline's gate (reordering, wider per-hop candidate budget).
//
// New directory (avoids colliding with the PROTECTED
// solverPrimitivePrototypeRefinement/ v1 files, which are read-only
// reused here), zero modification to Solver/Planner/Executor/Recovery/
// Primitive/Prototype/any prior Sprint's Evaluation code.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDataset, buildLibs } from "./solverPrimitivePrototype/PrototypeBenchmark";
import { collectMultipleRunsV2 } from "./solverPrimitivePrototypeRefinementV2/RawDataCollectorV2";
import { evaluateVariantsV2 } from "./solverPrimitivePrototypeRefinementV2/StandardProtocolEvaluation";
import { decideOutcomeV2 } from "./solverPrimitivePrototypeRefinementV2/RefinementV2Decision";
import type { VariantV2Metrics } from "./solverPrimitivePrototypeRefinementV2/StandardProtocolEvaluation";
import type { RunRecordV2 } from "./solverPrimitivePrototypeRefinementV2/RawDataCollectorV2";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitivePrototypeRefinementV2/data/refinement-v2-report.txt";
const DEADLINE_MS = 400;
const INITIAL_N = 15; // Standard Evaluation Protocol's own minimum
const EXTENSION_N = 10;
const MAX_N = 25;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Prototype Refinement Sprint v2 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("A1_wideCycle(cycleLength 2~4 AND conflictEdgeCount>0)을 새 baseline으로 채택한다 -- Evaluation Stabilization Sprint v2가 paired-diff CI로 기존 A0 baseline보다 통계적으로 유의미하게 우수함을 확인했다(N=5/10/15 전 구간, 독립 2회 재현). 이번 Sprint는 Evaluation Framework를 더 이상 바꾸지 않고 확정된 Standard Evaluation Protocol(Majority Vote Gap 분류 + paired-diff 95% CI, N>=15, 필요시 적응적 확장)을 그대로 적용해 Capability 확장에 집중한다. 기존 Solver/Planner/Executor/Recovery/Primitive/Prototype 및 이전 Sprint들의 Evaluation 코드는 전혀 수정하지 않는다(읽기 전용 재사용만).");
push();

const snapshots = loadDataset(failuresDbPath);
const { lib, libs } = buildLibs();

function formatVariant(m: VariantV2Metrics): string {
  return `[${m.variantName}] Coverage=${(m.coverage * 100).toFixed(1)}% avgMatched=${m.avgMatchedCount.toFixed(1)} Precision=${(m.precision * 100).toFixed(1)}% GapRescue평균=${m.gapRescueStats.mean.toFixed(2)}(CI=[${m.gapRescueStats.ciLower.toFixed(2)}, ${m.gapRescueStats.ciUpper.toFixed(2)}]) pairedDiff평균=${m.pairedDiffVsBaselineStats.mean.toFixed(2)}(CI=[${m.pairedDiffVsBaselineStats.ciLower.toFixed(2)}, ${m.pairedDiffVsBaselineStats.ciUpper.toFixed(2)}]) Regression=${m.regressionCount}`;
}

log(`STEP1/2: Strategy A(V1_wideCycle5) + Strategy B(W1_reordered/W2_widerHop) 데이터 수집 시작 (N=${INITIAL_N}, 전체 ${snapshots.length} Replay)`);
let runs: RunRecordV2[] = collectMultipleRunsV2(snapshots, lib, libs, DEADLINE_MS, INITIAL_N);
let metrics = evaluateVariantsV2(runs);
let baseline = metrics.find((m) => m.variantName === "V0_baseline")!;
let candidates = metrics.filter((m) => m.variantName !== "V0_baseline");
let outcome = decideOutcomeV2(baseline, candidates);
log(`N=${runs.length} 1차 판정: level1Pass=${outcome.level1Pass}`);

push(`--- 1. 데이터 수집 및 변형 비교 (N=${runs.length}) ---`);
push(formatVariant(baseline));
for (const c of candidates) push(formatVariant(c));
push();

if (!outcome.level1Pass && runs.length < MAX_N) {
  log(`Standard Protocol의 적응적 표본 확장 적용: N=${runs.length}에서 결론 나지 않아 +${EXTENSION_N}회 추가 수집`);
  const moreRuns = collectMultipleRunsV2(snapshots, lib, libs, DEADLINE_MS, EXTENSION_N);
  runs = [...runs, ...moreRuns];
  metrics = evaluateVariantsV2(runs);
  baseline = metrics.find((m) => m.variantName === "V0_baseline")!;
  candidates = metrics.filter((m) => m.variantName !== "V0_baseline");
  outcome = decideOutcomeV2(baseline, candidates);
  log(`N=${runs.length} 확장 후 판정: level1Pass=${outcome.level1Pass}`);

  push(`--- 1-1. 적응적 표본 확장 (N=${runs.length}) ---`);
  push(`Standard Evaluation Protocol의 "CI가 0을 배제하지 못하면 추가 Run으로 확장한다" 원칙에 따라 ${EXTENSION_N}회를 추가로 수집했다.`);
  push(formatVariant(baseline));
  for (const c of candidates) push(formatVariant(c));
  push();
}

log(`최종 결정=${outcome.decision}`);

push("--- 2. 성공 기준 (Level 1~3) ---");
push(`Level 1 (Capability가 실제로 확장되었다 -- paired-diff CI가 0을 배제하는 정당한 변형 존재): ${outcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (Regression 없이 개선되었다): ${outcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (개선 폭이 baseline 평균 GapRescue의 20% 이상으로 실질적이다): ${outcome.level3Pass ? "PASS" : "FAIL"}`);
push();

push("--- 3. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
if (outcome.bestVariant) push(`최적 변형: ${formatVariant(outcome.bestVariant)}`);
push();

const nextStep =
  outcome.decision === "A"
    ? "다음 단계: Solver Primitive Integration Blueprint Sprint v1 (확정된 Primitive를 실제 Solver에 통합)."
    : outcome.decision === "B"
      ? "다음 단계: Solver Primitive Prototype Refinement Sprint v3 (추가 방향 탐색 또는 표본 추가 확장)."
      : "다음 단계: Solver Primitive Strategy Review Sprint (Gate 확장/탐색 최적화 방향 재검토).";
push(`=== Sprint 종료: ${outcome.decision === "A" ? "성공" : "추가 조치 필요"} ===`);
push(nextStep);
push(`실제 사용한 Run 수: ${runs.length} (Standard Protocol 최소 기준 ${INITIAL_N}회${runs.length > INITIAL_N ? `, 적응적 확장으로 ${runs.length}회까지 늘림` : ""})`);
push("보호 파일: 기존 Solver/Planner/Executor/Recovery/Primitive/Prototype, solverPrimitivePrototypeRefinement/(v1) 및 solverPrimitiveEvaluationStabilization/(v1/v2) 전부 미수정(읽기 전용 재사용만). Hard Coding/Planner Integration 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (outcome.decision !== "A") process.exitCode = 1;
