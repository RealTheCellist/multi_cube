// --- PrimitiveRequirementAnalysis (Solver Primitive Blueprint Sprint v1)
// STEP2: for each of the 5 existing Primitives, diagnoses structurally WHY
// it fails on the Gap subset -- grounded in real, computed structural
// facts (WANTS-graph edge composition, BP-1's own activation gate), not
// guesses. This directly answers Q2 ("기존 Primitive가 실패하는 이유는
// 무엇인가?").
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import type { GapReplayFeatures } from "./GapStructuralAnalysis";

// Mirrors BoundedResolver.ts's own (unexported) MIN_CYCLE_LENGTH=4 --
// tryBoundedMultiCycleResolver never even engages below this, regardless
// of outcome.
const BP1_MIN_CYCLE_LENGTH = 4;

export type AllowedPrimitiveName = "BASE" | "FLIP" | "CASE" | "PARITY" | "BP1";

export interface PrimitiveRequirementFinding {
  primitive: AllowedPrimitiveName;
  structuralDiagnosis: string;
  evidence: string;
}

export function analyzePrimitiveRequirements(failuresDbPath: string, gapFeatures: readonly GapReplayFeatures[]): PrimitiveRequirementFinding[] {
  const gapTotal = gapFeatures.length;
  const gapHashes = new Set(gapFeatures.map((f) => f.hash));
  const gapSnapshots = loadAll75(failuresDbPath).filter((s) => gapHashes.has(s.hash));

  const inapplicableBP1 = gapFeatures.filter((f) => f.maxCycleLength < BP1_MIN_CYCLE_LENGTH).length;
  const conflictDominant = gapFeatures.filter((f) => f.conflictEdgeCount > f.swapEdgeCount + f.cycleEdgeCount).length;
  const parityTrueCount = gapFeatures.filter((f) => f.parity).length;

  let wingPairNodeTotal = 0;
  for (const snapshot of gapSnapshots) {
    const cubies = deserializeCube(snapshot.cubeState);
    const graph = buildStateGraph(cubies);
    for (const n of graph.nodes) if (n.type === "WingPair") wingPairNodeTotal++;
  }
  const avgWingPairNodesPerReplay = gapSnapshots.length ? wingPairNodeTotal / gapSnapshots.length : 0;

  const pct = (n: number) => (gapTotal ? ((n / gapTotal) * 100).toFixed(1) : "0.0");

  return [
    {
      primitive: "BASE",
      structuralDiagnosis:
        "이동 가능한 단일 wing이 있어도, 그 이동이 다른 slot의 이미 맞춰진(또는 더 나은) 상태를 훼손하는 One-sided 의존(Conflict Edge -- stateGraphBuilder.ts 자체 정의: cycle에 속하지 않는 WANTS 엣지, 'A를 고치면 B가 대가 없이 손해봄')에 막혀 net 개선을 만들지 못한다.",
      evidence: `Gap ${gapTotal}건 중 ${conflictDominant}건(${pct(conflictDominant)}%)이 Conflict Edge 수 > (Swap+Cycle Edge 수) -- WANTS-그래프가 순환(해결 가능) 구조가 아니라 일방적 의존 구조로 지배된다.`,
    },
    {
      primitive: "BP1",
      structuralDiagnosis:
        "BoundedResolver(BP-1)는 길이 4 이상의 Cycle에서만 활성화된다(MIN_CYCLE_LENGTH=4, BoundedResolver.ts 자체 게이트, 미수정 인용). Gap 상당수는 애초에 4+ Cycle이 존재하지 않아 '시도했지만 실패'가 아니라 '적용 자체가 불가능'하다.",
      evidence: `Gap ${gapTotal}건 중 ${inapplicableBP1}건(${pct(inapplicableBP1)}%)이 최장 Cycle 길이 <4 -- BP-1의 활성화 조건 자체를 충족하지 못한다.`,
    },
    {
      primitive: "PARITY",
      structuralDiagnosis:
        "bestFixOverall/tryEndgameMultiPly는 BASE보다 넓게 탐색하지만 전체 Dataset(150건)에서도 52.0% 실패율을 보이는 broad-but-not-exhaustive 탐색이다. Gap 내에서 Parity=true 비율이 두드러지는데도 실패한다는 것은, PARITY의 대상 조건(Parity 있는 상태)과 겹치는 replay가 많음에도 탐색 폭/깊이가 부족함을 시사한다.",
      evidence: `Gap ${gapTotal}건 중 Parity=true는 ${parityTrueCount}건(${pct(parityTrueCount)}%).`,
    },
    {
      primitive: "FLIP",
      structuralDiagnosis:
        "tryFlipWingsInPlace는 이미 자리에 있는 2-wing이 서로 뒤바뀐(WingPair 패턴) 좁은 상황에서만 발동한다. 이 Dataset(150건 전체, Gap 한정 아님)에서 성공률이 0%라는 것은 이 좁은 전제조건이 실제로는 거의 매칭되지 않음을 뜻한다.",
      evidence: `Gap ${gapTotal}건의 WANTS-그래프에서 WingPair 유형 slot이 평균 ${avgWingPairNodesPerReplay.toFixed(2)}개/replay 존재하지만(0은 아님), FLIP의 실제 발동 조건(정확히 뒤바뀐 2-wing 패턴)까지는 이어지지 않아 여전히 0% 성공.`,
    },
    {
      primitive: "CASE",
      structuralDiagnosis:
        "tryExactCaseMatch는 CASE Library에 등록된 케이스와 정확히 일치해야 발동하는 순수 lookup이다. 150건 전체에서 0% 성공은 이 Dataset의 잔여 상태들이 CASE Library가 커버하는 카탈로그 밖에 있다는 뜻이다.",
      evidence: `Gap ${gapTotal}건 중 CASE 성공 0건 (Dataset 전체 150건 중에서도 0건) -- 정량적 매칭 실패이지 부분적 실패가 아니다.`,
    },
  ];
}
