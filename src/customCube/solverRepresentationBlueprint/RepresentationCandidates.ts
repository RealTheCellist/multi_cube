// --- RepresentationCandidates (Solver Representation Blueprint Sprint v1)
// STEP3: designs >=3 new candidate State Representations. This Sprint does
// NOT build a new Primitive or wire anything into product code -- these
// are RESEARCH-ONLY key-computation functions that exist solely so
// STEP4 can measure (not guess at) each candidate's explanatory power on
// the real 150-replay Dataset, exactly the same "design a key fn, then
// measure it for real" pattern solverV3Research/StateRepresentationCandidates.ts
// itself already used for Coarse Shape and Capability Fingerprint.
//
// Each candidate is grounded in a real STEP1/STEP2 finding, not intuition:
//
//   1. Severity Tier Key -- STEP1 showed all 3 existing Representations
//      still leave a large share of Hard Gaps unexplained because even
//      "Coarse" Shape concatenates 7 separate fields, so distinct
//      combinations still fragment the group space combinatorially. This
//      candidate goes deliberately coarser than Coarse Shape: only 2
//      dimensions (a wide WrongWing severity tier + parity), testing
//      whether grain itself -- independent of which fields are used -- is
//      the dominant lever.
//   2. Graph Topology Signature -- STEP2's Feature Inventory is used to
//      check whether cycle-structure features are meaningfully
//      independent from wrongWingCount/pairCount; if so, a
//      Representation built PURELY from graph topology (cycle-length
//      multiset + edge-type counts + parity, deliberately DROPPING exact
//      wrongWing/pair counts entirely, unlike both Exact Shape Key and
//      Coarse Shape which always include them) tests whether topology
//      alone is a better clustering axis than severity.
//   3. Rescue-Structural Hybrid -- STEP1's own numbers (reused from
//      Representation Revalidation Sprint v1) showed Capability
//      Fingerprint's "000000000" bucket still collapsing 34.7% of the
//      dataset into one meaningless group. This candidate keeps
//      Fingerprint's genuinely-informative behavioral bits for every
//      replay where at least one capability succeeds, but SUBDIVIDES the
//      all-failure bucket by a coarse structural sub-key instead of
//      collapsing it -- directly targeting the diagnosed degeneracy
//      without discarding Fingerprint's otherwise-reasonable clustering.
import type { Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import type { ReplayGapProfile } from "../solverV2Research/GapDetector";

export interface CandidateDesign {
  name: string;
  targetWeakness: string;
  hypothesis: string;
  designNote: string;
  // Disclosed integrity flag (see RepresentationComparison.ts/
  // RepresentationBlueprint.ts): true only for a candidate built ENTIRELY
  // from the same fields GapDetector.ts's own pre-existing clusterKey
  // (`w{wrongWingCount}|p{parity}`, already used throughout this project
  // -- DatasetBiasReport's Cluster dimension, ClusterStabilityReview's
  // 88.5%/88.4%) already covers. Such a candidate's grouping "improvement"
  // over Coarse Shape can come purely from widening that bucket, which is
  // unbounded and adds no new information -- not a genuine new
  // Representation axis. See STEP4/STEP5 disclosure.
  usesOnlyExistingClusterAxis: boolean;
}

const SEVERITY_TIER_WIDTH = 5;

export function computeSeverityTierKey(cubies: Cubie[]): string {
  const wrongWingCount = wrongWingCount5(cubies);
  const tier = Math.floor(wrongWingCount / SEVERITY_TIER_WIDTH);
  const parity = hasParity(cubies);
  return `tier${tier}|par${parity}`;
}

function capAt(n: number, cap: number): number {
  return Math.min(n, cap);
}

export function computeGraphTopologyKey(cubies: Cubie[]): string {
  const graph = buildStateGraph(cubies);
  const cycleLengths = graph.cycles.map((c) => c.length).sort((a, b) => a - b);
  let swapEdgeCount = 0;
  let cycleEdgeCount = 0;
  let conflictEdgeCount = 0;
  for (const e of graph.edges) {
    if (e.type === "SWAP") swapEdgeCount++;
    else if (e.type === "CYCLE") cycleEdgeCount++;
    else conflictEdgeCount++;
  }
  const parity = hasParity(cubies);

  // Deliberately excludes wrongWingCount/pairCount -- pure topology.
  return [`cyc[${cycleLengths.join(",")}]`, `swap${capAt(swapEdgeCount, 3)}`, `cycE${capAt(cycleEdgeCount, 3)}`, `conf${capAt(conflictEdgeCount, 3)}`, `par${parity}`].join("|");
}

const ALL_ZERO_FINGERPRINT = "000000000";

export function computeRescueStructuralHybridKey(cubies: Cubie[], profile: ReplayGapProfile | undefined, bp1: boolean, bp2: boolean, bp3: boolean): string {
  const bit = (b: boolean) => (b ? "1" : "0");
  const s = profile?.succeeded;
  const fingerprint = [bit(!!s?.BASE), bit(!!s?.FLIP), bit(!!s?.CASE), bit(!!s?.PARITY), bit(!!s?.RECOVERY), bit(!!s?.CYCLECHASE), bit(bp1), bit(bp2), bit(bp3)].join("");

  if (fingerprint !== ALL_ZERO_FINGERPRINT) return fingerprint;

  // Everything failed -- instead of collapsing into one degenerate group,
  // subdivide by a coarse structural sub-key (reuses Severity Tier Key's
  // own tiering, one level coarser still since this subset is already the
  // hardest of the hard).
  return `${ALL_ZERO_FINGERPRINT}|${computeSeverityTierKey(cubies)}`;
}

export const CANDIDATE_DESIGNS: CandidateDesign[] = [
  {
    name: "Severity Tier Key",
    targetWeakness: "Exact/Coarse Shape 둘 다 필드 수(7개/7개)가 많아 조합 폭발로 그룹이 계속 쪼개짐 (STEP1: Coarse Shape도 Hard Gap 상당수를 설명하지 못함).",
    hypothesis: "필드 종류보다 grain의 '폭' 자체가 지배적 변수라면, 단 2개 필드(WrongWing severity tier + parity)만으로도 Coarse Shape보다 더 큰 그룹을 만들 수 있다.",
    designNote: "tier = floor(wrongWingCount / 5), key = `tier{n}|par{bool}`. 필드 수를 Coarse Shape(7개)의 1/3 이하로 줄인 가장 단순한 대조군.",
    usesOnlyExistingClusterAxis: true,
  },
  {
    name: "Graph Topology Signature",
    targetWeakness: "Exact/Coarse Shape 둘 다 매번 정확한(또는 버킷된) wrongWingCount/pairCount를 포함해, 구조적으로는 동일한 상태도 심각도가 다르면 다른 그룹으로 갈라짐.",
    hypothesis: "STEP2 Feature Inventory에서 cycle/edge 구조 Feature가 wrongWingCount/pairCount와 상대적으로 독립적으로 나타난다면, 심각도를 아예 제외하고 순수 그래프 위상만으로 묶는 편이 Hard Gap을 더 잘 군집화할 수 있다.",
    designNote: "key = 정렬된 cycle 길이 multiset + capped(swap/cycle/conflict) edge 수 + parity. wrongWingCount/pairCount 완전 배제.",
    usesOnlyExistingClusterAxis: false,
  },
  {
    name: "Rescue-Structural Hybrid",
    targetWeakness: "Capability Fingerprint의 \"000000000\" 퇴화 그룹이 150건에서도 전체의 34.7%(52건)를 차지 (Representation Revalidation Sprint v1 STEP3 실측).",
    hypothesis: "능력 비트가 정보를 담고 있는 케이스(>=1개 성공)는 그대로 두고, 정보가 없는 케이스(전부 실패)만 구조적 하위 키로 세분화하면 Fingerprint의 장점(행동 기반 군집)은 유지하면서 퇴화 문제만 해소할 수 있다.",
    designNote: "9-bit fingerprint가 \"000000000\"이 아니면 그대로 사용, \"000000000\"이면 `000000000|tier{n}|par{bool}`(Severity Tier Key 재사용)로 대체.",
    usesOnlyExistingClusterAxis: false,
  },
];
