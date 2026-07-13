import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CustomCubeScene } from "./customCube/CustomCubeScene";
import { attachCustomSwipeTurning, type CustomSwipeController } from "./customCube/customSwipeControls";
import { computeFourByFourSolveMoves, type Move, playFourByFourMove, previewNextSolveMove } from "./customCube/customSolvePlayback";
import type { SolveHint } from "./solvePlayback";

export interface FourByFourStepResult {
  done: boolean;
  solved: boolean;
  movesRemaining: number;
}

export interface CubeViewHandle {
  scramble: () => Promise<void>;
  resetToSolved: () => void;
  solveNextMove: () => Promise<SolveHint>;
  solveStepFourByFour: () => Promise<FourByFourStepResult>;
  isSolved: () => boolean;
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
  const fourByFourPlanRef = useRef<{ moves: Move[]; index: number; solved: boolean } | null>(null);

  const callbacksRef = useRef({ onMoveCountChange, onFirstMove, onSolvedChange });
  callbacksRef.current = { onMoveCountChange, onFirstMove, onSolvedChange };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    hasMovedRef.current = false;
    moveCountRef.current = 0;
    fourByFourPlanRef.current = null;
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
      fourByFourPlanRef.current = null;
      sceneRef.current?.scramble();
      callbacksRef.current.onMoveCountChange(0);
    },
    resetToSolved: () => {
      hasMovedRef.current = false;
      moveCountRef.current = 0;
      fourByFourPlanRef.current = null;
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
    solveStepFourByFour: async () => {
      const scene = sceneRef.current;
      if (!scene) return { done: true, solved: false, movesRemaining: 0 };
      controllerRef.current?.setEnabled(false);
      try {
        let plan = fourByFourPlanRef.current;
        if (!plan) {
          const computed = await computeFourByFourSolveMoves(scene);
          plan = { moves: computed.moves, index: 0, solved: computed.solved };
          fourByFourPlanRef.current = plan;
        }
        if (plan.index >= plan.moves.length) {
          fourByFourPlanRef.current = null;
          return { done: true, solved: plan.solved, movesRemaining: 0 };
        }
        await playFourByFourMove(scene, plan.moves[plan.index]);
        plan.index++;
        const movesRemaining = plan.moves.length - plan.index;
        if (movesRemaining === 0) callbacksRef.current.onSolvedChange(scene.isSolved());
        return { done: false, solved: plan.solved, movesRemaining };
      } finally {
        controllerRef.current?.setEnabled(!orbitModeRef.current);
      }
    },
    isSolved: () => sceneRef.current?.isSolved() ?? false,
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default CubeView;
