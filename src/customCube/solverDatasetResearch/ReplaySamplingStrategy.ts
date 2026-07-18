// --- ReplaySamplingStrategy (Solver Dataset Expansion Research Sprint v1)
// STEP4: compares 5 candidate sampling strategies for HOW future replays
// should be collected, grounded in STEP1(bias)/STEP2(diversity)/STEP3
// (growth) findings. Design/comparison only -- no replay generator is
// touched or implemented (그 자체가 이번 Sprint의 금지 사항).
export interface SamplingStrategyComparison {
  strategy: string;
  description: string;
  pros: string[];
  cons: string[];
  expectedEffect: string;
}

export const SAMPLING_STRATEGIES: SamplingStrategyComparison[] = [
  {
    strategy: "Random",
    description: "기존과 동일한 방식으로 무작위 스크램블/실패 상태를 추가 수집",
    pros: ["구현이 가장 단순 (기존 파이프라인 그대로 재사용)", "편향을 새로 주입하지 않음"],
    cons: [
      "DatasetBiasReport STEP1이 확인한 기존 편향(극단 WrongWing 구간/Hard Gap 저빈도 구간)이 그대로 재생산될 가능성이 높음",
      "DatasetGrowthEstimator STEP3의 CRP 모델 가정(향후 표본도 기존 75건과 동일 분포)과 가장 잘 맞는 전략이지만, 그만큼 새로운 정보 획득 속도가 느림",
    ],
    expectedEffect: "STEP3 projections(모델 자체가 이 가정 위에 서 있음)에 가장 가깝게 도달 -- 예측 가능하지만 최적은 아님",
  },
  {
    strategy: "Hard Gap 우선",
    description: "기존 6~9개 능력이 전부 실패하는(Hard Gap) 상태를 우선적으로 더 많이 수집",
    pros: [
      "Strategy Review Sprint v1의 Q1 결론(Hard Gap이 가장 근본적이고 미해결인 축)과 직접 정렬됨",
      "BP-1~5가 검증에 사용한 표본 자체를 두껍게 만들어 향후 Blueprint 재검증의 통계적 신뢰도를 높임",
    ],
    cons: [
      "Hard Gap이 아닌 일반 상태의 대표성이 상대적으로 더 희석됨 -- Cluster/Replay 축의 편향은 오히려 악화될 수 있음",
      "'Hard Gap'의 정의 자체가 randomness에 취약(Solver v3 Kickoff STEP0에서 실측 88.5% 안정성)하므로, 수집 기준 자체가 흔들릴 위험",
    ],
    expectedEffect: "Hard Gap 관련 연구(Primitive/Blueprint 재검증)에는 가장 효율적이나, Representation/Cluster 축 편향 해소에는 기여가 적음",
  },
  {
    strategy: "Failure 유형 균등",
    description: "WrongWing 구간별/Parity 여부별로 균등한 개수를 목표로 수집",
    pros: [
      "STEP1이 식별한 '극단 WrongWing 구간 대표성 부족'을 직접 해소",
      "향후 어떤 WrongWing 구간을 대상으로 한 연구든 표본 부족 문제를 겪지 않음",
    ],
    cons: ["Hard Gap 발생률이 구간별로 다르므로, 균등 수집이 Hard Gap 표본 확보에는 비효율적일 수 있음"],
    expectedEffect: "Replay 축의 균형은 가장 잘 잡히지만, Shape/Cluster 축 재등장률 개선에는 간접적으로만 기여",
  },
  {
    strategy: "Shape 균등",
    description: "이미 관측된 Shape(Coarse Shape 기준)별로 최소 2건 이상을 목표로 우선 수집",
    pros: [
      "DatasetGrowthEstimator STEP3가 Lookup 가능성의 핵심 조건으로 지목한 '평균 그룹 크기 2 이상'을 가장 직접적으로 겨냥",
      "BP-4류 Lookup 접근을 재검증하려는 목적이라면 가장 효율적인 전략",
    ],
    cons: [
      "이미 관측되지 않은 Shape(새로운 카테고리)는 이 전략만으로는 절대 발견되지 않음 -- CRP 모델이 가정하는 'unseen shape 발생'을 이 전략은 오히려 억제함",
      "Coarse Shape 자체가 아직 '올바른 grain'인지 확정되지 않은 상태에서 그 기준으로 수집을 최적화하는 것은 순환 논리의 위험이 있음",
    ],
    expectedEffect: "Lookup 연구에는 최적이지만 새로운 Shape 발견(Representation 연구의 다른 축)에는 오히려 역행",
  },
  {
    strategy: "Hybrid",
    description: "위 4개 전략을 일정 비율로 혼합 (예: Hard Gap 우선 40% + Shape 균등 30% + Failure 유형 균등 20% + Random 10%)",
    pros: [
      "단일 전략의 맹점(Random의 편향 재생산, Hard Gap 우선의 대표성 희석, Shape 균등의 신규 카테고리 억제)을 서로 보완",
      "STEP6 Roadmap의 '우선 확보 대상'을 단계적으로 반영하기 용이 (비율을 Sprint별로 조정 가능)",
    ],
    cons: ["설계/운영이 가장 복잡함 -- 각 하위 전략의 비율을 어떻게 정할지 자체가 별도의 판단을 요구", "단일 지표로 효과를 측정하기 어려움 (여러 지표를 동시에 추적해야 함)"],
    expectedEffect: "장기적으로 가장 균형 잡힌 개선을 기대할 수 있으나, 단기간에 어느 한 지표를 극적으로 개선하지는 못함",
  },
];
