// --- FullPipelineProbe (Solver Completeness Verification Sprint v1)
// -----------------------------------------------------------------------
// Headless, non-UI composition of the REAL, unmodified 4-phase production
// pipeline exactly as customSolvePlayback.ts's previewNextFiveByFiveMove
// drives it (per-phase order: true-center positions -> centers human-style
// -> wing pairing, repeated to convergence -> 3x3x3-style reduction), but
// run start-to-finish in one headless call instead of one preview-per-press.
// No Production file is imported in a way that changes its behavior -- only
// existing public exports, called exactly as any other real caller does
// (matches this whole research arc's own "measurement code only" discipline).
import { buildSolvedCube, cloneCubies, isSolved, randomLayerScramble, type Cubie } from "../cubeState";
import { solveTrueCenterPositions5 } from "../fiveByFiveCenters";
import { solveCentersHumanStyle } from "../fiveByFiveHumanCenters";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import { solveReduced5 } from "../fiveByFiveReduction";

let warmed = false;
export function ensureWarm(): void {
  if (!warmed) {
    warmupFiveByFiveEdgeLibraries();
    warmed = true;
  }
}

export const GRID_SIZE = 5;
export const DEFAULT_MAX_WING_PAIRING_ITERATIONS = 50; // user-confirmed convergence cap

export interface PhaseOutcome {
  name: "centers-true" | "centers-human" | "wing-pairing" | "reduction";
  wallMs: number;
  threw: boolean;
  errorMessage?: string;
}

export interface FullPipelineResult {
  label: string;
  totalWallMs: number;
  phases: PhaseOutcome[];
  anyException: boolean;
  exceptionPhase: PhaseOutcome["name"] | null;

  wingPairingIterations: number;
  wingPairingConverged: boolean; // reached wrongWingCount5===0 within the iteration cap
  wingPairingBudgetViolations: number; // iterations where recovery triggered AND that call's own deadline was still missed
  wingPairingDeadlineMisses: number; // iterations where the outer 1s deadline was exceeded (trace "budget-exhausted")
  wingPairingRecoveryTriggeredCount: number;
  wingPairingNoProgressStreak: number; // longest consecutive run of empty moveQueue within this case's own loop

  reductionAttempted: boolean;
  reductionSolved: boolean | null; // solveReduced5's own self-reported flag, null if never attempted (wing-pairing didn't converge)

  fullySolved: boolean; // ground truth: isSolved(cubies) at the very end, independent of any phase's own self-reported flag
  unknownState: boolean; // true only if fullySolved is false AND no exception/non-convergence explains it (should never happen if classification is exhaustive)
}

function timedPhase<T>(name: PhaseOutcome["name"], fn: () => T): { phase: PhaseOutcome; value: T | null } {
  const start = Date.now();
  try {
    const value = fn();
    return { phase: { name, wallMs: Date.now() - start, threw: false }, value };
  } catch (err) {
    return {
      phase: { name, wallMs: Date.now() - start, threw: true, errorMessage: err instanceof Error ? err.message : String(err) },
      value: null,
    };
  }
}

async function timedPhaseAsync<T>(name: PhaseOutcome["name"], fn: () => Promise<T>): Promise<{ phase: PhaseOutcome; value: T | null }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { phase: { name, wallMs: Date.now() - start, threw: false }, value };
  } catch (err) {
    return {
      phase: { name, wallMs: Date.now() - start, threw: true, errorMessage: err instanceof Error ? err.message : String(err) },
      value: null,
    };
  }
}

/**
 * Runs the real, unmodified 4-phase production pipeline start-to-finish on
 * `cubies` (mutated in place, matching every phase's own real mutation
 * contract -- see this Sprint's own ground-truth investigation). Never
 * throws itself: every phase is wrapped so a real production exception
 * becomes a disclosed FullPipelineResult field instead of crashing the
 * batch (Goal A's own "Crash 없어야 한다" is exactly what this function
 * exists to observe, not to prevent by construction).
 */
