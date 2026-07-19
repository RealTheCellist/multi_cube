// --- StandardEvaluationProtocol (Solver Primitive Evaluation
// Stabilization Sprint v2) -- STEP5: documents STEP1~4's findings as one
// concrete, reusable procedure for future Prototype Sprints, and applies
// this Sprint's own Level 1~3 criteria to the real data to reach the
// required A/B/C conclusion.
//   Level 1: Effect Size와 필요 표본 수를 정량적으로 산출한다 -- PASS if
//     Cohen's d and the required-N formula both produced finite,
//     well-defined numbers (STEP1/STEP2 completed without degenerate
//     input).
//   Level 2: 충분한 Run 수에서 paired-diff CI가 안정적으로 수렴하는가 --
//     PASS only if STEP3's empirical CI width at the largest tested N is
//     narrower than at the smallest (N=5) checkpoint. A formula saying
//     "N should shrink the CI" is not itself confirmation that it DID.
//   Level 3: 재사용 가능한 표준 절차를 확정한다 -- PASS only if the
//     largest tested N in STEP3 either (a) already reaches the formal
//     80% power bar computed in STEP2, or (b) the paired-diff CI at that
//     N already excludes zero (a definitive answer reached regardless of
//     the formal power target) -- otherwise the protocol is well-DEFINED
//     but not yet demonstrated SUFFICIENT, which is a real, disclosable
//     Level3 FAIL, not a flaw in the procedure itself.
import type { EffectSizeResult } from "./EffectSizeAnalysis";
import type { RequiredSampleSizeResult, AchievedPowerRow } from "./RequiredSampleSize";
import type { ExtendedReproducibilityResult } from "./ExtendedReproducibility";
import type { NoiseDecompositionResult } from "./NoiseSourceDecomposition";

export interface StandardProtocolSpec {
  recommendedRunCount: string;
  gapClassificationMethod: string;
  confidenceIntervalMethod: string;
  primitiveComparisonBasis: string;
  integrationApprovalCriterion: string;
}

export function buildProtocolSpec(requiredN: number, maxTestedN: number, dominantNoiseSource: string): StandardProtocolSpec {
  return {
    recommendedRunCount: `이론상 80% Power/α=0.05 기준 필요 Run 수는 ${requiredN}회(Cohen's d 기반 계산). 이번 Sprint에서 실제로 검증한 최대 Run 수는 ${maxTestedN}회. ${requiredN}회 전부를 매 Prototype 비교마다 도는 것은 비용이 크므로, 최소 ${maxTestedN}회를 표준으로 하되 CI가 0을 배제하지 못하면 그때 추가 Run으로 확장한다(적응적 표본 수집).`,
    gapClassificationMethod: "Majority Vote (N회 중 과반수) -- Single Run 대비 replay 집합 자체의 안정성을 확보한다(Evaluation Stabilization Sprint v1이 확인한 Single Run/Majority Vote 총합 우연 일치·Jaccard 75.7% 불일치 문제 방지).",
    confidenceIntervalMethod: "동일 Run 안에서 짝지은(paired) 차이의 평균과 95% CI(정규근사, 1.96*stddev/sqrt(n)) -- 독립적으로 흔들리는 baseline/candidate 각각의 CI를 비교하지 않고, 같은 Run의 Gap 판정을 공유하는 paired diff로 흔들리는 기준선의 영향을 상쇄한다.",
    primitiveComparisonBasis: `Primitive별 변동 기여도(freeze-one-out 분산 분해)를 함께 보고한다 -- 이번 Sprint 기준 가장 큰 기여자는 ${dominantNoiseSource}이며, Gap 총합의 안정성을 논할 때 이 Primitive의 실제 상태(재시도 여부, deadline 여유 등)를 함께 점검해야 한다.`,
    integrationApprovalCriterion: "paired-diff CI 하한이 0을 초과해야 통계적으로 유의미한 개선으로 인정한다('건수 >= 고정 threshold' 기준은 폐기). CI가 0을 포함하면 Run 수를 늘리거나 Integration 승인을 보류한다.",
  };
}

export type FinalDecision = "A" | "B" | "C";

export interface StabilizationV2Outcome {
  decision: FinalDecision;
  rationale: string;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
  protocol: StandardProtocolSpec;
}

