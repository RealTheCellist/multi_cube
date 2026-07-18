// --- PrimitiveBlueprint (Solver v2 Research Kickoff Sprint v1) -------------
// Deliverable 4: converts CapabilityRequirement statements into structured
// DESIGN DRAFTS -- Input / Expected Effect / Forbidden Effect / Activation
// Condition, per spec's own example shape. No implementation, no move
// sequences, no code -- this Sprint is design-and-feasibility only (spec
// section "목표": "이번 Sprint에서는 새 Primitive를 구현하지 않는다").
// Each blueprint is checked against the spec's own failure condition
// ("Blueprint가 기존 Primitive와 실질적으로 동일함") by stating explicitly
// what EXISTING capability it differs from and how.
import type { CapabilityRequirementStatement } from "./CapabilityRequirement";

export interface PrimitiveBlueprintDraft {
  id: string;
  name: string;
  derivedFromRequirement: string;
  input: string;
  expectedEffect: string;
  forbiddenEffect: string;
  activationCondition: string;
  differsFromExisting: string; // explicit distinction from BASE/FLIP/CASE/PARITY/RECOVERY/CycleChase
}

export function generateBlueprints(requirements: readonly CapabilityRequirementStatement[]): PrimitiveBlueprintDraft[] {
  const blueprints: PrimitiveBlueprintDraft[] = [];
  const byId = new Map(requirements.map((r) => [r.id, r]));

  if (byId.has("REQ-4-MULTICYCLE")) {
    const req = byId.get("REQ-4-MULTICYCLE")!;
    blueprints.push({
      id: "BP-1-BOUNDED-MULTICYCLE",
      name: "Bounded Multi-Cycle Resolver",
      derivedFromRequirement: req.id,
      input: `현재 Cube 상태 + buildStateGraph()가 탐지한 길이 ${req.targetCycleLengthMin}~6의 WANTS-Cycle 하나`,
      expectedEffect: "탐지된 Cycle 전체를 하나의 결정적 연산으로 해소 -- Cycle 길이만큼 WrongWing이 한 번에 감소함 (tryFixWing()처럼 매 단계마다 즉시 개선을 요구하지 않음)",
      forbiddenEffect: "Cycle에 포함되지 않은 슬롯의 Pair를 깨뜨리는 것; 최종 결과가 시작 시점보다 WrongWing이 같거나 늘어나는 것",
      activationCondition: "buildStateGraph()의 cycles 중 길이 4 이상인 것이 존재하고, CycleChase가 이미 실패한 상태 (PAIR_CONFLICT)",
      differsFromExisting:
        "BASE(tryFixWing)는 한 번에 최대 3-leg(2-swap 또는 진짜 3-cycle)까지만 처리하고, 매 leg마다 즉시 순 개선을 요구한다. CycleChase는 tryFixWing을 반복 호출할 뿐 이 계약을 바꾸지 않는다. 이 Blueprint는 Cycle 전체를 애초에 하나의 계약(끝에서만 검증)으로 처리하자는 것으로, 기존 어느 것도 이렇게 하지 않는다.",
    });
  }

  if (byId.has("REQ-2-PARITY")) {
    const req = byId.get("REQ-2-PARITY")!;
    blueprints.push({
      id: "BP-2-PARITY-CYCLE",
      name: "Parity-Aware Cycle Breaker",
      derivedFromRequirement: req.id,
      input: "Parity=true인 상태 + 인접한 WANTS-Cycle 구조",
      expectedEffect: "PARITY_ALG를 트리거로 사용하되, Cycle 구조에 맞춰 setup을 다르게 선택해 Parity 해소와 동시에 인접 Cycle의 한 링크도 함께 줄임",
      forbiddenEffect: "WrongWing이 일시적으로 늘어나는 것은 최대 +1까지만 허용 (그 이상은 금지); 기존 PARITY_ALG의 대상 슬롯이 아닌 Pair를 건드리는 것",
      activationCondition: "Parity=true AND WrongWing이 Hard Gap 범위 내 AND 기존 6개 능력 전부 실패",
      differsFromExisting:
        "기존 PARITY_ALG는 고정된 단일 시퀀스를 whole-cube 회전으로만 conjugate한다 (Capability Expansion Sprint v2가 이미 확인). 이 Blueprint는 setup을 '현재 감지된 Cycle 구조'에서 직접 유도한다는 점이 다르다 -- CycleChase도 PARITY를 그대로 재사용할 뿐 setup을 Cycle에 맞춰 바꾸지 않는다.",
    });
  }

  if (byId.has("REQ-3-NONPARITY")) {
    const req = byId.get("REQ-3-NONPARITY")!;
    blueprints.push({
      id: "BP-3-NONPARITY-STRUCTURAL",
      name: "Non-Parity Structural Fix",
      derivedFromRequirement: req.id,
      input: "Parity=false이면서 기존 6개 능력이 전부 실패하는 상태",
      expectedEffect: "Parity 보정 없이 순수 WANTS-Cycle/Conflict 구조만으로 WrongWing을 감소시킴",
      forbiddenEffect: "Parity가 없던 상태에 Parity를 새로 만들어내는 것 (PARITY_ALG를 오용하는 결과와 동일해짐)",
      activationCondition: "Parity=false AND Hard Gap (6개 능력 전부 실패)",
      differsFromExisting:
        "기존 4개 실전 Primitive 중 Parity 없는 상태를 전담하는 것은 BASE뿐이며, BASE는 이미 이 상태들에서 실패가 확인됐다. CASE/PARITY는 Parity가 있는 상태를 전제로 설계됐다. 이 Blueprint는 Parity 유무와 무관하게 순수 Cycle 구조만 다루는 별도 경로라는 점이 다르다.",
    });
  }

  // Always included regardless of which REQ-* fired -- a direct, disclosed
  // response to Solver Contract Analysis Sprint v1's own decisive Cost
  // Estimation finding (depth-2 exhaustive lookahead costs ~1.46s, 12x the
  // 120ms task budget): if multi-step lookahead is what's needed, doing it
  // OFFLINE (precomputed, like a small pattern table) rather than at
  // runtime is the only way to keep it within budget.
  blueprints.push({
    id: "BP-4-PRECOMPUTED-LOOKUP",
    name: "Precomputed Cycle-Shape Lookup",
    derivedFromRequirement: "REQ-1-GENERAL (Contract Analysis Sprint v1의 Cost Estimation 결과에 대한 직접 대응)",
    input: "탐지된 WANTS-Cycle의 정규화된 '모양'(참여 슬롯들의 상대적 배치, 실제 색상과 무관)",
    expectedEffect: "런타임에 새로 탐색하지 않고, 미리 계산해 둔 짧은(2-3수) 해결 시퀀스를 표로 조회 -- 조회 자체는 O(1)에 가까워 실제 Solver 예산(120ms/task) 안에 들어옴",
    forbiddenEffect: "런타임에 10ms를 초과하는 탐색을 수행하는 것 (그 순간 Contract Analysis Sprint v1이 측정한 것과 같은 비용 폭증 문제로 되돌아감)",
    activationCondition: "탐지된 Cycle 모양이 사전 계산된 표의 항목과 일치할 때만 (모든 Cycle 모양을 다루지 못할 수 있음 -- 이는 Coverage의 한계로 정직하게 남는다)",
    differsFromExisting:
      "기존 모든 Primitive(BASE/FLIP/CASE/PARITY/RECOVERY/CycleChase)는 런타임에 실시간으로 탐색한다. 이 Blueprint는 탐색을 오프라인으로 옮겨 Contract Analysis Sprint v1이 실측으로 증명한 '계약 완화의 비용 문제' 자체를 우회하려는 시도라는 점이 근본적으로 다르다.",
  });

  return blueprints;
}
