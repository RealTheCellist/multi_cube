import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Rng } from "./customCube/cubeState";
import { CustomDodecaScene } from "./customDodeca/CustomDodecaScene";
import { attachDodecaSwipeTurning, type DodecaSwipeController } from "./customDodeca/dodecaSwipeControls";
import { applyNextGigaminxSolveMove, prewarmGigaminxSolve, type GigaminxSolveHint } from "./customDodeca/gigaminxSolvePlayback";
import { preloadGigaminxSolveWorker } from "./customDodeca/gigaminxSolveWorkerClient";
import { applyNextKilominxFamilySolveMove, prewarmKilominxFamilySolve, type KilominxFamilySolveHint } from "./customDodeca/kilominxFamilySolvePlayback";

export interface DodecaViewHandle {
  scramble: (rng?: Rng) => void;
  resetToSolved: () => void;
  isSolved: () => boolean;
  undoLastMove: () => boolean;
  // layerCount===5 (Gigaminx) dispatches to gigaminxSolvePlayback.ts;
  // layerCount 2..4 (Kilominx/Megaminx/Master Kilominx) dispatch to
  // kilominxFamilySolvePlayback.ts. Both resolve to a no-op hint (move:
  // null) once the puzzle's already solved.
  solveNextMove: () => Promise<GigaminxSolveHint | KilominxFamilySolveHint>;
}

interface DodecaViewProps {
  onMoveCountChange: (count: number) => void;
  onFirstMove: () => void;
  onSolvedChange: (solved: boolean) => void;
  // 2 (Kilominx) through 5 (Gigaminx).
  layerCount: number;
  orbitMode: boolean;
  // Same spirit as CubeView's `interactive` -- the home screen's static
  // preview, distinct from orbitMode, which still lets the user drag to
  // look around.
  interactive?: boolean;
}

// solveNextMove dispatches by layerCount: 5 (Gigaminx) uses
// gigaminxSolvePlayback.ts, 2..4 (Kilominx/Megaminx/Master Kilominx) use
// kilominxFamilySolvePlayback.ts.
const DodecaView = forwardRef<DodecaViewHandle, DodecaViewProps>(function DodecaView(
  { onMoveCountChange, onFirstMove, onSolvedChange, layerCount, orbitMode, interactive = true },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomDodecaScene | null>(null);
  const controllerRef = useRef<DodecaSwipeController | null>(null);
  const hasMovedRef = useRef(false);
  const moveCountRef = useRef(0);
  const orbitModeRef = useRef(orbitMode);
  orbitModeRef.current = orbitMode;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  const callbacksRef = useRef({ onMoveCountChange, onFirstMove, onSolvedChange });
  callbacksRef.current = { onMoveCountChange, onFirstMove, onSolvedChange };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    hasMovedRef.current = false;
    moveCountRef.current = 0;
    const scene = new CustomDodecaScene(container, layerCount);
    sceneRef.current = scene;
    // Gigaminx's solver is a heavy module; start loading it in its worker now, not on the first solve.
    if (layerCount === 5 && interactiveRef.current) preloadGigaminxSolveWorker();
    scene.setOrbitEnabled(interactiveRef.current && orbitModeRef.current);

    const controller = attachDodecaSwipeTurning(scene, moveCountRef);
    controller.setEnabled(interactiveRef.current && !orbitModeRef.current);
    controller.onCommit = (count) => {
      callbacksRef.current.onMoveCountChange(count);
      if (count > 0 && !hasMovedRef.current) {
        hasMovedRef.current = true;
        callbacksRef.current.onFirstMove();
      }
      callbacksRef.current.onSolvedChange(scene.isSolved());
    };
    controllerRef.current = controller;

    return () => {
      controller.detach();
      controllerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, [layerCount]);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(interactive && orbitMode);
    controllerRef.current?.setEnabled(interactive && !orbitMode);
  }, [orbitMode, interactive]);

  // Solve-hint presses commit the move for real, exactly like a swipe --
  // same reportSolveCommit contract as TetraView/CubeView, using the
  // scene's own undo-count delta rather than assuming +1.
  function reportSolveCommit(scene: CustomDodecaScene, before: number): void {
    const applied = scene.getUndoCount() - before;
    if (applied <= 0) return;
    moveCountRef.current += applied;
    callbacksRef.current.onMoveCountChange(moveCountRef.current);
    if (!hasMovedRef.current) {
      hasMovedRef.current = true;
      callbacksRef.current.onFirstMove();
    }
    callbacksRef.current.onSolvedChange(scene.isSolved());
  }

  useImperativeHandle(ref, () => ({
    scramble: (rng?: Rng) => {
      hasMovedRef.current = false;
      moveCountRef.current = 0;
      sceneRef.current?.scramble(rng);
      callbacksRef.current.onMoveCountChange(0);
      // Kick off the full solve in the background right away: by the time
      // the player actually presses "솔브", the plan is usually already
      // cached, so that first press only pays the move animation, not the
      // solve itself (see kilominxFamilySolvePlayback.ts's own prewarm
      // docstring -- gigaminxSolvePlayback.ts's own prewarmGigaminxSolve
      // mirrors it for N=5).
      if (sceneRef.current) {
        if (layerCount === 5) prewarmGigaminxSolve(sceneRef.current);
        else prewarmKilominxFamilySolve(sceneRef.current);
      }
    },
    resetToSolved: () => {
      hasMovedRef.current = false;
      moveCountRef.current = 0;
      sceneRef.current?.resetToSolved();
      callbacksRef.current.onMoveCountChange(0);
    },
    isSolved: () => sceneRef.current?.isSolved() ?? false,
    undoLastMove: () => {
      const scene = sceneRef.current;
      if (!scene) return false;
      const didUndo = scene.undoLastMove();
      if (didUndo) {
        moveCountRef.current = Math.max(0, moveCountRef.current - 1);
        callbacksRef.current.onMoveCountChange(moveCountRef.current);
        callbacksRef.current.onSolvedChange(scene.isSolved());
      }
      return didUndo;
    },
    solveNextMove: async () => {
      const scene = sceneRef.current;
      if (!scene) return { move: null, movesRemaining: 0 };
      controllerRef.current?.setEnabled(false);
      const before = scene.getUndoCount();
      try {
        return layerCount === 5 ? await applyNextGigaminxSolveMove(scene) : await applyNextKilominxFamilySolveMove(scene);
      } finally {
        reportSolveCommit(scene, before);
        controllerRef.current?.setEnabled(interactiveRef.current && !orbitModeRef.current);
      }
    },
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default DodecaView;
