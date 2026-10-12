import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Rng } from "./customCube/cubeState";
import { CustomTetraScene } from "./customTetra/CustomTetraScene";
import { attachTetraSwipeTurning, type TetraSwipeController } from "./customTetra/tetraSwipeControls";
import { applyNextTetraSolveMove, type TetraSolveHint } from "./customTetra/tetraSolvePlayback";
import { applyNextMasterTetraSolveMove } from "./customTetra/masterTetraSolveAsync";
import { applyNextRoyalPyraminxSolveMove } from "./solver/n6/royalPyraminxSolveAsync";

export interface TetraViewHandle {
  scramble: (rng?: Rng) => void;
  resetToSolved: () => void;
  isSolved: () => boolean;
  undoLastMove: () => boolean;
  solveNextMove: () => Promise<TetraSolveHint>;
}

interface TetraViewProps {
  onMoveCountChange: (count: number) => void;
  onFirstMove: () => void;
  onSolvedChange: (solved: boolean) => void;
  // 3 (Pyraminx) through 6 (Royal Pyraminx) -- all four are already fully
  // general in the model/rendering/gesture layers (verified for every N in
  // earlier phases), so this is just which one the player picked.
  layerCount: number;
  orbitMode: boolean;
  // Fully static, non-orbit, non-turnable preview (the home screen's
  // decorative shape) -- same spirit as CubeView's `interactive` prop,
  // distinct from orbitMode, which still lets the user drag to look around.
  interactive?: boolean;
}

const TetraView = forwardRef<TetraViewHandle, TetraViewProps>(function TetraView(
  { onMoveCountChange, onFirstMove, onSolvedChange, layerCount, orbitMode, interactive = true },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomTetraScene | null>(null);
  const controllerRef = useRef<TetraSwipeController | null>(null);
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
    const scene = new CustomTetraScene(container, layerCount);
    sceneRef.current = scene;
    scene.setOrbitEnabled(interactiveRef.current && orbitModeRef.current);

    const controller = attachTetraSwipeTurning(scene, moveCountRef);
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
    // layerCount changing forces a full teardown/rebuild, same rationale as
    // CubeView's gridSize dependency -- switching sizes is a rare, explicit
    // picker action, not a live resize.
  }, [layerCount]);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(interactive && orbitMode);
    controllerRef.current?.setEnabled(interactive && !orbitMode);
  }, [orbitMode, interactive]);

  // Solve-hint presses commit the move for real, exactly like a swipe --
  // same reportSolveCommit contract as CubeView, using the scene's own
  // undo-count delta rather than assuming +1 (a tetra hint move is always
  // exactly one turn today, but this stays correct if that ever changes).
  function reportSolveCommit(scene: CustomTetraScene, before: number): void {
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
      if (!scene) return { move: null, movesRemaining: 0 };
      controllerRef.current?.setEnabled(false);
      const before = scene.getUndoCount();
      try {
        // 3-layer Pyraminx has a dedicated fast solver (cubing.js's own);
        // N=4/5 (Master/Professor Pyraminx) go through the from-scratch
        // bidirectional-BFS solver (see masterTetraminxSolver.ts for why --
        // neither a generic solver nor a hand-built commutator library
        // worked for those); N=6 (Royal Pyraminx) has its own dedicated
        // 100%-guaranteed piece-level pipeline instead (see
        // src/solver/n6/royalPyraminxSolver.ts -- N=6's axial+center orbit
        // structure made the N=4/5 bidirectional search too slow/unreliable
        // to reuse directly).
        return await (layerCount === 3
          ? applyNextTetraSolveMove(scene)
          : layerCount === 6
            ? applyNextRoyalPyraminxSolveMove(scene)
            : applyNextMasterTetraSolveMove(scene));
      } finally {
        reportSolveCommit(scene, before);
        controllerRef.current?.setEnabled(interactiveRef.current && !orbitModeRef.current);
      }
    },
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default TetraView;
