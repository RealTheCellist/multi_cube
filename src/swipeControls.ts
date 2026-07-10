import * as THREE from "three";
import type { Alg } from "cubing/alg";
import type { ExperimentalMillisecondTimestamp, TwistyPlayer } from "cubing/twisty";

// Duck-typed view of cubing.js's internal PG3D puzzle object. Not part of the
// public API surface, but it's the only way to reach per-axis turn data for
// swipe-direction resolution (see raycastMove/getClosestMoveToAxis in
// cubing.js's own Twisty3DPuzzleWrapper for the click-based equivalent).
interface PG3DLike extends THREE.Object3D {
  experimentalGetControlTargets(): THREE.Object3D[];
  getClosestMoveToAxis(
    point: THREE.Vector3,
    transformations: { invert: boolean; depth: "none" | "secondSlice" | "rotation" },
  ): { move: { toString(): string } } | null;
  stickerDat: { axis: { coordinates: [number, number, number] }[] };
}

const DRAG_THRESHOLD_PX = 12;
const FULL_TURN_FRACTION_OF_WIDTH = 0.22;
const COMMIT_PROGRESS_THRESHOLD = 0.5;

// experimentalCurrentVantages()/experimentalCurrentCanvases() only return
// results once TwistyPlayer's internal visualization wrapper has finished
// setting up, which happens a tick or two after construction. Poll briefly
// rather than racing it.
async function waitForNonEmpty<T>(getter: () => Promise<T[]>, timeoutMs = 5000): Promise<T[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await getter();
    if (result.length > 0) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return [];
}

interface LockedTurn {
  dragDirX: number;
  dragDirY: number;
  fullTurnPx: number;
  t0: number;
  t1: number;
  originalAlg: Alg;
  progress: number;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  point: THREE.Vector3;
  lockingPromise: Promise<void> | null;
  locked: LockedTurn | null;
}

/**
 * Wires up real swipe-to-turn gestures on a TwistyPlayer's canvas, bypassing
 * cubing.js's built-in interaction (which only supports camera-orbit drags
 * and stationary clicks, not swipe-to-turn). The player must be configured
 * with `visualization: "PG3D"` (the default "3D" strategy for 3x3x3 has no
 * raycasting support at all) and `experimentalDragInput: "none"` so its own
 * DragTracker never attaches competing listeners to the same canvas.
 *
 * On pointerdown we raycast to find the sticker/axis under the cursor. Once
 * the drag crosses a small threshold, we pick the move (face + CW/CCW) from
 * the initial swipe direction, add it to the alg, and immediately scrub
 * `player.timestamp` between the pre-move and post-move timestamps in sync
 * with how far the pointer has moved — so the face visibly follows the
 * finger instead of snapping only on release. On release we either finish
 * the scrub to the end (commit) or jump back and drop the move (abort),
 * depending on whether the user dragged past the halfway point.
 */
export async function attachSwipeTurning(player: TwistyPlayer): Promise<() => void> {
  const [canvas] = await waitForNonEmpty(() => player.experimentalCurrentCanvases());
  const [vantage] = await waitForNonEmpty(async () => [...(await player.experimentalCurrentVantages())]);
  if (!canvas || !vantage) return () => {};

  const camera = await vantage.camera();
  const puzzleObj = (await player.experimentalCurrentThreeJSPuzzleObject()) as unknown as PG3DLike;
  if (!("experimentalGetControlTargets" in puzzleObj)) return () => {};

  canvas.style.touchAction = "none";

  const raycaster = new THREE.Raycaster();
  let drag: DragState | null = null;

  function ndcFromEvent(e: PointerEvent): THREE.Vector2 {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  function onPointerDown(e: PointerEvent) {
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    const [hit] = raycaster.intersectObjects(puzzleObj.experimentalGetControlTargets(), true);
    if (!hit) {
      drag = null;
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    drag = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      point: hit.point.clone(),
      lockingPromise: null,
      locked: null,
    };
  }

  // Determines which move the swipe means (from the initial direction) and
  // adds it to the alg, then immediately rewinds to just before it so the
  // subsequent scrub in onPointerMove can play it back under the pointer.
  async function lockDrag(target: DragState, dx0: number, dy0: number) {
    const { point } = target;

    let bestAxisCoords: [number, number, number] | null = null;
    let bestDot = 0;
    for (const axis of puzzleObj.stickerDat.axis) {
      const axisVec = new THREE.Vector3(...axis.coordinates);
      const d = point.dot(axisVec);
      if (d > bestDot) {
        bestDot = d;
        bestAxisCoords = axis.coordinates;
      }
    }
    if (!bestAxisCoords) return;

    const axisVec = new THREE.Vector3(...bestAxisCoords).normalize();
    const tangent = new THREE.Vector3().crossVectors(axisVec, point).normalize();

    const p0 = point.clone().project(camera);
    const p1 = point.clone().add(tangent.multiplyScalar(0.1)).project(camera);
    const screenDirX = p1.x - p0.x;
    const screenDirY = -(p1.y - p0.y);

    const invert = screenDirX * dx0 + screenDirY * dy0 < 0;
    const result = puzzleObj.getClosestMoveToAxis(point, { invert, depth: "none" });
    if (!result?.move) return;

    const originalAlg = await player.experimentalGet.alg();
    player.timestamp = "end";
    const t0 = await player.experimentalGet.timestamp();
    player.experimentalAddMove(result.move.toString());
    player.pause();
    player.timestamp = "end";
    const t1 = await player.experimentalGet.timestamp();
    player.timestamp = t0;

    if (drag !== target) return; // pointer released/canceled while we were awaiting

    const dragMag = Math.hypot(dx0, dy0) || 1;
    const rect = canvas.getBoundingClientRect();
    target.locked = {
      dragDirX: dx0 / dragMag,
      dragDirY: dy0 / dragMag,
      fullTurnPx: Math.max(40, rect.width * FULL_TURN_FRACTION_OF_WIDTH),
      t0,
      t1,
      originalAlg,
      progress: 0,
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    if (!drag.locked) {
      if (drag.lockingPromise || Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      const target = drag;
      target.lockingPromise = lockDrag(target, dx, dy).then(() => {
        if (drag === target) target.lockingPromise = null;
      });
      return;
    }

    const locked = drag.locked;
    const projected = dx * locked.dragDirX + dy * locked.dragDirY;
    locked.progress = Math.min(Math.max(projected / locked.fullTurnPx, 0), 1);
    const scrubbed = locked.t0 + locked.progress * (locked.t1 - locked.t0);
    player.timestamp = scrubbed as ExperimentalMillisecondTimestamp;
  }

  async function finishDrag(target: DragState) {
    if (target.lockingPromise) await target.lockingPromise;
    const locked = target.locked;
    if (!locked) return;
    if (locked.progress >= COMMIT_PROGRESS_THRESHOLD) {
      player.timestamp = "end";
    } else {
      player.timestamp = locked.t0 as ExperimentalMillisecondTimestamp;
      player.alg = locked.originalAlg;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const target = drag;
    drag = null;
    void finishDrag(target);
  }

  function onPointerCancel(e: PointerEvent) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const target = drag;
    drag = null;
    // Treat a cancel like an abort: force progress to 0 so finishDrag reverts.
    if (target.locked) target.locked.progress = 0;
    void finishDrag(target);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
  };
}
