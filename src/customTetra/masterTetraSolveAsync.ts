// Split out of masterTetraminxSolver.ts to break a Vite production-build
// failure: that file is imported by BOTH edgePdbWorker.ts and
// axialWorker.ts (each a `new Worker(new URL(...))` entry point), and this
// file's own dynamic imports of edgePdbClient.ts/axialWorkerClient.ts (each
// of which constructs one of those SAME workers) closed a cycle between the
// two worker entry files through their shared dependency. `vite build`
// refuses to bundle that regardless of whether the import is static or
// dynamic (confirmed empirically -- both were tried). Keeping this
// worker-construction-adjacent code in its own file, which neither worker
// file imports (directly or transitively), keeps masterTetraminxSolver.ts
// itself safe for both workers to import.
import type { CustomTetraScene } from "./CustomTetraScene";
import {
  applyPhaseTo,
  cloneState,
  computeMasterTetraSolveProgress,
  continueAfterAxialSolved,
  patternFromState,
  precompute,
  preloadOuterPdb,
  tipSolveMoves,
  type MasterTetraSolveResult,
  type SolveProgress,
  type TetraMove,
} from "./masterTetraminxSolver";
import { solveAxialDecomposed } from "./tetraAxialDecomposed";
import { applyRawThirdTurn, isSolved, type TetraState } from "./tetraState";

/**
 * Computes a full solve for a Master-Pyraminx-family tetrahedron (N>=4) in
 * 3 independent phases -- axial+center, then edges, then tips -- each
 * solved against whatever the PREVIOUS phase already fixed (so later
 * phases never undo earlier ones). See meetInMiddleSolve's own comment for
 * why a single whole-puzzle search isn't used instead.
 *
 * Synchronous, unchanged in behavior from before the edge PDB existed --
 * safe for any caller (including outside a browser) that doesn't want to
 * deal with a Promise. If edges fail here, prefer
 * computeMasterTetraSolveMovesAsync when a worker is available: it retries
 * with the PDB before giving up.
 */
export function computeMasterTetraSolveMoves(state: TetraState): MasterTetraSolveResult {
  const progress = computeMasterTetraSolveProgress(state);
  return { moves: progress.moves, solved: !progress.edgePhaseFailed && isSolved(progress.working) };
}

/**
 * Same as computeMasterTetraSolveMoves, but when (and only when) edges are
 * the one thing still wrong after the synchronous phases, hands off to
 * edgePdbClient's worker for one more attempt before giving up -- see this
 * file's edge-PDB section comment for why that step can't run inline here.
 * Safe to call from anywhere computeMasterTetraSolveMoves is (falls back to
 * its exact result if the worker is unavailable or unhelpful), but only
 * actually worth the `await` in a browser context with edgePdbClient's
 * Worker support.
 */
export async function computeMasterTetraSolveMovesAsync(state: TetraState): Promise<MasterTetraSolveResult> {
  const t0 = performance.now();
  const trace: Record<string, number | boolean | string> = {};
  const result = await computeMasterTetraSolveMovesTraced(state, trace);
  const total = performance.now() - t0;
  if (total > 3000) console.warn(`[master-tetra] slow N=${state.layerCount} solve: ${Math.round(total)}ms`, trace);
  return result;
}

