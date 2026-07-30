// --- ChangeClassification (Solver Post-Release Validation Framework
// Sprint v1, STEP6) --------------------------------------------------------
// Standardizes how much Validation a future change needs BEFORE the work
// starts, so a Bug Fix doesn't get saddled with a full N>=30 Release-scale
// re-run and a new Primitive doesn't get waved through on N=5. Thresholds
// are this Framework's own disclosed defaults, calibrated against what
// this arc's own Sprints actually used at each scale of change.
import type { GateId } from "./ReleaseGates";

export type ChangeCategory = "A" | "B" | "C" | "D";

export interface ChangeCategorySpec {
  category: ChangeCategory;
  name: string;
  description: string;
  requiredGates: GateId[];
  minN: number;
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
    populationScope: "변경이 영향을 주는 케이스 부분집합(전체 Hole Dataset 불필요)",
    requiresFullContractAudit: false,
  },
  {
    category: "B",
    name: "Performance Optimization",
    description: "Runtime/Budget 조정 -- 알고리즘 결과 자체는 불변.",
    requiredGates: ["A", "B", "C"],
    minN: 30,
    populationScope: "전체 Hole Dataset(142케이스)",
    requiresFullContractAudit: false,
  },
  {
    category: "C",
    name: "New Primitive",
    description: "새로운 Recovery/Solving Primitive 추가.",
    requiredGates: ["A", "B", "C", "E"],
    minN: 30,
    populationScope: "전체 Hole Dataset + 해당 Primitive의 Target Cluster",
    requiresFullContractAudit: false,
  },
  {
    category: "D",
    name: "Architecture Change",
    description: "Scheduler Ordering, Budget Contract, Planner/Executor 경계 등 구조적 변경.",
    requiredGates: ["A", "B", "C", "D", "E"],
    minN: 30,
    populationScope: "전체 Hole Dataset + 실 solve() E2E",
    requiresFullContractAudit: true,
  },
];

export function getCategorySpec(category: ChangeCategory): ChangeCategorySpec {
  const spec = CHANGE_CATEGORIES.find((c) => c.category === category);
  if (!spec) throw new Error(`Unknown change category: ${category}`);
  return spec;
}
