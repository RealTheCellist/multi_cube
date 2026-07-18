// --- DatasetGrowthEstimator (Solver Dataset Expansion Research Sprint v1)
// STEP3: projects Shape 재등장률/Singleton 비율/Lookup 가능성/Cluster
// 안정성 at Dataset sizes 75/150/300/500/1000. EXPLICITLY AN ESTIMATE --
// no new Failures are generated or collected. The model is a Chinese
// Restaurant Process (CRP) simulation, a standard, well-known nonparametric
// model for "how many distinct categories appear as sample size grows"
// (used in species-richness/vocabulary-growth estimation). Its
// concentration parameter (alpha) is calibrated so the model's own
// simulated unique-category count at n=75 matches the REAL observed
// count -- then the SAME calibrated model is projected forward. This is a
// disclosed, inspectable simulation (seeded, deterministic), not a
// closed-form formula pulled from memory, so its assumptions are auditable
// in code rather than hidden in an equation.
//
// Explicit limitation, disclosed: the CRP assumes new draws are
// exchangeable with the observed 75 (same generative process) -- if real
// future replays come from a meaningfully different distribution (e.g. a
// different scramble generator, different capture bias), this projection
// would not hold. This is exactly the kind of thing STEP4 (Sampling
// Strategy) has to address, not something this estimator can correct for.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { histogramOf } from "./DatasetBiasReport";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateCRPRun(alpha: number, targetN: number, rng: () => number): { uniqueCount: number; singletonCount: number } {
  const tables: number[] = [];
  let n = 0;
  for (let i = 0; i < targetN; i++) {
    const r = rng() * (n + alpha);
    let cum = 0;
    let joined = false;
    for (let t = 0; t < tables.length; t++) {
      cum += tables[t];
      if (r < cum) {
        tables[t]++;
        joined = true;
        break;
      }
    }
    if (!joined) tables.push(1);
    n++;
  }
  return { uniqueCount: tables.length, singletonCount: tables.filter((c) => c === 1).length };
}

function averageCRP(alpha: number, n: number, trials: number, seedBase: number): { avgUnique: number; avgSingleton: number } {
  let sumUnique = 0;
  let sumSingleton = 0;
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32(seedBase + i * 97);
    const r = simulateCRPRun(alpha, n, rng);
    sumUnique += r.uniqueCount;
    sumSingleton += r.singletonCount;
  }
  return { avgUnique: sumUnique / trials, avgSingleton: sumSingleton / trials };
}

function calibrateAlpha(targetUnique: number, n: number, trials: number): number {
  let lo = 0.001;
  let hi = 10000;
  for (let iter = 0; iter < 40; iter++) {
    const mid = Math.sqrt(lo * hi);
    const { avgUnique } = averageCRP(mid, n, trials, 12345);
    if (avgUnique < targetUnique) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

const TARGET_SIZES = [75, 150, 300, 500, 1000] as const;
const CALIBRATION_TRIALS = 300;
const PROJECTION_TRIALS = 300;

export interface GrowthProjection {
  targetN: number;
  isObserved: boolean; // true only for N=75, where these numbers are the REAL measured values, not the model's projection
  expectedUniqueCount: number;
  expectedSingletonRate: number;
  expectedReentryRate: number;
  expectedAvgGroupSize: number;
}

export interface RepresentationGrowth {
  representation: "ExactShapeKey(BP-4)" | "CoarseShape(v3 Kickoff)";
  observedAt75: { uniqueCount: number; singletonRate: number; reentryRate: number };
  calibratedAlpha: number;
  projections: GrowthProjection[];
}

export interface DatasetGrowthReport {
  exact: RepresentationGrowth;
  coarse: RepresentationGrowth;
  clusterStabilityNote: string;
  lookupFeasibilityNote: string;
  methodologyNote: string;
}

function projectRepresentation(name: RepresentationGrowth["representation"], sObs: number, singletonObs: number, n: number): RepresentationGrowth {
  const alpha = calibrateAlpha(sObs, n, CALIBRATION_TRIALS);
  const projections: GrowthProjection[] = TARGET_SIZES.map((targetN) => {
    if (targetN === n) {
      return {
        targetN,
        isObserved: true,
        expectedUniqueCount: sObs,
        expectedSingletonRate: sObs ? singletonObs / sObs : 0,
        expectedReentryRate: n ? (n - singletonObs) / n : 0,
        expectedAvgGroupSize: sObs ? n / sObs : 0,
      };
    }
    const { avgUnique, avgSingleton } = averageCRP(alpha, targetN, PROJECTION_TRIALS, 54321 + targetN);
    return {
      targetN,
      isObserved: false,
      expectedUniqueCount: avgUnique,
      expectedSingletonRate: avgUnique ? avgSingleton / avgUnique : 0,
      expectedReentryRate: targetN ? (targetN - avgSingleton) / targetN : 0,
      expectedAvgGroupSize: avgUnique ? targetN / avgUnique : 0,
    };
  });

  return {
    representation: name,
    observedAt75: { uniqueCount: sObs, singletonRate: sObs ? singletonObs / sObs : 0, reentryRate: n ? (n - singletonObs) / n : 0 },
    calibratedAlpha: alpha,
    projections,
  };
}

export function estimateDatasetGrowth(failuresDbPath: string): DatasetGrowthReport {
  const all75 = loadAll75(failuresDbPath);
  const cubiesList = all75.map((s) => deserializeCube(s.cubeState));

  const exactHist = histogramOf(cubiesList, (c) => computeCycleShape(c).shapeKey);
  const coarseHist = histogramOf(cubiesList, (c) => computeCoarseShapeKey(c));
  const exactSingletons = exactHist.filter((h) => h.count === 1).length;
  const coarseSingletons = coarseHist.filter((h) => h.count === 1).length;

  const exact = projectRepresentation("ExactShapeKey(BP-4)", exactHist.length, exactSingletons, cubiesList.length);
  const coarse = projectRepresentation("CoarseShape(v3 Kickoff)", coarseHist.length, coarseSingletons, cubiesList.length);

  return {
    exact,
    coarse,
    clusterStabilityNote:
      "Cluster 안정성(Solver v3 Kickoff STEP0에서 실측 88.5%)은 Dataset 크기의 함수가 아니라, Primitive 내부의 Math.random() 기반 탐색 순서 randomness의 함수다 -- " +
      "표본을 늘려도 개별 replay의 run-to-run 분류 일관성 자체는 구조적으로 개선되지 않는다. 다만 표본이 많아지면 관측되는 평균값의 통계적 신뢰구간은 좁아진다. " +
      "따라서 이 지표는 이번 성장 추정에서 CRP 모델로 투영하지 않는다 (모델링 대상이 아님을 명시).",
    lookupFeasibilityNote:
      "BP-4류 Lookup 접근의 실현 가능성은 위 projections의 expectedAvgGroupSize/expectedReentryRate로 직접 읽는다 -- " +
      "leave-one-out이 의미 있으려면 평균 그룹 크기가 최소 2 이상(자기 자신을 제외하고도 훈련 증거가 남아야 함)이어야 한다.",
    methodologyNote:
      "Chinese Restaurant Process 시뮬레이션(seed 고정, 300회 평균) 기반 추정이며 실측이 아니다. N=75 행만 실측값이다. " +
      "모델은 향후 표본이 기존 75건과 동일한 생성 분포를 따른다고 가정한다 -- 이 가정이 깨지면(예: 다른 replay 소스) 추정이 빗나갈 수 있다.",
  };
}
