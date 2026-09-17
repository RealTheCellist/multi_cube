import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Rng } from "./customCube/cubeState";
import { CustomDodecaScene } from "./customDodeca/CustomDodecaScene";
import { attachDodecaSwipeTurning, type DodecaSwipeController } from "./customDodeca/dodecaSwipeControls";

export interface DodecaViewHandle {
  scramble: (rng?: Rng) => void;
  resetToSolved: () => void;
  isSolved: () => boolean;
  undoLastMove: () => boolean;
}

interface DodecaViewProps {
  onMoveCountChange: (count: number) => void;
  onFirstMove: () => void;
  onSolvedChange: (solved: boolean) => void;
  // 2 (Kilominx) through 5 (Gigaminx).
  layerCount: number;
  // Same spirit as TetraView's `interactive` -- the home screen's static preview.
  interactive?: boolean;
}

// No solveNextMove here (unlike TetraView/CubeView) -- this puzzle family is
// geometry + rendering + manual turning only, by explicit scope; there is no
// N=2..5 dodecahedron solver.
const DodecaView = forwardRef<DodecaViewHandle, DodecaViewProps>(function DodecaView(
  { onMoveCountChange, onFirstMove, onSolvedChange, layerCount, interactive = true },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomDodecaScene | null>(null);
  const controllerRef = useRef<DodecaSwipeController | null>(null);
  const hasMovedRef = useRef(false);
  const moveCountRef = useRef(0);
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

    const controller = attachDodecaSwipeTurning(scene, moveCountRef);
    controller.setEnabled(interactiveRef.current);
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
    controllerRef.current?.setEnabled(interactive);
  }, [interactive]);

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
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default DodecaView;
