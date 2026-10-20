// MASTER_KILOMINX_SOLVER_UI_INTEGRATION_V1 -- connects the verified N=2/3/4
// state bridges (kilominxState.ts/megaminxState.ts/masterKilominxState.ts's
// own dodecaStateToXState/xTurnToRawTurn) and their one-shot full solvers
// to the live CustomDodecaScene. Same plan-once/consume-many cache pattern
// as gigaminxSolvePlayback.ts/masterTetraSolveAsync.ts, generalized across
// the 3 puzzle sizes since their solve contract is identical ({face, sign}
// turns, depth always 1 -- see dodecaState.ts's own generateRandomFifthTurns
// comment for why these 3 sizes never use depth>=2).
import type { CustomDodecaScene } from "./CustomDodecaScene";
import type { DodecaState } from "./dodecaState";
import { solveByCyclesOffThread } from "./megaminxCycleWorkerClient";

export interface KilominxFamilySolveHint {
  move: { face: number; sign: 1 | -1 } | null;
  movesRemaining: number;
}

interface Turn {
  face: number;
  sign: 1 | -1;
}

/**
 * Plan-once/consume-many cache, one instance per puzzle size (2, 3, or 4)
 * -- same shape as gigaminxSolvePlayback.ts's own GigaminxSolverEngine,
 * generalized over a `solveFn` the caller supplies per size.
 */
class KilominxFamilySolverEngine {
  private plan: Turn[] | null = null;
  private cursor = 0;
  private planStartUndoCount = -1;
  // Dedupes a background prewarm (fired right after scramble) against a
  // real click landing before it finishes: both call solve() for the SAME
  // target undo-count, so the second caller just awaits the first's
  // in-flight promise instead of redundantly re-solving.
  private pending: { undoCountAtStart: number; promise: Promise<void> } | null = null;

  private expectedUndoCount(): number {
    return this.planStartUndoCount + this.cursor;
  }

  hasValidPlan(scene: CustomDodecaScene): boolean {
    return this.plan !== null && this.expectedUndoCount() === scene.getUndoCount();
  }

