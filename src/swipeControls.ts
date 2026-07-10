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
  stickerDat: { axis: { coordinates: [number, number, number]; quantumMove: { family: string } }[] };
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

  // stickerDat.axis holds 26 entries on a 3x3x3: 6 outer-face axes (F/B/U/D/L/R,
  // single-letter families) plus 8 corner axes (whole-cube "rotation" moves,
  // e.g. UFR) and 12 edge axes (slice moves, e.g. UF, used for "secondSlice").
  // We only ever want outer-face turns here, so the argmax search below must
  // be restricted to the 6 single-letter entries — otherwise a touch point
  // anywhere near an edge or corner of the cube (extremely common) matches a
  // corner/edge axis instead, producing a nonsense in-plane basis and turning
  // the wrong slice entirely.
  const faceAxes = puzzleObj.stickerDat.axis.filter((axis) => axis.quantumMove.family.length === 1);

  const raycaster = new THREE.Raycaster();
  let drag: DragState | null = null;

  function ndcFromEvent(e: PointerEvent): THREE.Vector2 {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  // Finds the outer-face turn axis whose direction most closely matches
  // `target` (same argmax cubing.js itself uses internally to turn a click
  // into a move — reused here so we can feed it either the touched point or
  // a synthetic direction vector).
  function bestAxisFor(target: THREE.Vector3): [number, number, number] | null {
    let best: [number, number, number] | null = null;
    let bestDot = 0;
    for (const axis of faceAxes) {
      const d = target.dot(new THREE.Vector3(...axis.coordinates));
      if (d > bestDot) {
        bestDot = d;
        best = axis.coordinates;
      }
    }
    return best;
  }

  // Screen-space direction (Y flipped to match pointer coordinates) that a
  // point moves in when nudged slightly along `worldDir`.
  function screenDirFrom(point: THREE.Vector3, worldDir: THREE.Vector3): { x: number; y: number } {
    const p0 = point.clone().project(camera);
    const p1 = point.clone().add(worldDir.clone().multiplyScalar(0.1)).project(camera);
    return { x: p1.x - p0.x, y: -(p1.y - p0.y) };
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

  // Determines which move the swipe means and adds it to the alg, then
  // immediately rewinds to just before it so the subsequent scrub in
  // onPointerMove can play it back under the pointer.
  //
  // A swipe across a face doesn't just spin that face — dragging sideways
  // turns the horizontal layer (U/E/D) the touched sticker's row belongs to,
  // while dragging up/down turns the vertical layer (L/M/R) its column
  // belongs to (the classic virtual-cube gesture). So first we find the
  // touched face just to get its own in-plane basis {u, v}, then compare the
  // swipe direction (projected to screen space) against u and v: whichever
  // one the swipe aligns with, the move happens around the *other* axis —
  // rotating around v means the visible motion sweeps along u, and vice
  // versa. The touched point's position along that other axis (its sign)
  // picks which of the two opposite faces (e.g. U vs D) is meant.
  async function lockDrag(target: DragState, dx0: number, dy0: number) {
    const { point } = target;

    const touchedFaceAxis = bestAxisFor(point);
    if (!touchedFaceAxis) return;
    const faceNormal = new THREE.Vector3(...touchedFaceAxis).normalize();

    const reference = Math.abs(faceNormal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(reference, faceNormal).normalize();
    const v = new THREE.Vector3().crossVectors(faceNormal, u).normalize();

    const uScreen = screenDirFrom(point, u);
    const vScreen = screenDirFrom(point, v);
    const uMag = Math.hypot(uScreen.x, uScreen.y) || 1;
    const vMag = Math.hypot(vScreen.x, vScreen.y) || 1;
    const uAlign = Math.abs((uScreen.x * dx0 + uScreen.y * dy0) / uMag);
    const vAlign = Math.abs((vScreen.x * dx0 + vScreen.y * dy0) / vMag);

    const rotationAxisDir = uAlign >= vAlign ? v : u;

    // The touched sticker's offset along the rotation axis tells us which
    // layer it's in: near zero means the middle layer (M/E/S), otherwise an
    // outer layer (picked by sign, e.g. +X vs -X for R vs L). A 3x3 face
    // spans roughly [-faceDist, faceDist] split into 3 equal bands, so the
    // boundary between the middle band and an outer band sits at faceDist/3
    // — not faceDist/2, which would swallow a quarter of each outer
    // sticker's own territory into the middle-layer zone.
    const faceDist = Math.abs(point.dot(faceNormal));
    const alongAxis = point.dot(rotationAxisDir);
    const isMiddleLayer = Math.abs(alongAxis) < faceDist / 3;

    let moveString: string;
    if (isMiddleLayer) {
      const family =
        Math.abs(rotationAxisDir.x) > 0.5 ? "M" : Math.abs(rotationAxisDir.y) > 0.5 ? "E" : "S";
      const tangent = new THREE.Vector3().crossVectors(rotationAxisDir, point).normalize();
      const tangentScreen = screenDirFrom(point, tangent);
      // M/E/S follow a named face's convention (M~L, E~D, S~F) rather than
      // the raw right-hand-rule around their own positive axis, so their
      // "invert" sign runs opposite to the outer-layer moves below.
      const invert = tangentScreen.x * dx0 + tangentScreen.y * dy0 < 0;
      moveString = invert ? `${family}'` : family;
    } else {
      const sign = Math.sign(alongAxis) || 1;
      const targetVec = rotationAxisDir.clone().multiplyScalar(sign);

      const moveAxisCoords = bestAxisFor(targetVec);
      if (!moveAxisCoords) return;
      const moveAxisVec = new THREE.Vector3(...moveAxisCoords).normalize();
      const tangent = new THREE.Vector3().crossVectors(moveAxisVec, point).normalize();
      const tangentScreen = screenDirFrom(point, tangent);

      const invert = tangentScreen.x * dx0 + tangentScreen.y * dy0 > 0;
      const result = puzzleObj.getClosestMoveToAxis(targetVec, { invert, depth: "none" });
      if (!result?.move) return;
      moveString = result.move.toString();
    }

    const originalAlg = await player.experimentalGet.alg();
    player.timestamp = "end";
    const t0 = await player.experimentalGet.timestamp();
    player.experimentalAddMove(moveString);
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
