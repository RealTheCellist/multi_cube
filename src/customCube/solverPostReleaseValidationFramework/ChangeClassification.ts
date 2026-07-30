// --- ChangeClassification (Solver Post-Release Validation Framework
// Sprint v1, STEP6; tiered minN added by Solver Validation Framework
// Qualification Refinement Sprint v1) ---------------------------------------
// Standardizes how much Validation a future change needs BEFORE the work
// starts, so a Bug Fix doesn't get saddled with a full N>=30 Release-scale
// re-run and a new Primitive doesn't get waved through on N=5. Thresholds
// are this Framework's own disclosed defaults, calibrated against what
// this arc's own Sprints actually used at each scale of change.
//
// Qualification Sprint v1's own Historical Replay found 3 False FAILs, all
// from the SAME root cause: a single minN applied uniformly regardless of
// how far along a change's own validation lifecycle it was. This arc's own
// real practice repeatedly used a two-stage workflow -- a smaller-N
// "prototype" validation (e.g. Scheduler Prototype Sprint v1's own N=15,
// Mixed Commutator Validation v1/v2's own N=10), later re-confirmed by a
// larger-N "production" validation (e.g. Scheduler Production Integration
// Sprint v1's own N=30) -- that the original single-minN model didn't
// recognize. `minNByStage` codifies both tiers; the pre-existing `minN`
// field is kept UNCHANGED (still the production-tier value) so every
// caller written against the original v1 API (e.g. Solver Validation
// Framework Qualification Sprint v1's own DecisionReplay.ts) keeps
// compiling and reproduces the exact same result it originally did.
import type { GateId } from "./ReleaseGates";

export type ChangeCategory = "A" | "B" | "C" | "D";
export type ValidationStage = "prototype" | "production";

export interface ChangeCategorySpec {
  category: ChangeCategory;
  name: string;
  description: string;
  requiredGates: GateId[];
  minN: number; // unchanged since v1 -- always equal to minNByStage.production
  minNByStage: Record<ValidationStage, number>;
  populationScope: string;
  requiresFullContractAudit: boolean;
}

export const CHANGE_CATEGORIES: ChangeCategorySpec[] = [
  {
    category: "A",
    name: "Bug Fix",
    description: "기존 동작의 결함을 고치는 변경 -- 새 Primitive/Contract 없음.",
    requiredGates: ["A", "C"],
    minN: 15,
    minNByStage: { prototype: 10, production: 15 },
    populationScope: "변경이 영향을 주는 케이스 부분집합(전체 Hole Dataset 불필요)",
    requiresFullContractAudit: false,
  },
  {
    category: "B",
    name: "Performance Optimization",
    description: "Runtime/Budget 조정 -- 알고리즘 결과 자체는 불변.",
    requiredGates: ["A", "B", "C"],
    minN: 30,
    minNByStage: { prototype: 10, production: 30 },
    populationScope: "전체 Hole Dataset(142케이스)",
    requiresFullContractAudit: false,
  },
  {
    category: "C",
    name: "New Primitive",
    description: "새로운 Recovery/Solving Primitive 추가.",
    requiredGates: ["A", "B", "C", "E"],
    minN: 30,
    minNByStage: { prototype: 10, production: 30 },
    populationScope: "전체 Hole Dataset + 해당 Primitive의 Target Cluster",
    requiresFullContractAudit: false,
  },
  {
    category: "D",
    name: "Architecture Change",
    description: "Scheduler Ordering, Budget Contract, Planner/Executor 경계 등 구조적 변경.",
    requiredGates: ["A", "B", "C", "D", "E"],
    minN: 30,
    minNByStage: { prototype: 15, production: 30 },
    populationScope: "전체 Hole Dataset + 실 solve() E2E",
    requiresFullContractAudit: true,
  },
];

export function getCategorySpec(category: ChangeCategory): ChangeCategorySpec {
  const spec = CHANGE_CATEGORIES.find((c) => c.category === category);
  if (!spec) throw new Error(`Unknown change category: ${category}`);
  return spec;
}

// New in the Refinement Sprint: the tiered lookup. Prototype-stage
// thresholds were chosen as the exact minimum that clears every actual
// historical N this arc used at that stage (Scheduler Prototype Sprint
// v1's N=15 for Category D; Mixed Commutator Validation v1/v2's N=10 for
// Category C) -- not an arbitrary round number.
export function getMinNForStage(category: ChangeCategory, stage: ValidationStage): number {
  return getCategorySpec(category).minNByStage[stage];
}
