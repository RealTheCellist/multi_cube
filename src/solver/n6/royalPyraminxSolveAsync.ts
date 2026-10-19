// N=6 (Royal Pyraminx) UI integration: plan-once/consume-many solve engine,
// mirroring masterTetraSolveAsync.ts's MasterTetraSolverEngine (used for
// N=4/5) and tetraSolvePlayback.ts's applyNextTetraSolveMove contract (used
// for N=3) -- so TetraView.tsx can treat all four sizes uniformly.
import type { CustomTetraScene } from "../../customTetra/CustomTetraScene";
import type { TetraMove } from "../../customTetra/masterTetraminxSolver";
import type { TetraState } from "../../customTetra/tetraState";
import { royalMoveNamesToTetraMoves, sceneStateToRoyalState } from "./royalPyraminxSceneAdapter";
import { solveRoyalPyraminxOffThread } from "./royalSolveWorkerClient";

const MOVE_ANIMATION_MS = 350;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateProgress(scene: CustomTetraScene, from: number, to: number, durationMs: number): Promise<void> {
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

export interface RoyalPyraminxSolveHint {
  move: TetraMove | null;
  movesRemaining: number;
}

// Axial search-or-fallback budget. The search only pays off for short
// scrambles: measured (8 scrambles per cell, JS port of the same search) it
// finds a solution 8/8 up to ~10 moves at 500k states, and only ~1-2/8 of
// 20-move scrambles even at 4M states -- but 4M states cost ~5s of
// main-thread time in the real browser, and a live run of 15 length-20
// scrambles never once found a solution (always fell through to the
// commutator fallback, which is 100% guaranteed). So spending 4M states on
// every press bought almost nothing. 500k made the failure ~8x cheaper; 100k
// (this value) cuts it another ~5x: live over 60 scrambles each, click ->
// first move went from p50 1.17s / p90 1.74s (500k) to p50 0.72s / p90 1.15s
// (100k). The slow tail (3-5% of scrambles over 3s) is the commutator
// fallback's orbit2+5 search and doesn't depend on this budget.
const AXIAL_MAX_DEPTH_EACH_SIDE = 8;
const AXIAL_MAX_STATES = 100_000;

/**
 * Plan-once/consume-many cache, same rationale as
 * masterTetraSolveAsync.ts's MasterTetraSolverEngine: solveRoyalPyraminx can
 * take tens of seconds on the rare fallback path, so it's wasteful to
 * recompute on every hint press. Rebuilt only when the live scene no longer
 * matches where the cached plan expects it to be (tracked via undo count).
 */
class RoyalPyraminxSolverEngine {
  private plan: TetraMove[] | null = null;
  private cursor = 0;
  private planStartUndoCount = -1;
  // Dedupes a background prewarm against a real click landing first -- same
  // reasoning as masterTetraSolveAsync.ts's MasterTetraSolverEngine.pending.
  private pending: { undoCountAtStart: number; promise: Promise<void> } | null = null;

  private expectedUndoCount(): number {
    return this.planStartUndoCount + this.cursor;
  }

  hasValidPlan(scene: CustomTetraScene): boolean {
    return this.plan !== null && this.expectedUndoCount() === scene.getUndoCount();
  }

  async solve(scene: CustomTetraScene): Promise<void> {
    const undoCountAtStart = scene.getUndoCount();
    if (this.pending && this.pending.undoCountAtStart === undoCountAtStart) return this.pending.promise;

    const promise = (async () => {
      const state: TetraState = { layerCount: scene.layerCount, stickers: scene.getStickers() };
      const royalState = sceneStateToRoyalState(state);
      const moveNames = await solveRoyalPyraminxOffThread(royalState, AXIAL_MAX_DEPTH_EACH_SIDE, AXIAL_MAX_STATES);
      this.plan = royalMoveNamesToTetraMoves(moveNames);
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

  peekNextMove(): TetraMove | null {
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

// Module-level, like masterTetraSolveAsync.ts's `engine` -- only one N=6
// TetraView is ever mounted at a time.
const engine = new RoyalPyraminxSolverEngine();

/**
 * Solves for the scene's current actual state and plays the next move of a
 * cached plan for real: turns the layer and commits it, exactly as if the
 * player had swiped it themselves. Same contract as
 * masterTetraSolveAsync.ts's applyNextMasterTetraSolveMove (N=4/5) and
 * tetraSolvePlayback.ts's applyNextTetraSolveMove (N=3).
 */
export async function applyNextRoyalPyraminxSolveMove(scene: CustomTetraScene): Promise<RoyalPyraminxSolveHint> {
  if (!engine.hasValidPlan(scene)) await engine.solve(scene);

  const move = engine.peekNextMove();
  if (!move) return { move: null, movesRemaining: 0 };

  if (scene.beginTurn(move.vertexIndex, move.depth)) {
    await animateProgress(scene, 0, move.sign, MOVE_ANIMATION_MS);
    scene.endTurn(move.sign);
    engine.advance();
  }
  return { move, movesRemaining: engine.remainingMoves() };
}

/**
 * Fire-and-forget background prewarm, same contract as
 * masterTetraSolveAsync.ts's prewarmMasterTetraSolve -- call right after a
 * scramble so the first "솔브" press usually finds the plan already cached.
 */
export function prewarmRoyalPyraminxSolve(scene: CustomTetraScene): void {
  if (engine.hasValidPlan(scene)) return;
  engine.solve(scene).catch(() => {});
}
