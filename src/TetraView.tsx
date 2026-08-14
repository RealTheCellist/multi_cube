import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Rng } from "./customCube/cubeState";
import { CustomTetraScene } from "./customTetra/CustomTetraScene";
import { attachTetraSwipeTurning, type TetraSwipeController } from "./customTetra/tetraSwipeControls";

export interface TetraViewHandle {
  scramble: (rng?: Rng) => void;
  resetToSolved: () => void;
  isSolved: () => boolean;
  undoLastMove: () => boolean;
}

interface TetraViewProps {
  onMoveCountChange: (count: number) => void;
  onFirstMove: () => void;
  onSolvedChange: (solved: boolean) => void;
  // 3 (Pyraminx) through 6 (Royal Pyraminx) -- all four are already fully
  // general in the model/rendering/gesture layers (verified for every N in
  // earlier phases), so this is just which one the player picked.
  layerCount: number;
  // Fully static, non-turnable preview (the home screen's decorative
  // shape) -- same spirit as CubeView's `interactive` prop. There's no
  // orbitMode/`둘러보기` equivalent here: CustomTetraScene has no
  // OrbitControls integration at all yet (its camera is a fixed, validated
  // framing), so that's a later addition, not this pass.
  interactive?: boolean;
}

const TetraView = forwardRef<TetraViewHandle, TetraViewProps>(function TetraView(
  { onMoveCountChange, onFirstMove, onSolvedChange, layerCount, interactive = true },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomTetraScene | null>(null);
  const controllerRef = useRef<TetraSwipeController | null>(null);
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
    const scene = new CustomTetraScene(container, layerCount);
    sceneRef.current = scene;

    const controller = attachTetraSwipeTurning(scene, moveCountRef);
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
    // layerCount changing forces a full teardown/rebuild, same rationale as
    // CubeView's gridSize dependency -- switching sizes is a rare, explicit
    // picker action, not a live resize.
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

export default TetraView;
