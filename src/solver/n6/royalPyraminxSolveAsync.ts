// N=6 (Royal Pyraminx) UI integration: plan-once/consume-many solve engine,
// mirroring masterTetraSolveAsync.ts's MasterTetraSolverEngine (used for
// N=4/5) and tetraSolvePlayback.ts's applyNextTetraSolveMove contract (used
// for N=3) -- so TetraView.tsx can treat all four sizes uniformly.
import type { CustomTetraScene } from "../../customTetra/CustomTetraScene";
import type { TetraMove } from "../../customTetra/masterTetraminxSolver";
import type { TetraState } from "../../customTetra/tetraState";
import { royalMoveNamesToTetraMoves, sceneStateToRoyalState } from "./royalPyraminxSceneAdapter";
import { solveRoyalPyraminx } from "./royalPyraminxSolver";

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

// axial search-or-fallback budget: matches royalPyraminxSolver.test.ts's
// "ordinary scrambles" case (search succeeds fast for the common case) while
// still bounded enough that the rare commutator-fallback path (100%
// guaranteed, but 180-290 moves) completes in the tens-of-seconds range
// documented in this feature's own conclusion report rather than hanging.
const AXIAL_MAX_DEPTH_EACH_SIDE = 8;
const AXIAL_MAX_STATES = 4_000_000;

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

  private expectedUndoCount(): number {
    return this.planStartUndoCount + this.cursor;
  }

  hasValidPlan(scene: CustomTetraScene): boolean {
    return this.plan !== null && this.expectedUndoCount() === scene.getUndoCount();
  }

  async solve(scene: CustomTetraScene): Promise<void> {
    const state: TetraState = { layerCount: scene.layerCount, stickers: scene.getStickers() };
    const royalState = sceneStateToRoyalState(state);
    const moveNames = await solveRoyalPyraminx(royalState, AXIAL_MAX_DEPTH_EACH_SIDE, AXIAL_MAX_STATES);
    this.plan = royalMoveNamesToTetraMoves(moveNames);
    this.cursor = 0;
    this.planStartUndoCount = scene.getUndoCount();
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
