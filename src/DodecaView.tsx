import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Rng } from "./customCube/cubeState";
import { CustomDodecaScene } from "./customDodeca/CustomDodecaScene";
import { attachDodecaSwipeTurning, type DodecaSwipeController } from "./customDodeca/dodecaSwipeControls";
import { applyNextGigaminxSolveMove, type GigaminxSolveHint } from "./customDodeca/gigaminxSolvePlayback";

export interface DodecaViewHandle {
  scramble: (rng?: Rng) => void;
  resetToSolved: () => void;
  isSolved: () => boolean;
  undoLastMove: () => boolean;
  // Gigaminx (layerCount===5) only -- Kilominx/Megaminx/Master Kilominx
  // (N=2..4) have no solver yet, so this resolves to a no-op hint
  // (move: null) for those, same contract as a fully-solved puzzle.
  solveNextMove: () => Promise<GigaminxSolveHint>;
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

// solveNextMove exists only for Gigaminx (layerCount===5, see
// gigaminxSolvePlayback.ts) -- Kilominx/Megaminx/Master Kilominx (N=2..4)
// still have no solver, by explicit scope.
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
      if (!scene || layerCount !== 5) return { move: null, movesRemaining: 0 };
      controllerRef.current?.setEnabled(false);
      const before = scene.getUndoCount();
      try {
        return await applyNextGigaminxSolveMove(scene);
      } finally {
        reportSolveCommit(scene, before);
        controllerRef.current?.setEnabled(interactiveRef.current && !orbitModeRef.current);
      }
    },
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default DodecaView;
