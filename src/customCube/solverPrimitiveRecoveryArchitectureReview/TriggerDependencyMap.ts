// --- TriggerDependencyMap (Recovery Architecture Review Sprint v1) ---------
// STEP1. Every path that can lead to Recovery being invoked, grounded in
// the real, read-only code facts (fiveByFiveEdgeExecutor.ts's own
// `recoveryEligible = allowRecovery && task.type === "ENDGAME"`) plus real
// measured statistics on the actual task sequence (via TaskTimeline.ts)
// across the dataset.
import type { SolveTimeline, TaskTypeName } from "./TaskTimeline";

export interface StructuralFact {
  fact: string;
  source: string;
}

export function structuralFacts(): StructuralFact[] {
  return [
    {
      fact: "Recovery는 오직 task.type === 'ENDGAME'일 때만 트리거될 수 있다 (recoveryEligible = allowRecovery && task.type === 'ENDGAME').",
      source: "fiveByFiveEdgeExecutor.ts executeTask()",
    },
    {
      fact: "ENDGAME 태스크는 planEdgeTasks()가 생성하는 태스크 배열에서 항상 마지막 순서다 (stillNeedsParity일 때 goals 배열 끝에 LAST_TWO(PARITY)+ENDGAME이 추가됨).",
      source: "fiveByFiveEdgePlanner.ts planEdgeTasks()",
    },
    {
      fact: "ENDGAME 이전에는 미완성 슬롯 수만큼(최대 12개)의 PAIR/FLIP 태스크와 1개의 PARITY 태스크가 먼저 실행된다.",
      source: "fiveByFiveEdgePlanner.ts buildCandidateStrategies()/planEdgeTasks()",
    },
    {
      fact: "PAIR/FLIP/PARITY 태스크는 allowRecovery 여부와 무관하게 Recovery를 절대 트리거하지 않는다 -- 코드 구조상 ENDGAME 하나의 태스크에만 Recovery 진입점이 존재한다.",
      source: "fiveByFiveEdgeExecutor.ts executeTask()",
    },
  ];
}

export interface TaskSequenceStats {
  n: number;
  avgTasksBeforeEndgame: number;
  avgTaskTypeCounts: Record<TaskTypeName, number>;
  endgameAlwaysLastRate: number; // sanity check -- should be ~100% given the structural fact above
}

export function computeTaskSequenceStats(timelines: readonly SolveTimeline[]): TaskSequenceStats {
  const n = timelines.length;
  const withSequence = timelines.filter((t) => t.taskSequence.length > 0);
  const typeCounts: Record<TaskTypeName, number> = { PAIR: 0, FLIP: 0, PARITY: 0, ENDGAME: 0 };
  let totalBeforeEndgame = 0;
  let endgameLastCount = 0;

  for (const t of withSequence) {
    for (const type of t.taskSequence) typeCounts[type]++;
    const endgameIdx = t.taskSequence.indexOf("ENDGAME");
    if (endgameIdx === t.taskSequence.length - 1) endgameLastCount++;
    if (endgameIdx >= 0) totalBeforeEndgame += endgameIdx;
  }

  const avgTaskTypeCounts = { ...typeCounts };
  if (withSequence.length) {
    (Object.keys(avgTaskTypeCounts) as TaskTypeName[]).forEach((k) => {
      avgTaskTypeCounts[k] = typeCounts[k] / withSequence.length;
    });
  }

  return {
    n,
    avgTasksBeforeEndgame: withSequence.length ? totalBeforeEndgame / withSequence.length : 0,
    avgTaskTypeCounts,
    endgameAlwaysLastRate: withSequence.length ? endgameLastCount / withSequence.length : 0,
  };
}
