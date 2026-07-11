import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CustomCubeScene } from "./customCube/CustomCubeScene";
import { attachCustomSwipeTurning, type CustomSwipeController } from "./customCube/customSwipeControls";
import type { CubeViewHandle } from "./CubeView";

interface CustomCubeViewProps {
  onMoveCountChange: (count: number) => void;
  onFirstMove: () => void;
  onSolvedChange: (solved: boolean) => void;
  orbitMode: boolean;
}

const CustomCubeView = forwardRef<CubeViewHandle, CustomCubeViewProps>(function CustomCubeView(
  { onMoveCountChange, onFirstMove, onSolvedChange, orbitMode },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomCubeScene | null>(null);
  const controllerRef = useRef<CustomSwipeController | null>(null);
  const hasMovedRef = useRef(false);
  const orbitModeRef = useRef(orbitMode);
  orbitModeRef.current = orbitMode;

  const callbacksRef = useRef({ onMoveCountChange, onFirstMove, onSolvedChange });
  callbacksRef.current = { onMoveCountChange, onFirstMove, onSolvedChange };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new CustomCubeScene(container);
    sceneRef.current = scene;
    scene.setOrbitEnabled(orbitModeRef.current);

    const moveCountRef = { current: 0 };
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
  }, []);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(orbitMode);
    controllerRef.current?.setEnabled(!orbitMode);
  }, [orbitMode]);

  useImperativeHandle(ref, () => ({
    scramble: async () => {
      hasMovedRef.current = false;
      sceneRef.current?.scramble();
      callbacksRef.current.onMoveCountChange(0);
    },
    resetToSolved: () => {
      hasMovedRef.current = false;
      sceneRef.current?.resetToSolved();
      callbacksRef.current.onMoveCountChange(0);
    },
    solveNextMove: async () => {
      // Solver-hint preview isn't implemented in this prototype renderer yet.
      return { move: null, movesRemaining: 0 };
    },
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default CustomCubeView;
