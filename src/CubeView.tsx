import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CustomCubeScene } from "./customCube/CustomCubeScene";
import { attachCustomSwipeTurning, type CustomSwipeController } from "./customCube/customSwipeControls";
import {
  applyNextFiveByFiveMove,
  applyNextFourByFourMove,
  applyNextSolveMove,
  type FiveByFiveHint,
  type FourByFourHint,
} from "./customCube/customSolvePlayback";
import type { Rng } from "./customCube/cubeState";
import type { SolveHint } from "./solvePlayback";

export interface CubeViewHandle {
  scramble: (rng?: Rng) => Promise<void>;
  resetToSolved: () => void;
  solveNextMove: () => Promise<SolveHint>;
  solveNextFourByFour: () => Promise<FourByFourHint>;
  solveNextFiveByFive: () => Promise<FiveByFiveHint>;
  isSolved: () => boolean;
  undoLastMove: () => boolean;
}

interface CubeViewProps {
  onMoveCountChange: (count: number) => void;
  onFirstMove: () => void;
  onSolvedChange: (solved: boolean) => void;
  orbitMode: boolean;
  gridSize: number;
  // Fully static, non-orbit, non-turnable preview (the home screen's
  // decorative cube) -- distinct from orbitMode, which still lets the
  // user drag to look around.
  interactive?: boolean;
  // When set, the freshly-created scene is scrambled with this RNG
  // immediately on mount (before first paint) instead of starting solved --
  // the daily mission flow's way of starting already on today's fixed
  // puzzle. Deliberately read via a ref inside the SAME effect that builds
  // the scene rather than left for a separate caller-side effect to apply
  // after the fact: a parent effect calling the exposed `scramble()` handle
  // right after this component mounts is NOT reliably ordered after this
  // scene-creation effect in practice (confirmed by hand -- the parent-effect
  // version silently no-opped against a scene that either wasn't there yet
  // or was about to be replaced), so this has to happen inside the one
  // effect that owns the scene's full lifecycle.
  initialScrambleRng?: Rng;
}

const CubeView = forwardRef<CubeViewHandle, CubeViewProps>(function CubeView(
  { onMoveCountChange, onFirstMove, onSolvedChange, orbitMode, gridSize, interactive = true, initialScrambleRng },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomCubeScene | null>(null);
  const controllerRef = useRef<CustomSwipeController | null>(null);
  const hasMovedRef = useRef(false);
  const moveCountRef = useRef(0);
  const orbitModeRef = useRef(orbitMode);
  orbitModeRef.current = orbitMode;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const initialScrambleRngRef = useRef(initialScrambleRng);
  initialScrambleRngRef.current = initialScrambleRng;

  const callbacksRef = useRef({ onMoveCountChange, onFirstMove, onSolvedChange });
  callbacksRef.current = { onMoveCountChange, onFirstMove, onSolvedChange };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    hasMovedRef.current = false;
    moveCountRef.current = 0;
    const scene = new CustomCubeScene(container, gridSize);
    sceneRef.current = scene;
    if (initialScrambleRngRef.current) scene.scramble(initialScrambleRngRef.current);
    scene.setOrbitEnabled(interactiveRef.current && orbitModeRef.current);

    const controller = attachCustomSwipeTurning(scene, moveCountRef);
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
    // gridSize intentionally triggers a full teardown/rebuild rather than an
    // in-place resize -- switching sizes is rare enough (an explicit picker,
    // not a drag) that rebuilding the whole scene is simpler than making
    // every mesh/geometry path handle a live size change.
  }, [gridSize]);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(interactive && orbitMode);
    controllerRef.current?.setEnabled(interactive && !orbitMode);
  }, [orbitMode, interactive]);

  // Solve-hint presses now actually commit the move (see customSolvePlayback.ts)
  // instead of a preview-then-revert -- so, exactly like a real swipe commit,
  // they must feed moveCount/onFirstMove/onSolvedChange too. A hint move can
  // apply more than one quarter turn in a single press (e.g. a "R2" hint),
  // so the applied count comes from the scene's own undo-stack delta rather
  // than assuming +1.
  function reportSolveCommit(scene: CustomCubeScene, before: number): void {
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
    scramble: async (rng?: Rng) => {
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
    solveNextMove: async () => {
      const scene = sceneRef.current;
      if (!scene) return { move: null, movesRemaining: 0 };
      controllerRef.current?.setEnabled(false);
      const before = scene.getUndoCount();
      try {
        return await applyNextSolveMove(scene);
      } finally {
        reportSolveCommit(scene, before);
        controllerRef.current?.setEnabled(interactiveRef.current && !orbitModeRef.current);
      }
    },
    solveNextFourByFour: async () => {
      const scene = sceneRef.current;
      if (!scene) return { hasMove: false, movesRemaining: 0, solved: false };
      controllerRef.current?.setEnabled(false);
      const before = scene.getUndoCount();
      try {
        return await applyNextFourByFourMove(scene);
      } finally {
        reportSolveCommit(scene, before);
        controllerRef.current?.setEnabled(interactiveRef.current && !orbitModeRef.current);
      }
    },
    solveNextFiveByFive: async () => {
      const scene = sceneRef.current;
      if (!scene) return { hasMove: false, movesRemaining: 0, solved: false };
      controllerRef.current?.setEnabled(false);
      const before = scene.getUndoCount();
      try {
        return await applyNextFiveByFiveMove(scene);
      } finally {
        reportSolveCommit(scene, before);
        controllerRef.current?.setEnabled(interactiveRef.current && !orbitModeRef.current);
      }
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

export default CubeView;
