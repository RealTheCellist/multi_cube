// --- RecoveryNecessityAnalysis (Recovery Architecture Review Sprint v1) ----
// STEP3. Does Recovery genuinely need to be the LAST-task-only mechanism it
// is today? Measures the real "no progress" (task-N-skip) rate PER TASK
// TYPE across the dataset -- if PAIR/FLIP/PARITY tasks also frequently make
// zero progress (not just the final ENDGAME task), that's real evidence an
// earlier/incremental Recovery-style rescue could have genuine value,
// rather than Recovery remaining a purely-ENDGAME-only mechanism.
import type { SolveTimeline, TaskTypeName } from "./TaskTimeline";

export interface PerTypeProgressStats {
  type: TaskTypeName;
  attemptedCount: number;
  noProgressCount: number;
  noProgressRate: number;
}

export function analyzeProgressByTaskType(timelines: readonly SolveTimeline[]): PerTypeProgressStats[] {
  const types: TaskTypeName[] = ["PAIR", "FLIP", "PARITY", "ENDGAME"];
  return types.map((type) => {
    let attemptedCount = 0;
    let noProgressCount = 0;
    for (const t of timelines) {
      for (const a of t.attempts) {
        if (a.type !== type) continue;
        attemptedCount++;
        if (!a.progressed) noProgressCount++;
      }
    }
    return { type, attemptedCount, noProgressCount, noProgressRate: attemptedCount ? noProgressCount / attemptedCount : 0 };
  });
}

export interface RecoveryNecessityFinding {
  finding: string;
}

export function assessRecoveryNecessity(stats: readonly PerTypeProgressStats[]): RecoveryNecessityFinding {
  const nonEndgame = stats.filter((s) => s.type !== "ENDGAME" && s.attemptedCount > 0);
  const endgame = stats.find((s) => s.type === "ENDGAME");
  const avgNonEndgameNoProgressRate = nonEndgame.length ? nonEndgame.reduce((a, s) => a + s.noProgressRate, 0) / nonEndgame.length : 0;

  const meaningfullyFrequent = avgNonEndgameNoProgressRate > 0.1;
  return {
    finding: meaningfullyFrequent
      ? `PAIR/FLIP/PARITY 태스크들도 평균 ${(avgNonEndgameNoProgressRate * 100).toFixed(1)}%의 no-progress율을 보인다(ENDGAME 자체는 ${((endgame?.noProgressRate ?? 0) * 100).toFixed(1)}%) -- Recovery가 "ENDGAME에서만 마지막에" 개입하는 현재 설계는 이 no-progress 발생 지점들을 전부 놓치고 있다. Incremental/Opportunistic Recovery가 이론적으로 다룰 수 있는 실질적 모집단이 존재한다.`
      : `PAIR/FLIP/PARITY 태스크들의 no-progress율은 평균 ${(avgNonEndgameNoProgressRate * 100).toFixed(1)}%로 낮다(ENDGAME 자체는 ${((endgame?.noProgressRate ?? 0) * 100).toFixed(1)}%) -- 대부분의 no-progress는 이미 ENDGAME 자체에 집중되어 있으므로, Recovery를 ENDGAME 이전 태스크들에도 확장하는 것의 실익은 제한적일 수 있다.`,
  };
}
