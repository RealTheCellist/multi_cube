// --- RepresentationBlueprint (Solver Representation Blueprint Sprint v1)
// STEP5: selects the most promising candidate from STEP4's real
// measurements and writes an implementable Blueprint for the next
// Solver Representation Prototype Sprint. This is design output only --
// no Primitive, no Solver/Planner change, no product wiring.
import type { RepresentationComparisonReport } from "./RepresentationComparison";
import type { FeatureInventoryReport } from "./FeatureInventory";
import type { RepresentationFailureAnalysisReport } from "./RepresentationFailureAnalysis";

export interface BlueprintField {
  field: string;
  source: string;
  rationale: string;
}

export interface RepresentationBlueprintDoc {
  selected: boolean;
  representationName: string;
  measuredImprovement: string;
  fields: BlueprintField[];
  algorithm: string[];
  complexityNote: string;
  migrationSteps: string[];
  validationPlan: string[];
  openRisks: string[];
  decision: "A" | "B" | "C" | "D";
  decisionRationale: string;
}

function fieldsFor(name: string): BlueprintField[] {
  if (name === "Severity Tier Key") {
    return [
      { field: "tier", source: "floor(wrongWingCount5(cubies) / 5)", rationale: "STEP4 실측: 필드 수를 줄여 grain을 넓히는 것만으로 Coarse Shape 대비 그룹 크기 개선." },
      { field: "parity", source: "hasParity(cubies)", rationale: "GoalAnalyzer의 기존 parity 판정 재사용, 저비용 이산 변수 하나만 추가." },
    ];
  }
  if (name === "Graph Topology Signature") {
    return [
      { field: "cycleLengths", source: "buildStateGraph(cubies).cycles.map(c => c.length).sort()", rationale: "STEP2 Feature Inventory 실측: cycle 구조가 wrongWingCount/pairCount와 상대적으로 독립적." },
      { field: "swapEdgeCount/cycleEdgeCount/conflictEdgeCount (capped)", source: "buildStateGraph(cubies).edges 분류", rationale: "그래프 위상의 나머지 구성 요소, 3으로 capping해 조합 폭발 방지." },
      { field: "parity", source: "hasParity(cubies)", rationale: "동일 위상이라도 parity가 다르면 요구되는 Primitive가 다를 수 있음." },
    ];
  }
  return [
    { field: "fingerprint (9-bit)", source: "computeCapabilityFingerprintKey (기존, 미수정)", rationale: "정보가 있는 케이스(>=1개 능력 성공)에서는 기존 Fingerprint의 행동 기반 군집력을 그대로 유지." },
    { field: "structural sub-key (all-zero 케이스에 한해)", source: "Severity Tier Key 재사용", rationale: "STEP1/이전 Sprint 실측: \"000000000\" 그룹이 34.7%를 차지하는 퇴화를 구조적 정보로 세분화해 해소." },
  ];
}

function algorithmFor(name: string): string[] {
  if (name === "Severity Tier Key") {
    return ["1. wrongWingCount5(cubies)로 WrongWing 수 계산", "2. tier = floor(wrongWingCount / 5)", "3. parity = hasParity(cubies)", "4. key = `tier${tier}|par${parity}`"];
  }
  if (name === "Graph Topology Signature") {
    return [
      "1. buildStateGraph(cubies)로 WANTS-그래프 계산",
      "2. cycle 길이를 오름차순 정렬한 배열을 문자열화",
      "3. edge를 SWAP/CYCLE/CONFLICT로 분류해 개수를 세고 각각 3으로 capping",
      "4. parity를 마지막 필드로 추가",
      "5. key = `cyc[...]|swap{n}|cycE{n}|conf{n}|par{bool}`",
    ];
  }
  return [
    "1. 기존 6개 base 능력(BASE/FLIP/CASE/PARITY/RECOVERY/CYCLECHASE) + BP-1/BP-2/BP-3 재테스트로 9-bit fingerprint 계산 (기존 computeCapabilityFingerprintKey 재사용)",
    "2. fingerprint가 \"000000000\"이 아니면 그대로 key로 사용",
    "3. fingerprint가 \"000000000\"이면 Severity Tier Key를 계산해 `000000000|tier{n}|par{bool}` 형태로 대체",
  ];
}

