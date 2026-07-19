// Solver Primitive Prototype Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runPrimitivePrototypeRefinement.ts [failuresDbPath]
// Prototype Sprint v3 confirmed the Blueprint's mechanism (Level2 PASS)
// but fell short on added Capability (Level3 FAIL, 2 Gap Rescues vs a
// 3-replay bar). This Sprint tests two independent strategies to close
// that gap without touching v3's confirmed gate semantics as ground
// truth: Strategy A widens WHICH replays are attempted (Gate Expansion,
// solverPrimitivePrototypeRefinement/GateExpansionVariants.ts), Strategy
// B keeps v3's exact gate and instead varies the bounded DFS's own
// internal search behavior (Success Optimization,
// solverPrimitivePrototypeRefinement/SuccessOptimizationVariants.ts).
// Both reuse v3's own exported building blocks (countConflictEdges,
// runInstrumentedBoundedSearch, MIN/MAX_BRIDGE_CYCLE_LENGTH) unmodified.
//
// Runs the full comparison 3 times independently. Two disclosed
// methodology corrections went into this driver before the first
// reported run: (1) A2_noConflictGate initially "won" by DROPPING the
// Blueprint's own validated conflictEdgeCount>0 precondition entirely --
// a coarsening trap (GateExpansionVariants.ts/RefinementDecision.ts now
// exclude it from winning). (2) the existing-Gap ground truth
// (testAllAllowedSingleShot, which calls BASE -- disclosed
// Math.random()-seeded) was being recomputed independently per variant,
// making GapRescue comparisons partly noise from a shifting ground truth
// rather than the variants themselves (VariantEvaluation.ts's
// computeGapClassification now runs it ONCE per run, shared by every
// variant). Because GapRescue counts still hover right at the Level2
// bar (2 vs 3) even after that fix, and the Gap classification can still
// differ BETWEEN independent runs (same BASE randomness), this driver
// additionally requires decision A to be reached independently in EVERY
// one of 3 full re-runs before accepting it -- the same
// dominatesOldBlueprintEveryRun discipline Blueprint Sprint v2 used.
//
// No existing Solver/Planner/Executor/Recovery/Prototype v2/v3
// modification, no Hard Coding, no Planner Integration, no product code
// integration.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDataset, buildLibs } from "./solverPrimitivePrototype/PrototypeBenchmark";
import { GATE_VARIANTS } from "./solverPrimitivePrototypeRefinement/GateExpansionVariants";
import { SUCCESS_VARIANTS } from "./solverPrimitivePrototypeRefinement/SuccessOptimizationVariants";
import { runRefinementComparison, runCombinedVariant, evaluateVariant } from "./solverPrimitivePrototypeRefinement/RefinementComparison";
import { decideOutcome, decideOutcomeAcrossRuns, type RefinementOutcome } from "./solverPrimitivePrototypeRefinement/RefinementDecision";
import type { VariantMetrics } from "./solverPrimitivePrototypeRefinement/VariantEvaluation";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitivePrototypeRefinement/data/refinement-v1-report.txt";
const DEADLINE_MS = 400;
const REPRODUCIBILITY_RUNS = 3;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Prototype Refinement Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Prototype Sprint v3에서 확인된 사실(메커니즘 실측 확인, Regression 0건, 그러나 Gate Coverage 6.7%/Gap Rescue 2건으로 Integration 기준 미달)을 이어받아, Strategy A(Gate Expansion)와 Strategy B(Success Optimization)를 독립적으로 비교한다. 새 Refinement Prototype만 추가 구현하며, 기존 Solver/Planner/Executor/Recovery/Prototype v2/v3는 전혀 수정하지 않는다. Planner Integration/Hard Coding 없음.");
push();
push("--- 0-1. 방법론 수정 사항 (최초 실행 후 발견, 코드에 반영 완료) ---");
push("(1) A2_noConflictGate가 Blueprint가 검증한 conflictEdgeCount>0 조건을 제거하는 방식으로만 baseline을 앞선 것을 확인 -- coarsening trap으로 판단해 승자 후보에서 제외(isCoarseningBoundary 플래그).");
push("(2) existing-Gap 판정(testAllAllowedSingleShot, BASE 포함)이 변형마다 독립적으로 재계산되어 gapTotal이 변형 간에 달라지는 것을 확인 -- BASE의 Math.random() 변동성이 원인. computeGapClassification으로 1회 계산해 모든 변형이 공유하도록 수정.");
push("(3) 수정 후에도 GapRescue가 Level2 기준(3건)에 근접해 있어, 서로 다른 실행 간 Gap 분류 자체가 달라질 수 있음을 확인 -- 3회 독립 재실행 전부에서 decision A가 재현되어야만 최종 A로 인정한다.");
push();

const snapshots = loadDataset(failuresDbPath);
const { lib, libs } = buildLibs();

function formatMetrics(m: VariantMetrics): string {
  const tag = m.isCoarseningBoundary ? " [COARSENING BOUNDARY -- 승자 후보 제외, 참고용]" : "";
  return `[${m.variantName}]${tag} Coverage=${(m.coverage * 100).toFixed(1)}%(${m.matchedCount}/${m.totalReplays}) Precision=${(m.precision * 100).toFixed(1)}% Recall=${(m.recall * 100).toFixed(1)}% GapRescue=${m.gapRescueCount}/${m.gapTotal} Regression=${m.regressionCount} 평균시간=${m.avgTimeMs.toFixed(2)}ms`;
}