async function computeMasterTetraSolveMovesTraced(state: TetraState, trace: Record<string, number | boolean | string>): Promise<MasterTetraSolveResult> {
  let mark = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    trace[name] = Math.round(now - mark);
    mark = now;
  };
  const [{ preloadEdgePdbWorker, solveEdgesViaPdbWorker }, { preloadAxialWorker, solveAxialViaWorker }] = await Promise.all([import("./edgePdbClient"), import("./axialWorkerClient")]);

  // Fire this before the axial worker call below so both workers' fetches
  // (PDB asset, wasm asset) overlap with each other instead of queuing.
  preloadEdgePdbWorker();
  preloadAxialWorker();

  // Unlike the worker-based edge PDB above, this one genuinely needs an
  // `await` here, not just a fire-and-forget call -- see preloadOuterPdb's
  // own comment for why a bare call was confirmed NOT enough (a long
  // synchronous phase starving its fetch callback of any chance to run --
  // less likely to matter now that the axial phase below usually doesn't
  // block synchronously at all, but N=5 edges still need this preloaded
  // either way). Raced against a short timeout so a slow/unavailable
  // network never holds up a solve by more than that --
  // solveN5EdgesInTwoPhases degrades gracefully to its existing
  // meet-in-the-middle attempt either way.
  // Started now, awaited only after the (short) axial step below, so a first-time download
  // overlaps with it instead of delaying it.
  const outerPdbReady = Promise.race([preloadOuterPdb(), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);

  const pre = precompute(state.layerCount);
  // Try the worker's axial-only search (wasm-backed) FIRST, instead of
  // computeMasterTetraSolveProgress's combined depth-7 attempt (which
  // this file used to always run synchronously before ever reaching a
  // worker). Measured (real browser, this investigation): axial-only via
  // worker/wasm finishes in well under a second for easy/medium scrambles
  // and ~6.4-6.7s even for the 3 known-hardest ones -- faster than the
  // combined search's ~10-19s (JIT-dependent) across EVERY case tested,
  // not just the hard ones the old fallback-on-failure logic targeted.
  // Center gets cleaned up afterward by continueAfterAxialSolved's
  // deterministic, essentially-always-succeeding commutator
  // (solveCentersByCommutator) -- same "fallback" path already proven
  // correct for the hard cases, now used unconditionally here.
  // Decomposed solve first (one 12-slot orbit search + a precomputed kernel word -- see
  // tetraAxialDecomposed.ts); the whole-axial worker search below is only the fallback.
  const pattern = patternFromState(state, pre);
  let axialMoves = solveAxialDecomposed(pre, pattern);
  lap("decomposedMs");
  trace.decomposed = !!axialMoves;
  if (!axialMoves) axialMoves = await solveAxialViaWorker(state.layerCount, pattern, 10, 16_000_000);
  lap("axialMs");
  await outerPdbReady;
  lap("preloadWaitMs");
  trace.axialFound = !!axialMoves;

  let progress: SolveProgress;
  if (axialMoves) {
    const working = cloneState(state);
    const moves: TetraMove[] = [];
    applyPhaseTo(working, moves, axialMoves);
    const { edgePhaseFailed } = continueAfterAxialSolved(pre, working, moves, true);
    progress = { moves, working, edgePhaseFailed, axialOnlyFailed: false };
    lap("afterAxialMs");
  } else {
    // Worker/Worker API unavailable, or the search genuinely failed within
    // its 16,000,000-state budget (should be rare to never -- the 3
    // known-hardest scrambles need ~11,590,974, confirmed earlier) -- fall
    // back to the fully synchronous path so a hint press still returns
    // something.
    progress = computeMasterTetraSolveProgress(state);
    lap("syncFallbackMs");
  }
  trace.edgePhaseFailed = progress.edgePhaseFailed;

  if (!progress.edgePhaseFailed) {
    return { moves: progress.moves, solved: isSolved(progress.working) };
  }

  // Off the main thread, so a much bigger budget than any sync search in
  // this file is safe -- see edgePdbClient.ts's own defaults/comment for
  // the reasoning (8,000,000 nodes comfortably clears the ~3,000,000-node
  // "wall" a search typically has to cross before making real progress,
  // measured during this feature's offline research, while keeping a
  // single worst-case attempt bounded to roughly a minute rather than
  // several).
  const edgeMoves = await solveEdgesViaPdbWorker(progress.working.layerCount, patternFromState(progress.working, pre), 9, 8_000_000);
  lap("edgePdbMs");
  if (!edgeMoves) return { moves: progress.moves, solved: false };

  const moves = [...progress.moves];
  for (const m of edgeMoves) {
    applyRawThirdTurn(progress.working, m.vertexIndex, m.depth, m.sign);
    moves.push(m);
  }
  const tipMoves = tipSolveMoves(progress.working);
  for (const m of tipMoves) {
    applyRawThirdTurn(progress.working, m.vertexIndex, m.depth, m.sign);
    moves.push(m);
  }
  return { moves, solved: isSolved(progress.working) };
}

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

export interface MasterTetraSolveHint {
  move: TetraMove | null;
  movesRemaining: number;
}

/**
 * Plan-once/consume-many cache, mirroring customSolvePlayback.ts's
 * FourByFourSolverEngine: computeMasterTetraSolveMoves takes up to a second
 * or two (3 live BFS/trial phases), so it's wasteful to recompute on every
 * single hint press. The cached plan is replayed one move at a time and
 * only rebuilt when the live scene no longer matches where it should be by
 * now (scramble, reset, undo, or an off-plan move) -- tracked via the
 * scene's own undo count, same trick TetraView's reportSolveCommit uses.
 */
class MasterTetraSolverEngine {
  private plan: TetraMove[] | null = null;
  private cursor = 0;
  private planStartUndoCount = -1;
  // Dedupes a background prewarm (fired right after scramble) against a
  // real click landing before it finishes -- same reasoning as
  // kilominxFamilySolvePlayback.ts's own KilominxFamilySolverEngine.pending/
  // gigaminxSolvePlayback.ts's own GigaminxSolverEngine.pending.
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
      const result = await computeMasterTetraSolveMovesAsync(state);
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

// Module-level, like fourByFourEngine in customSolvePlayback.ts -- only one
// Master-Pyraminx-family TetraView is ever mounted at a time.
const engine = new MasterTetraSolverEngine();

/**
 * Solves for the scene's current actual state and plays the next move of a
 * cached plan for real: turns the layer and commits it, exactly as if the
 * player had swiped it themselves. Same contract as
 * tetraSolvePlayback.ts's applyNextTetraSolveMove (used for the 3-layer
 * Pyraminx instead).
 */
export async function applyNextMasterTetraSolveMove(scene: CustomTetraScene): Promise<MasterTetraSolveHint> {
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
 * kilominxFamilySolvePlayback.ts's own prewarmKilominxFamilySolve/
 * gigaminxSolvePlayback.ts's own prewarmGigaminxSolve -- meant to be called
 * right after a scramble (N=4/5 only -- N=3 and N=6 use their own, already-
 * fast dedicated solvers) so the plan is usually already cached by the time
 * the player actually presses the solve hint. Errors are swallowed: a
 * failed prewarm just means the real press recomputes, same as if this
 * were never called.
 */
export function prewarmMasterTetraSolve(scene: CustomTetraScene): void {
  if (engine.hasValidPlan(scene)) return;
  engine.solve(scene).catch(() => {});
}