export function buildRepresentationBlueprint(
  comparison: RepresentationComparisonReport,
  _featureInventory: FeatureInventoryReport,
  _failureAnalysis: RepresentationFailureAnalysisReport,
): RepresentationBlueprintDoc {
  const winner = comparison.bestCandidate;

  if (!winner) {
    return {
      selected: false,
      representationName: "Coarse Structural Shape (기존 유지)",
      measuredImprovement: "Coarse Shape의 평균 Group Size/Singleton 비율/Hard Gap 설명력을 모두 능가하는 후보를 찾지 못했다.",
      fields: [],
      algorithm: [],
      complexityNote: "해당 없음.",
      migrationSteps: [],
      validationPlan: [],
      openRisks: ["3개 후보 모두 Coarse Shape의 3개 지표를 동시에 능가하지 못함 -- Representation 축 자체보다 Dataset 규모의 영향이 더 클 가능성을 배제할 수 없음."],
      decision: "A",
      decisionRationale: "성공 기준 Level 2 미달(Coarse Shape보다 우수한 후보 0개) -- 작업지시서 실패 조건에 따라 Coarse Structural Shape를 기준으로 유지하고 Product Integration 여부를 재검토한다.",
    };
  }

  return {
    selected: true,
    representationName: winner.name,
    measuredImprovement: winner.verdict,
    fields: fieldsFor(winner.name),
    algorithm: algorithmFor(winner.name),
    complexityNote: "모든 하위 계산(buildStateGraph/wrongWingCount5/hasParity/computeCapabilityFingerprintKey)은 기존 함수를 그대로 재사용하는 O(1)~O(edge 수) 연산으로, 현재 Coarse Shape 계산 비용과 동일한 자릿수(BP-1/2/3 재테스트가 필요한 Rescue-Structural Hybrid만 예외적으로 재테스트 3회 추가 비용 발생).",
    migrationSteps: [
      "1. Solver Representation Prototype Sprint v1에서 이 key 계산 함수를 그대로 제품 후보 모듈로 승격 (연구 코드 재사용, 새로 작성 아님).",
      "2. 확장된(300건 이상) Dataset에서 재검증 -- 이번 Sprint의 150건 결과가 Dataset 규모 증가에도 유지되는지 확인.",
      "3. Lookup/Primitive 설계에 실제로 연결하는 것은 이 Blueprint의 범위 밖 -- Prototype Sprint에서 별도로 결정.",
    ],
    validationPlan: [
      "150건 재현성 확인: 동일 Dataset에서 key 계산 결과가 결정적(비-Math.random() 경로)인지 재확인.",
      "Hard Gap 설명력이 Dataset 확장 후에도 Coarse Shape 대비 우위를 유지하는지 재측정.",
      "Rescue-Structural Hybrid를 선택한 경우, BP-1/2/3 재테스트의 Math.random() 기반 run-to-run 변동성을 반영해 최소 3회 반복 측정.",
    ],
    openRisks: [
      "150건은 여전히 소규모 -- 이번 Sprint의 개선폭이 Dataset 특유의 표본 효과일 가능성 (Coarse Shape 자체도 75->150에서 Roadmap 예측보다 느리게 개선된 선례 있음).",
      "이 Blueprint는 아직 어떤 제품 Primitive/Lookup 전략과도 연결되지 않은 순수 Representation 설계 -- 실제 Primitive 설계 적합성은 다음 Sprint에서 별도 검증 필요.",
    ],
    decision: "B",
    decisionRationale: `성공 기준 Level 2 충족: Coarse Structural Shape보다 잠재적으로 우수한 후보("${winner.name}")를 1개 이상 제안함 (${winner.verdict}).`,
  };
}
