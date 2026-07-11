import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CustomCubeScene } from "./customCube/CustomCubeScene";
import { attachCustomSwipeTurning, type CustomSwipeController } from "./customCube/customSwipeControls";
import { previewNextSolveMove } from "./customCube/customSolvePlayback";
import type { SolveHint } from "./solvePlayback";

export interface CubeViewHandle {
  scramble: () => Promise<void>;
  resetToSolved: () => void;
  solveNextMove: () => Promise<SolveHint>;
}

interface CubeViewProps {
  onMoveCountChange: (count: number) => void;
  onFirstMove: () => void;
  onSolvedChange: (solved: boolean) => void;
  orbitMode: boolean;
  gridSize: number;
}

const CubeView = forwardRef<CubeViewHandle, CubeViewProps>(function CubeView(
  { onMoveCountChange, onFirstMove, onSolvedChange, orbitMode, gridSize },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomCubeScene | null>(null);
  const controllerRef = useRef<CustomSwipeController | null>(null);
  const hasMovedRef = useRef(false);
  const moveCountRef = useRef(0);
  const orbitModeRef = useRef(orbitMode);
  orbitModeRef.current = orbitMode;

  const callbacksRef = useRef({ onMoveCountChange, onFirstMove, onSolvedChange });
  callbacksRef.current = { onMoveCountChange, onFirstMove, onSolvedChange };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    hasMovedRef.current = false;
    moveCountRef.current = 0;
    const scene = new CustomCubeScene(container, gridSize);
    sceneRef.current = scene;
    scene.setOrbitEnabled(orbitModeRef.current);

    const controller = attachCustomSwipeTurning(scene, moveCountRef);
    controller.setEnabled(!orbitModeRef.current);
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
    // gridSize intentionally triggers a full teardown/rebuild rather than an
    // in-place resize -- switching sizes is rare enough (an explicit picker,
    // not a drag) that rebuilding the whole scene is simpler than making
    // every mesh/geometry path handle a live size change.
  }, [gridSize]);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(orbitMode);
    controllerRef.current?.setEnabled(!orbitMode);
  }, [orbitMode]);

  useImperativeHandle(ref, () => ({
    scramble: async () => {
      hasMovedRef.current = false;
      moveCountRef.current = 0;
      sceneRef.current?.scramble();
      callbacksRef.current.onMoveCountChange(0);
    },
    resetToSolved: () => {
      hasMovedRef.current = false;
      moveCountRef.current = 0;
      sceneRef.current?.resetToSolved();
      callbacksRef.current.onMoveCountChange(0);
    },
    solveNextMove: async () => {
      const scene = sceneRef.current;
      if (!scene) return { move: null, movesRemaining: 0 };
      controllerRef.current?.setEnabled(false);
      try {
        return await previewNextSolveMove(scene);
      } finally {
        controllerRef.current?.setEnabled(!orbitModeRef.current);
      }
    },
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default CubeView;
