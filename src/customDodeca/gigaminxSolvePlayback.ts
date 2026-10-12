// GIGAMINX_SOLVER_PRODUCTION_INTEGRATION_V2 -- connects the verified
// GigaminxState bridge (gigaminxState.ts's dodecaStateToGigaminxState/
// gigaminxTurnToRawTurn) and the one-shot full solver (gigaminxSolver.ts's
// solveFullGigaminx) to the live CustomDodecaScene, using the same
// plan-once/consume-many cache pattern as masterTetraSolveAsync.ts's
// MasterTetraSolverEngine (cache invalidated via the scene's own undo
// count, not a separate dirty flag).
import type { CustomDodecaScene } from "./CustomDodecaScene";
import type { DodecaState } from "./dodecaState";
import { dodecaStateToGigaminxState, gigaminxTurnToRawTurn, type GigaminxTurn } from "./gigaminxState";

export interface GigaminxSolveHint {
  move: GigaminxTurn | null;
  movesRemaining: number;
}

/**
 * Plan-once/consume-many cache, mirroring masterTetraSolveAsync.ts's
 * MasterTetraSolverEngine: solveFullGigaminx takes on the order of a
 * second or more (S36's frozen baseline: mean ~2.2s), so it's wasteful to
 * recompute on every single Solve press. The cached plan is replayed one
 * move at a time and only rebuilt when the live scene no longer matches
 * where it should be by now (scramble, reset, undo, manual move, or a
 * fresh puzzle) -- tracked via the scene's own undo count.
 */
class GigaminxSolverEngine {
  private plan: GigaminxTurn[] | null = null;
  private cursor = 0;
  private planStartUndoCount = -1;
  // Dedupes a background prewarm (fired right after scramble) against a
  // real click landing before it finishes -- same reasoning as
  // kilominxFamilySolvePlayback.ts's own KilominxFamilySolverEngine.pending.
  private pending: { undoCountAtStart: number; promise: Promise<void> } | null = null;

  private expectedUndoCount(): number {
    return this.planStartUndoCount + this.cursor;
  }

  hasValidPlan(scene: CustomDodecaScene): boolean {
    return this.plan !== null && this.expectedUndoCount() === scene.getUndoCount();
  }

  async solve(scene: CustomDodecaScene): Promise<void> {
    const undoCountAtStart = scene.getUndoCount();
    if (this.pending && this.pending.undoCountAtStart === undoCountAtStart) return this.pending.promise;

    const promise = (async () => {
      const state: DodecaState = { layerCount: scene.layerCount, stickers: scene.getStickers() };
      const solverState = dodecaStateToGigaminxState(state);
      // Dynamic import: gigaminxSolver.ts bundles the 5 precomputed commutator
      // libraries (~179KB gzip, see GIGAMINX_SOLVE_PRODUCTION_ACCEPTANCE_V1).
      // Loading it only here (not from a static top-level import) keeps that
      // weight out of every DodecaView mount -- Cube/Tetra players, and even
      // players on N=2..4 dodeca puzzles, never pay for it; only an actual
      // Gigaminx Solve press does, exactly once (the dynamic import is
      // memoized by the module loader after the first call).
      const { solveFullGigaminx } = await import("./gigaminxSolver");
      const result = solveFullGigaminx(solverState);
      this.plan = result.moves;
      this.cursor = 0;
      this.planStartUndoCount = undoCountAtStart;
    })();
    this.pending = { undoCountAtStart, promise };
    try {
      await promise;
    } finally {
      if (this.pending?.promise === promise) this.pending = null;
    }
  }

  invalidate(): void {
    this.plan = null;
    this.cursor = 0;
    this.planStartUndoCount = -1;
  }

  peekNextMove(): GigaminxTurn | null {
    if (!this.plan || this.cursor >= this.plan.length) return null;
    return this.plan[this.cursor];
  }

  advance(): void {
    this.cursor++;
  }

  remainingMoves(): number {
    return this.plan ? this.plan.length - this.cursor : 0;
  }
}

// Module-level, like masterTetraSolveAsync.ts's own `engine` -- only one
// Gigaminx DodecaView is ever mounted at a time.
const engine = new GigaminxSolverEngine();

const MOVE_ANIMATION_MS = 350;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateProgress(scene: CustomDodecaScene, from: number, to: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now: number) {
      const t = Math.min((now - start) / durationMs, 1);
      scene.setTurnProgress(from + easeOutCubic(t) * (to - from));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

/**
 * Solves for the scene's current actual state (via the verified bridge)
 * and plays the next move of a cached plan for real: turns the layer and
 * commits it, exactly as if the player had swiped it themselves. Same
 * contract as masterTetraSolveAsync.ts's applyNextMasterTetraSolveMove.
 */
export async function applyNextGigaminxSolveMove(scene: CustomDodecaScene): Promise<GigaminxSolveHint> {
  if (!engine.hasValidPlan(scene)) await engine.solve(scene);

  const move = engine.peekNextMove();
  if (!move) return { move: null, movesRemaining: 0 };

  const raw = gigaminxTurnToRawTurn(move);
  if (scene.beginTurn(raw.faceIndex, raw.depth)) {
    await animateProgress(scene, 0, raw.sign, MOVE_ANIMATION_MS);
    scene.endTurn(raw.sign);
    engine.advance();
  }
  return { move, movesRemaining: engine.remainingMoves() };
}

/** Exposed for DodecaView's own scramble/reset/undo/manual-move handlers, matching the explicit-invalidate calls elsewhere are NOT needed for -- the engine already self-invalidates via undo-count mismatch; this is here only for a caller that wants to force a fresh plan (e.g. switching puzzles). */
export function invalidateGigaminxSolvePlan(): void {
  engine.invalidate();
}

/**
 * Fire-and-forget background prewarm, same contract and reasoning as
 * kilominxFamilySolvePlayback.ts's own prewarmKilominxFamilySolve -- meant
 * to be called right after a scramble so the plan is usually already
 * cached by the time the player actually presses "솔브".
 */
export function prewarmGigaminxSolve(scene: CustomDodecaScene): void {
  if (engine.hasValidPlan(scene)) return;
  engine.solve(scene).catch(() => {});
}