const perRunOutcomes: RefinementOutcome[] = [];

for (let runIndex = 1; runIndex <= REPRODUCIBILITY_RUNS; runIndex++) {
  log(`RUN ${runIndex}/${REPRODUCIBILITY_RUNS}: Strategy A(${GATE_VARIANTS.length}종) + Strategy B(${SUCCESS_VARIANTS.length}종) 비교 실행 (전체 ${snapshots.length} Replay)`);
  const comparison = runRefinementComparison(snapshots, lib, libs, DEADLINE_MS);

  push(`=== RUN ${runIndex}/${REPRODUCIBILITY_RUNS} ===`);
  push("[Strategy A: Gate Expansion]");
  for (const m of comparison.gateMetrics) push(formatMetrics(m));
  push("[Strategy B: Success Optimization]");
  for (const m of comparison.successMetrics) push(formatMetrics(m));
  push(`baseline(A0)↔B0 재구현 일관성: ${comparison.baselineVsSuccessB0Consistent ? "일치" : "불일치 -- 재구현 버그 가능성"}`);

  const baseline = comparison.gateMetrics[0];
  const nonBaseline = [...comparison.gateMetrics.slice(1), ...comparison.successMetrics.slice(1)];

  const eligibleGate = comparison.gateMetrics.slice(1).filter((m) => !m.isCoarseningBoundary);
  const bestGate = eligibleGate.length ? eligibleGate.reduce((a, b) => (b.gapRescueCount > a.gapRescueCount ? b : a)) : comparison.gateMetrics[0];
  const bestSuccess = comparison.successMetrics.slice(1).reduce((a, b) => (b.gapRescueCount > a.gapRescueCount ? b : a));
  push(`Strategy A 최고(coarsening 제외): ${formatMetrics(bestGate)}`);
  push(`Strategy B 최고: ${formatMetrics(bestSuccess)}`);

  let combinedMetrics: VariantMetrics | null = null;
  const gateHasSignal = bestGate.regressionCount === 0 && bestGate.gapRescueCount > baseline.gapRescueCount;
  const successHasSignal = bestSuccess.regressionCount === 0 && bestSuccess.gapRescueCount > baseline.gapRescueCount;

  if (gateHasSignal && successHasSignal) {
    const winningGate = GATE_VARIANTS.find((g) => g.name === bestGate.variantName)!;
    const winningOptions = SUCCESS_VARIANTS.find((s) => s.name === bestSuccess.variantName)!.options;
    const { metrics } = evaluateVariant(
      `AB_combined (Gate=${bestGate.variantName} + Search=${bestSuccess.variantName})`,
      snapshots,
      comparison.gapClassification,
      comparison.baselineSuccessHashes,
      (cubies, deadline) => runCombinedVariant(cubies, lib, deadline, winningGate, winningOptions),
      DEADLINE_MS,
    );
    combinedMetrics = metrics;
    push(`결합 변형 실행 (두 전략 모두 개별 신호 있음): ${formatMetrics(combinedMetrics)}`);
  } else {
    push(`결합 생략: Gate 신호=${gateHasSignal ? "있음" : "없음"}, Success 신호=${successHasSignal ? "있음" : "없음"}`);
  }

  const allNonBaseline = combinedMetrics ? [...nonBaseline, combinedMetrics] : nonBaseline;
  const outcome = decideOutcome(baseline, allNonBaseline);
  perRunOutcomes.push(outcome);
  push(`RUN ${runIndex} 결정: ${outcome.decision} -- ${outcome.rationale}`);
  push();

  log(`RUN ${runIndex} 완료: 결정=${outcome.decision}`);
}

const finalOutcome = decideOutcomeAcrossRuns(perRunOutcomes);
log(`최종 결정(3회 재현성 기준)=${finalOutcome.decision}`);

push("--- 최종 재현성 판정 ---");
push(`Run별 결정: ${finalOutcome.perRunDecisions.join(", ")}`);
push(`Level 1 (Mechanism이 유지된다, 전 Run 공통): ${finalOutcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (Gap Rescue가 3건 이상으로 증가한다): ${finalOutcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (Regression 증가 없이 Coverage 또는 Gate 내부 Success Rate 증가): ${finalOutcome.level3Pass ? "PASS" : "FAIL"}`);
push();
push("--- 최종 결론 ---");
push(`결정: ${finalOutcome.decision}`);
push(finalOutcome.rationale);
if (finalOutcome.bestVariant) push(`참고 변형(마지막 재현 Run 기준): ${formatMetrics(finalOutcome.bestVariant)}`);
push();

const nextStep =
  finalOutcome.decision === "A"
    ? "다음 단계: Solver Primitive Integration Blueprint Sprint v1."
    : finalOutcome.decision === "B"
      ? "다음 단계: Solver Primitive Prototype Refinement Sprint v2."
      : "다음 단계: Solver Primitive Strategy Review Sprint.";
push(`=== Sprint 종료: ${finalOutcome.decision === "A" ? "성공" : "추가 조치 필요"} ===`);
push(nextStep);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts, MultiHopBridgePrototype.ts(v2)/MultiHopBridgePrototypeV3.ts 및 solverPrimitivePrototype/ 전체, solverV2Prototype/(BoundedResolver.ts/MultiCycleAnalyzer.ts/DeferredValidator.ts) 전부 미수정(읽기 전용 재사용만). Planner Integration/Hard Coding 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (finalOutcome.decision !== "A") process.exitCode = 1;
