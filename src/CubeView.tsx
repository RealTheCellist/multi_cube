import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { TwistyPlayer } from "cubing/twisty";
import { randomScrambleForEvent } from "cubing/scramble";
import { attachSwipeTurning, type SwipeTurningController } from "./swipeControls";
import { computeAndPlayNextSolveMove, type SolveHint } from "./solvePlayback";

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
}

const CubeView = forwardRef<CubeViewHandle, CubeViewProps>(function CubeView(
  { onMoveCountChange, onFirstMove, onSolvedChange, orbitMode },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwistyPlayer | null>(null);
  const hasMovedRef = useRef(false);
  const swipeControllerRef = useRef<SwipeTurningController | null>(null);
  const orbitModeRef = useRef(orbitMode);
  orbitModeRef.current = orbitMode;
  // The solve preview temporarily adds a move to the alg and then restores
  // the original — without this, that transient blip would count as the
  // user's "first move" (starting the timer) and could momentarily read as
  // solved, even though nothing actually changed once it reverts.
  const suppressStateCallbacksRef = useRef(false);

  const callbacksRef = useRef({ onMoveCountChange, onFirstMove, onSolvedChange });
  callbacksRef.current = { onMoveCountChange, onFirstMove, onSolvedChange };

  useEffect(() => {
    const player = new TwistyPlayer({
      puzzle: "3x3x3",
      visualization: "PG3D",
      background: "none",
      controlPanel: "none",
      hintFacelets: "none",
      experimentalDragInput: orbitModeRef.current ? "auto" : "none",
      cameraLatitude: 20,
    });
    player.style.width = "100%";
    player.style.height = "100%";
    playerRef.current = player;
    containerRef.current?.appendChild(player);

    let cancelled = false;
    attachSwipeTurning(player).then((controller) => {
      if (cancelled) {
        controller.detach();
        return;
      }
      controller.setEnabled(!orbitModeRef.current);
      swipeControllerRef.current = controller;
    });

    player.experimentalModel.alg.addFreshListener(({ alg }) => {
      if (suppressStateCallbacksRef.current) return;
      const count = [...alg.childAlgNodes()].length;
      callbacksRef.current.onMoveCountChange(count);
      if (count > 0 && !hasMovedRef.current) {
        hasMovedRef.current = true;
        callbacksRef.current.onFirstMove();
      }
    });

    player.experimentalModel.currentPattern.addFreshListener((pattern) => {
      if (suppressStateCallbacksRef.current) return;
      // Plain isIdentical() would consider an M/E/S-touched cube "unsolved"
      // even when every face is visually a single solid color again, since
      // an M/E/S move changes which internal CENTERS piece occupies each
      // slot (see solvePlayback.ts) even though same-colored centers are
      // visually indistinguishable from each other. experimentalIsSolved
      // ignores exactly that.
      callbacksRef.current.onSolvedChange(
        pattern.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true }),
      );
    });

    return () => {
      cancelled = true;
      swipeControllerRef.current?.detach();
      swipeControllerRef.current = null;
      player.remove();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.experimentalDragInput = orbitMode ? "auto" : "none";
    swipeControllerRef.current?.setEnabled(!orbitMode);
  }, [orbitMode]);

  useImperativeHandle(ref, () => ({
    scramble: async () => {
      const player = playerRef.current;
      if (!player) return;
      player.alg = "";
      hasMovedRef.current = false;
      const scramble = await randomScrambleForEvent("333");
      player.experimentalSetupAlg = scramble;
    },
    resetToSolved: () => {
      const player = playerRef.current;
      if (!player) return;
      player.alg = "";
      player.experimentalSetupAlg = "";
      hasMovedRef.current = false;
    },
    solveNextMove: async () => {
      const player = playerRef.current;
      if (!player) return { move: null, movesRemaining: 0 };
      swipeControllerRef.current?.setEnabled(false);
      player.experimentalDragInput = "none";
      suppressStateCallbacksRef.current = true;
      try {
        return await computeAndPlayNextSolveMove(player);
      } finally {
        suppressStateCallbacksRef.current = false;
        swipeControllerRef.current?.setEnabled(!orbitModeRef.current);
        player.experimentalDragInput = orbitModeRef.current ? "auto" : "none";
      }
    },
  }));

  return <div className="cube-view" ref={containerRef} />;
});

export default CubeView;