  async solve(scene: CustomDodecaScene, solveFn: (state: DodecaState) => Promise<Turn[]>): Promise<void> {
    const undoCountAtStart = scene.getUndoCount();
    if (this.pending && this.pending.undoCountAtStart === undoCountAtStart) return this.pending.promise;

    const promise = (async () => {
      const state: DodecaState = { layerCount: scene.layerCount, stickers: scene.getStickers() };
      const plan = await solveFn(state);
      this.plan = plan;
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

  peekNextMove(): Turn | null {
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

// One engine per size -- a scramble on one DodecaView instance should never
// invalidate another's cached plan (not that more than one is ever mounted
// at once today, but keeps the 3 sizes' caches from colliding if that changes).
const engines = new Map<number, KilominxFamilySolverEngine>([
  [2, new KilominxFamilySolverEngine()],
  [3, new KilominxFamilySolverEngine()],
  [4, new KilominxFamilySolverEngine()],
]);

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

/** Re-checks a macro-solver plan on the real move tables before trusting it (cheap: a few hundred moves). */
function solvesIt<S>(turns: Turn[], start: S, apply: (s: S, face: any, sign: 1 | -1) => S, isSolved: (s: S) => boolean): boolean {
  let s = start;
  for (const t of turns) s = apply(s, t.face, t.sign);
  return isSolved(s);
}

async function solveKilominx2(state: DodecaState): Promise<Turn[]> {
  const { dodecaStateToKilominxState, applyKilominxMove, isKilominxSolved } = await import("./kilominxState");
  const ks = dodecaStateToKilominxState(state);
  // First choice: the short macro solve in its worker (see megaminxCycleSolver.ts); the older solver is the fallback.
  const turns = await solveByCyclesOffThread("kilominx", { perm: [...ks.perm], orient: [...ks.orient] });
  if (turns && solvesIt(turns, ks, applyKilominxMove, isKilominxSolved)) return turns;
  const solverMod = await import("./kilominxSolver");
  await solverMod.warmupKilominxSearchWasm();
  return solverMod.solveKilominx(ks);
}

async function solveMegaminx3(state: DodecaState): Promise<Turn[]> {
  const { dodecaStateToMegaminxState, applyMegaminxMove } = await import("./megaminxState");
  const ms = dodecaStateToMegaminxState(state);
  const turns = await solveByCyclesOffThread("megaminx", { cornerPerm: [...ms.cornerPerm], cornerOrient: [...ms.cornerOrient], edgePerm: [...ms.edgePerm], edgeOrient: [...ms.edgeOrient] });
  if (turns && solvesIt(turns, ms, applyMegaminxMove, (s) => s.cornerPerm.every((p, i) => p === i) && s.cornerOrient.every((o) => o === 0) && s.edgePerm.every((p, i) => p === i) && s.edgeOrient.every((o) => o === 0))) return turns;
  const solverMod = await import("./megaminxSolver");
  await solverMod.warmupMegaminxSearchWasm();
  return solverMod.solveMegaminx(ms);
}

async function solveMasterKilominx4(state: DodecaState): Promise<Turn[]> {
  const { dodecaStateToMasterKilominxState, applyMasterKilominxMove } = await import("./masterKilominxState");
  const ms = dodecaStateToMasterKilominxState(state);
  // Same piece model and move tables as the Megaminx, so the same macro solver applies.
  const turns = await solveByCyclesOffThread("megaminx", { cornerPerm: [...ms.cornerPerm], cornerOrient: [...ms.cornerOrient], edgePerm: [...ms.edgePerm], edgeOrient: [...ms.edgeOrient] });
  if (turns && solvesIt(turns, ms, applyMasterKilominxMove, (s) => s.cornerPerm.every((p, i) => p === i) && s.cornerOrient.every((o) => o === 0) && s.edgePerm.every((p, i) => p === i) && s.edgeOrient.every((o) => o === 0))) return turns;
  const solverMod = await import("./masterKilominxSolver");
  await solverMod.warmupMasterKilominxSearchWasm();
  return solverMod.solveMasterKilominx(ms);
}

function solveFnFor(layerCount: number): ((state: DodecaState) => Promise<Turn[]>) | null {
  if (layerCount === 2) return solveKilominx2;
  if (layerCount === 3) return solveMegaminx3;
  if (layerCount === 4) return solveMasterKilominx4;
  return null;
}

/**
 * Solves for the scene's current actual state (via the verified bridge)
 * and plays the next move of a cached plan for real: turns the layer and
 * commits it, exactly as if the player had swiped it themselves. Same
 * contract as gigaminxSolvePlayback.ts's own applyNextGigaminxSolveMove.
 */
export async function applyNextKilominxFamilySolveMove(scene: CustomDodecaScene): Promise<KilominxFamilySolveHint> {
  const solveFn = solveFnFor(scene.layerCount);
  const engine = engines.get(scene.layerCount);
  if (!solveFn || !engine) return { move: null, movesRemaining: 0 };

  if (!engine.hasValidPlan(scene)) await engine.solve(scene, solveFn);

  const move = engine.peekNextMove();
  if (!move) return { move: null, movesRemaining: 0 };

  // depth is always 1 for these 3 sizes (see this module's own top comment).
  if (scene.beginTurn(move.face, 1)) {
    await animateProgress(scene, 0, move.sign, MOVE_ANIMATION_MS);
    scene.endTurn(move.sign);
    engine.advance();
  }
  return { move, movesRemaining: engine.remainingMoves() };
}

/** Exposed for DodecaView's own scramble/reset/undo/manual-move handlers -- same spirit as gigaminxSolvePlayback.ts's invalidateGigaminxSolvePlan, not needed in normal operation (the engines self-invalidate via undo-count mismatch). */
export function invalidateKilominxFamilySolvePlan(layerCount: number): void {
  engines.get(layerCount)?.invalidate();
}

/**
 * Fire-and-forget: starts computing the full solve plan for the scene's
 * CURRENT state in the background, so that by the time the player actually
 * presses "솔브", applyNextKilominxFamilySolveMove's own engine.hasValidPlan
 * check is already true and the first press only pays the ~350ms move
 * animation -- not the multi-second solve itself. Meant to be called right
 * after a scramble (DodecaView's own imperative `scramble` handle), while
 * the player hasn't touched anything yet; if they DO move something before
 * this finishes, the undo-count mismatch this same engine already checks
 * for makes the stale result simply get discarded (see
 * KilominxFamilySolverEngine's own hasValidPlan/pending dedup) -- a real
 * click that lands first (or after an invalidating move) just computes its
 * own fresh plan as before, same as if this were never called. Errors are
 * swallowed here (a failed prewarm is a no-op, not a crash): the real
 * click-driven path retries and surfaces any genuine error there.
 */
export function prewarmKilominxFamilySolve(scene: CustomDodecaScene): void {
  const solveFn = solveFnFor(scene.layerCount);
  const engine = engines.get(scene.layerCount);
  if (!solveFn || !engine || engine.hasValidPlan(scene)) return;
  engine.solve(scene, solveFn).catch(() => {});
}
