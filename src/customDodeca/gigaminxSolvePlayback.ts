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
import { solveFullGigaminxStreaming } from "./gigaminxSolveWorkerClient";

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
  // The plan arrives phase by phase (see solveFullGigaminxStreaming): `complete` flips once every phase has
  // been delivered, and `generation` makes chunks of a superseded solve (new scramble, reset, undo) harmless.
  private complete = true;
  private generation = 0;
  private progressWaiters: (() => void)[] = [];
  // Dedupes a background prewarm (fired right after scramble) against a
  // real click landing before it finishes -- same reasoning as
  // kilominxFamilySolvePlayback.ts's own KilominxFamilySolverEngine.pending.
  // Resolves when the FIRST moves are available (not when the whole plan is).
  private pending: { undoCountAtStart: number; promise: Promise<void> } | null = null;

  private expectedUndoCount(): number {
    return this.planStartUndoCount + this.cursor;
  }

  hasValidPlan(scene: CustomDodecaScene): boolean {
    return this.plan !== null && this.expectedUndoCount() === scene.getUndoCount();
  }

  private notifyProgress(): void {
    const waiters = this.progressWaiters;
    this.progressWaiters = [];
    for (const w of waiters) w();
  }

  /** Resolves at the next delivered chunk or when the plan completes (immediately if it already has). */
  waitForProgress(): Promise<void> {
    if (this.complete) return Promise.resolve();
    return new Promise((resolve) => this.progressWaiters.push(resolve));
  }

  isComplete(): boolean {
    return this.complete;
  }

  async solve(scene: CustomDodecaScene): Promise<void> {
    const undoCountAtStart = scene.getUndoCount();
    if (this.pending && this.pending.undoCountAtStart === undoCountAtStart) return this.pending.promise;

    const generation = ++this.generation;
    const plan: GigaminxTurn[] = [];
    this.plan = plan;
    this.cursor = 0;
    this.planStartUndoCount = undoCountAtStart;
    this.complete = false;

    const promise = new Promise<void>((resolveFirst) => {
      const state: DodecaState = { layerCount: scene.layerCount, stickers: scene.getStickers() };
      const solverState = dodecaStateToGigaminxState(state);
      const startedAt = performance.now();
      solveFullGigaminxStreaming(solverState, (chunk) => {
        if (generation !== this.generation) return;
        for (const m of chunk) plan.push(m);
        if (chunk.length > 0) resolveFirst();
        this.notifyProgress();
      })
        .catch((err) => console.error("gigaminx solve failed:", err))
        .then(() => {
          if (generation === this.generation) {
            this.complete = true;
            const ms = performance.now() - startedAt;
            if (ms > 3000) console.warn(`[gigaminx] slow solve: ${Math.round(ms)}ms`, { moves: plan.length });
          }
          resolveFirst();
          this.notifyProgress();
        });
    });
    this.pending = { undoCountAtStart, promise };
    try {
      await promise;
    } finally {
      if (this.pending?.promise === promise) this.pending = null;
    }
  }

  invalidate(): void {
    this.generation++;
    this.plan = null;
    this.cursor = 0;
    this.planStartUndoCount = -1;
    this.complete = true;
    this.notifyProgress();
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

  // The plan streams in phase by phase; if the player has played everything delivered so far, wait for more.
  let move = engine.peekNextMove();
  while (!move && !engine.isComplete()) {
    await engine.waitForProgress();
    move = engine.peekNextMove();
  }
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