export function decideOutcome(
  effectSize: EffectSizeResult,
  sampleSize: RequiredSampleSizeResult,
  achievedPowerTable: readonly AchievedPowerRow[],
  extendedRepro: ExtendedReproducibilityResult,
  noiseDecomposition: NoiseDecompositionResult,
): StabilizationV2Outcome {
  const level1Pass = Number.isFinite(effectSize.cohensD) && Number.isFinite(sampleSize.requiredN) && sampleSize.requiredN > 0;

  const level2Pass = extendedRepro.ciNarrowedFromFirstToLast;

  const maxCheckpoint = extendedRepro.checkpoints[extendedRepro.checkpoints.length - 1];
  const maxN = maxCheckpoint.n;
  const powerAtMaxN = achievedPowerTable.find((r) => r.n === maxN)?.achievedPower ?? 0;
  const reachesFormalPower = powerAtMaxN >= 0.8;
  const definitiveAtMaxN = maxCheckpoint.gapRescueCI.pairedDiffCIExcludesZero;
  const level3Pass = reachesFormalPower || definitiveAtMaxN;

  const protocol = buildProtocolSpec(sampleSize.requiredN, maxN, noiseDecomposition.dominantSource);

  const effectNote = `Effect Size: Cohen's d=${effectSize.cohensD.toFixed(3)}(${effectSize.magnitude}), 필요 Run 수(80% Power, α=0.05)=${sampleSize.requiredN}.`;
  const powerNote = `N=${maxN}에서 달성 Power=${(powerAtMaxN * 100).toFixed(1)}%(${reachesFormalPower ? "80% 기준 충족" : "80% 기준 미달"}), paired-diff CI가 0을 배제하는가=${definitiveAtMaxN}.`;
  const ciNote = `CI 폭: N=${extendedRepro.checkpoints[0].n}일 때 ${extendedRepro.checkpoints[0].pairedDiffCIWidth.toFixed(2)} → N=${maxN}일 때 ${maxCheckpoint.pairedDiffCIWidth.toFixed(2)}(${extendedRepro.ciNarrowedFromFirstToLast ? "narrowed" : "narrowed 안 됨"}).`;
  const noiseNote = `주요 변동 기여 Primitive: ${noiseDecomposition.dominantSource}(varianceReductionRatio=${noiseDecomposition.perPrimitiveContribution[0].varianceReductionRatio.toFixed(2)}).`;

  if (!level1Pass) {
    return {
      decision: "C",
      rationale: `Effect Size 또는 필요 표본 수 계산이 정의되지 않았다(degenerate) -- 평가 기준 자체를 재설계해야 한다.`,
      level1Pass,
      level2Pass,
      level3Pass,
      protocol,
    };
  }

  if (!level2Pass) {
    return {
      decision: "C",
      rationale: `${effectNote} ${ciNote} Run 수를 늘려도 paired-diff CI가 좁아지지 않았다 -- 단순 반복만으로는 이 Evaluation Framework가 수렴하지 않는다는 뜻이므로, 현재 Framework(paired-diff CI 기반)로는 Primitive 간 비교를 신뢰할 수 없다. 평가 기준 자체를 재설계해야 한다.`,
      level1Pass,
      level2Pass,
      level3Pass,
      protocol,
    };
  }

  if (!level3Pass) {
    return {
      decision: "B",
      rationale: `${effectNote} ${ciNote} ${powerNote} ${noiseNote} Run이 늘수록 CI는 실제로 좁아졌다(Level2 PASS)는 유효한 신호지만, 이번에 실제로 검증한 N=${maxN}는 이론상 필요한 ${sampleSize.requiredN}회에 크게 못 미쳐 80% Power 기준도, CI가 0을 배제하는 것도 아직 달성하지 못했다(Level3 FAIL) -- 추가 통계 검증(더 많은 Run)이 필요하다.`,
      level1Pass,
      level2Pass,
      level3Pass,
      protocol,
    };
  }

  return {
    decision: "A",
    rationale: `${effectNote} ${ciNote} ${powerNote} ${noiseNote} 표준 Evaluation Protocol을 확정한다.`,
    level1Pass,
    level2Pass,
    level3Pass,
    protocol,
  };
}
