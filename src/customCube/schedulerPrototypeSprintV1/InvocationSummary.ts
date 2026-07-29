// --- InvocationSummary (CONFLICT_DEEP_DEPENDENCY Scheduler Prototype
// Sprint v1, STEP5 -- Deliverable #3 "Invocation Summary") -------------------
// Uses the existing onEvent SchedulingEvent hook (unchanged, already exported
// for exactly this purpose since Integration Refinement Sprint v1) on a
// single real generateRecoveryStrategies() call per round -- no
// reconstruction, no shared-deadline risk (single call, matches
// CompetitionMatrix.ts's own precedent). Counts how often SETUP's own
// search is actually INVOKED (its own tryEndgameMultiPly ran) vs SKIPPED
// (candidates.length>0 already, STEP1's own Last-Resort gate) vs EMPTY
// (invoked but found nothing) -- the direct Runtime-savings evidence for
// Option A's "SETUP이 이미 생성된 후보 중 하나이므로 추가 생성 비용 없음"
// claim from the preceding Architecture Revision Sprint's Option A writeup.
import { cloneCubies, type Cubie } from "../cubeState";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const GEN_DEADLINE_MS = 1000;

export interface InvocationRound {
  label: string;
  setupPhase: "skipped" | "generated" | "empty" | "none"; // "none" if no SETUP event was ever emitted (shouldn't happen in reservedBudget+useSetupReservedSlice, kept for completeness)
}

export function runInvocationRound(cubies: Cubie[], libs: ExecutorLibraries, label: string): InvocationRound {
  const events: SchedulingEvent[] = [];
  const deadline = Date.now() + GEN_DEADLINE_MS;
  generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", (e) => events.push(e), true, true, true);
  const setupEvents = events.filter((e) => e.candidateType === "SETUP");
  const last = setupEvents.at(-1);
  const setupPhase: InvocationRound["setupPhase"] = last?.phase === "skipped" ? "skipped" : last?.phase === "generated" ? "generated" : last?.phase === "empty" ? "empty" : "none";
  return { label, setupPhase };
}

export function runInvocationSummary(cases: readonly HoleCase[], libs: ExecutorLibraries, repeats: number): InvocationRound[] {
  const rounds: InvocationRound[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    for (const c of cases) rounds.push(runInvocationRound(c.cubies, libs, c.label));
  }
  return rounds;
}

export interface InvocationSummaryResult {
  n: number;
  skippedCount: number; // SETUP never attempted (another candidate already existed) -- the Runtime saving
  skippedRate: number;
  invokedCount: number; // generated + empty (tryEndgameMultiPly actually ran)
  invokedRate: number;
  generatedCount: number;
  emptyCount: number;
}

export function summarizeInvocation(rounds: readonly InvocationRound[]): InvocationSummaryResult {
  const n = rounds.length;
  const skippedCount = rounds.filter((r) => r.setupPhase === "skipped").length;
  const generatedCount = rounds.filter((r) => r.setupPhase === "generated").length;
  const emptyCount = rounds.filter((r) => r.setupPhase === "empty").length;
  const invokedCount = generatedCount + emptyCount;
  return {
    n,
    skippedCount,
    skippedRate: n ? skippedCount / n : 0,
    invokedCount,
    invokedRate: n ? invokedCount / n : 0,
    generatedCount,
    emptyCount,
  };
}