export async function runFullPipeline(
  cubies: Cubie[],
  label: string,
  maxWingPairingIterations = DEFAULT_MAX_WING_PAIRING_ITERATIONS
): Promise<FullPipelineResult> {
  ensureWarm();
  const totalStart = Date.now();
  const phases: PhaseOutcome[] = [];
  let anyException = false;
  let exceptionPhase: PhaseOutcome["name"] | null = null;

  const markException = (phase: PhaseOutcome) => {
    if (phase.threw) {
      anyException = true;
      exceptionPhase = exceptionPhase ?? phase.name;
    }
  };

  // Phase 1: true-center positions (mutates cubies in place, bounded BFS depth=8, no time budget needed).
  const p1 = timedPhase("centers-true", () => solveTrueCenterPositions5(cubies));
  phases.push(p1.phase);
  markException(p1.phase);

  // Phase 2: centers human-style (mutates cubies in place, self-bounded by guard<80 && 15s deadline).
  const p2 = timedPhase("centers-human", () => solveCentersHumanStyle(cubies, 15000));
  phases.push(p2.phase);
  markException(p2.phase);

  // Phase 3: wing pairing, looped to convergence -- matches real production
  // usage (customSolvePlayback.ts calls solve() again each time the plan is
  // exhausted, until wrongWingCount5===0). solve() itself does NOT mutate
  // cubies -- this Sprint's own ground-truth read confirmed it clones
  // internally -- so the returned moveQueue must be applied here explicitly,
  // exactly as EndToEndSolveProbe.ts's own established pattern does.
  let wingPairingIterations = 0;
  let wingPairingBudgetViolations = 0;
  let wingPairingDeadlineMisses = 0;
  let wingPairingRecoveryTriggeredCount = 0;
  let noProgressStreak = 0;
  let longestNoProgressStreak = 0;
  let wingPairingThrew = false;
  let wingPairingErrorMessage: string | undefined;
  const wingPairingStart = Date.now();

  if (!anyException) {
    while (wrongWingCount5(cubies) > 0 && wingPairingIterations < maxWingPairingIterations) {
      wingPairingIterations++;
      try {
        const engine = new FiveByFiveEdgeSolverEngine();
        const plan = engine.solve(cubies);
        applySeq(cubies, plan.moveQueue);
        const trace = engine.getTrace();
        const deadlineMissed = trace.some((t) => t.label === "budget-exhausted");
        const recoveryTriggered = trace.some((t) => t.label === "recovery-triggered");
        if (deadlineMissed) wingPairingDeadlineMisses++;
        if (recoveryTriggered) {
          wingPairingRecoveryTriggeredCount++;
          if (deadlineMissed) wingPairingBudgetViolations++; // Recovery ran AND the whole call still blew its budget
        }
        // NOTE: does NOT break early on empty plans. Real production usage
        // (customSolvePlayback.ts's previewNextFiveByFiveMove) invalidates
        // the plan and waits for the user's NEXT press on an empty result,
        // but a persistent user can press again indefinitely -- and since
        // solve() is genuinely stochastic (shuffle()-driven), a fresh call
        // on the SAME unchanged cube state can succeed even immediately
        // after a prior call returned nothing. An early first version of
        // this harness broke after 2 consecutive empty plans and a smoke
        // test showed ALL cases (including trivially-easy depth-10
        // scrambles) failing to converge within just 2-8 iterations, far
        // below the 50-iteration cap -- caught before the full-scale run
        // and fixed here: only the iteration cap and genuine convergence
        // (wrongWingCount5===0) end this loop, matching what an actually
        // persistent real user's repeated presses would do.
        if (plan.moveQueue.length === 0) {
          noProgressStreak++;
          longestNoProgressStreak = Math.max(longestNoProgressStreak, noProgressStreak);
        } else {
          noProgressStreak = 0;
        }
      } catch (err) {
        wingPairingThrew = true;
        wingPairingErrorMessage = err instanceof Error ? err.message : String(err);
        break;
      }
    }
  }
  phases.push({ name: "wing-pairing", wallMs: Date.now() - wingPairingStart, threw: wingPairingThrew, errorMessage: wingPairingErrorMessage });
  markException(phases[phases.length - 1]);

  const wingPairingConverged = !anyException && wrongWingCount5(cubies) === 0;

  // Phase 4: reduction -- only attempted once wing pairing has genuinely
  // converged, exactly matching previewNextFiveByFiveMove's own control
  // flow (it only reaches solveReduced5 once wrongWingCount5(cubies)===0).
  let reductionAttempted = false;
  let reductionSolved: boolean | null = null;
  if (wingPairingConverged) {
    reductionAttempted = true;
    const p4 = await timedPhaseAsync("reduction", () => solveReduced5(cubies, GRID_SIZE));
    phases.push(p4.phase);
    markException(p4.phase);
    reductionSolved = p4.value?.solved ?? null;
  }

  const fullySolved = isSolved(cubies); // ground truth, independent of any phase's own self-reported flag
  const nonConvergentOrExceptional = anyException || !wingPairingConverged;
  const unknownState = !fullySolved && !nonConvergentOrExceptional;

  return {
    label,
    totalWallMs: Date.now() - totalStart,
    phases,
    anyException,
    exceptionPhase,
    wingPairingIterations,
    wingPairingConverged,
    wingPairingBudgetViolations,
    wingPairingDeadlineMisses,
    wingPairingRecoveryTriggeredCount,
    wingPairingNoProgressStreak: longestNoProgressStreak,
    reductionAttempted,
    reductionSolved,
    fullySolved,
    unknownState,
  };
}

/** Builds a fresh, freshly-scrambled 5x5 cube (solved state + N random layer turns). */
export function buildScrambledCube(depth: number): Cubie[] {
  const cubies = buildSolvedCube(GRID_SIZE);
  randomLayerScramble(cubies, GRID_SIZE, depth);
  return cubies;
}

export { cloneCubies };
