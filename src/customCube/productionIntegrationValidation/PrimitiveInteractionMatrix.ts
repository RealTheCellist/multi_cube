// --- PrimitiveInteractionMatrix (Production Integration Validation Sprint
// v1) -------------------------------------------------------------------
// Generalizes the prior Production Integration Finalization Sprint's
// narrower pairwise interactions (CCR<->REPAIR, ENDGAME<->Recovery only)
// into an explicit NxN matrix across all 8 primitives (4 Task-layer:
// PAIR/FLIP/PARITY/ENDGAME, 4 Recovery-layer: DISRUPT/SETUP/REPAIR/CCR),
// reusing the same real, unmodified EndToEndSolveResult population and its
// existing plannedTaskTypes/recoveryOutcome fields -- no new
// instrumentation added to Recovery Logic (forbidden this Sprint).
import type { EndToEndSolveResult } from "../productionIntegrationFinalization/EndToEndSolveProbe";
import type { SolveTaskType, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export type PrimitiveName = SolveTaskType | RecoveryType;
export const ALL_PRIMITIVES: PrimitiveName[] = ["PAIR", "FLIP", "PARITY", "ENDGAME", "DISRUPT", "SETUP", "REPAIR", "CCR"];

// "Present" for a Task type means it appears in plannedTaskTypes; for a
// Recovery type it means it appears in recoveryOutcome.candidatesOffered
// (the only place Recovery-layer visibility exists in a real solve() call
// -- MAX_RECOVERY_RETRIES=1, so at most one recovery event per call).
function presentSet(r: EndToEndSolveResult): Set<PrimitiveName> {
  const s = new Set<PrimitiveName>(r.plannedTaskTypes);
  if (r.recoveryOutcome) for (const c of r.recoveryOutcome.candidatesOffered) s.add(c);
  return s;
}

export interface CoOccurrenceCell {
  row: PrimitiveName;
  col: PrimitiveName;
  coOccurrenceCount: number; // both present in the same solve() call
}

export interface ChosenWhenBothOfferedCell {
  a: RecoveryType;
  b: RecoveryType;
  bothOfferedCount: number;
  aWon: number;
  bWon: number;
  neitherWon: number; // a third recovery type won instead
}

export interface PrimitiveInteractionMatrixResult {
  n: number;
  coOccurrence: CoOccurrenceCell[]; // 8x8 = 64 cells (including diagonal = solo-presence count)
  recoveryChosenWhenBothOffered: ChosenWhenBothOfferedCell[]; // 6 unordered pairs among DISRUPT/SETUP/REPAIR/CCR
  taskSkipRate: { taskType: SolveTaskType; plannedCount: number; completedCount: number; skipRate: number }[]; // planned but not completed -- gap only, root cause not attributable without new instrumentation (disclosed)
}

const RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR"];
const TASK_TYPES: SolveTaskType[] = ["PAIR", "FLIP", "PARITY", "ENDGAME"];

export function buildPrimitiveInteractionMatrix(results: readonly EndToEndSolveResult[]): PrimitiveInteractionMatrixResult {
  const presentSets = results.map(presentSet);

  const coOccurrence: CoOccurrenceCell[] = [];
  for (const row of ALL_PRIMITIVES) {
    for (const col of ALL_PRIMITIVES) {
      const count = presentSets.filter((s) => s.has(row) && s.has(col)).length;
      coOccurrence.push({ row, col, coOccurrenceCount: count });
    }
  }

  const recoveryChosenWhenBothOffered: ChosenWhenBothOfferedCell[] = [];
  for (let i = 0; i < RECOVERY_TYPES.length; i++) {
    for (let j = i + 1; j < RECOVERY_TYPES.length; j++) {
      const a = RECOVERY_TYPES[i];
      const b = RECOVERY_TYPES[j];
      let bothOfferedCount = 0;
      let aWon = 0;
      let bWon = 0;
      let neitherWon = 0;
      for (const r of results) {
        const outcome = r.recoveryOutcome;
        if (!outcome) continue;
        if (outcome.candidatesOffered.includes(a) && outcome.candidatesOffered.includes(b)) {
          bothOfferedCount++;
          if (outcome.chosenType === a) aWon++;
          else if (outcome.chosenType === b) bWon++;
          else neitherWon++;
        }
      }
      recoveryChosenWhenBothOffered.push({ a, b, bothOfferedCount, aWon, bWon, neitherWon });
    }
  }

  const taskSkipRate = TASK_TYPES.map((taskType) => {
    const plannedCount = results.reduce((acc, r) => acc + r.plannedTaskTypes.filter((t) => t === taskType).length, 0);
    const completedCount = results.reduce((acc, r) => acc + r.completedTaskTypes.filter((t) => t === taskType).length, 0);
    return { taskType, plannedCount, completedCount, skipRate: plannedCount ? 1 - completedCount / plannedCount : 0 };
  });

  return { n: results.length, coOccurrence, recoveryChosenWhenBothOffered, taskSkipRate };
}
