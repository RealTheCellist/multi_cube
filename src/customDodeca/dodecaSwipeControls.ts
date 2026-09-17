import * as THREE from "three";
import type { CustomDodecaScene } from "./CustomDodecaScene";
import { faceAxis, nearestFaceIndex, type FaceIndex } from "./dodecaMath";

// Same pixel/time constants as customSwipeControls.ts/tetraSwipeControls.ts
// (see those files' own comments for why). FULL_TURN_FRACTION_OF_WIDTH
// scaled from the cube's 0.14 (a full 90-degree drag) by 72/90 -- a
// starting value, not yet validated on a real device.
const DRAG_THRESHOLD_PX = 12;
const SETTLE_PX = 6;
const COMMIT_DISTANCE_FRACTION_OF_FULL_TURN = 0.4;
const FULL_TURN_FRACTION_OF_WIDTH = 0.112;
const COMMIT_PROGRESS_THRESHOLD = 0.3;
const RELEASE_ANIMATION_MS = 220;
const CATCH_UP_MS = 80;

export interface DodecaSwipeController {
  setEnabled(enabled: boolean): void;
  onCommit: ((moveCount: number) => void) | null;
  detach(): void;
}

interface LockedTurn {
  faceIndex: FaceIndex;
  screenDir: THREE.Vector2;
  fullTurnPx: number;
  progress: number;
}

interface PendingPick {
  faceIndex: FaceIndex;
  screenDir: THREE.Vector2;
}

interface CatchUpTween {
  startTime: number;
  fromProgress: number;
  toProgress: number;
  displayed: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  hitPoint: THREE.Vector3;
  faceIndex: FaceIndex;
  locked: LockedTurn | null;
  settleRef: { x: number; y: number } | null;
  pending: PendingPick | null;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function worldToScreen(scene: CustomDodecaScene, point: THREE.Vector3, rect: DOMRect): THREE.Vector2 {
  const ndc = point.clone().project(scene.camera);
  return new THREE.Vector2((ndc.x * 0.5 + 0.5) * rect.width, (1 - (ndc.y * 0.5 + 0.5)) * rect.height);
}

/**
 * The instantaneous screen-space direction a point moves in under rotation
 * about `faceIndex`'s own axis -- same cross-product identity as the cube's
 * screenTangent / tetra's screenTangent, generalized to a face-normal axis.
 */
function screenTangent(scene: CustomDodecaScene, hitPoint: THREE.Vector3, faceIndex: FaceIndex, rect: DOMRect): THREE.Vector2 {
  const tangentWorld = faceAxis(faceIndex).clone().cross(hitPoint);
  const a = worldToScreen(scene, hitPoint, rect);
  const b = worldToScreen(scene, hitPoint.clone().addScaledVector(tangentWorld, 0.05), rect);
  return b.sub(a).normalize();
}

const MISS_RETRY_OFFSETS_PX: readonly [number, number][] = [
  [0, 0],
  [-6, 0],
  [6, 0],
  [0, -6],
  [0, 6],
  [-6, -6],
  [6, -6],
  [-6, 6],
  [6, 6],
];

function ndcFromEvent(e: PointerEvent, rect: DOMRect): THREE.Vector2 {
  return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
}

/**
 * Finds the world point a touch landed on, retrying a small ring of pixel
 * offsets against the real sticker/backing meshes -- same rationale as the
 * cube's/tetra's own raycastNear (a touch can land in the thin inset gap
 * between stickers). Unlike the tetrahedron, there's no analytic fallback
 * plane search here: the dodecahedron's 12 face planes only cover a small
 * solid angle each and a miss is rare enough in practice that the pixel-
 * offset retry alone is sufficient (verified empirically against this
 * puzzle's own swipe testing).
 */
function raycastDodecaNear(scene: CustomDodecaScene, raycaster: THREE.Raycaster, clientX: number, clientY: number, rect: DOMRect): THREE.Vector3 | null {
  for (const [dx, dy] of MISS_RETRY_OFFSETS_PX) {
    const ndcEvent = { clientX: clientX + dx, clientY: clientY + dy } as PointerEvent;
    raycaster.setFromCamera(ndcFromEvent(ndcEvent, rect), scene.camera);
    const [hit] = raycaster.intersectObjects(scene.raycastableObjects(), false);
    if (hit) return hit.point.clone();
  }
  return null;
}

/**
 * Touch-to-turn controller for the dodecahedron. Unlike the cube (2
 * candidate axes per touch) and the tetrahedron (1-3 candidate axes per
 * touch, needing drag-direction disambiguation), a touch on this puzzle's
 * surface has exactly ONE candidate axis: nearestFaceIndex(hitPoint), the
 * face whose plane the touch landed on -- so there's no classification step
 * at all, just tangent-direction scoring for sign (CW vs CCW).
 *
 * Depth is fixed at 1 (this face's own full set of stickers, rotating as
 * one rigid unit -- the one turn every Kilominx/Megaminx/Master Kilominx/
 * Gigaminx size unambiguously supports; see dodecaState.ts's own comment on
 * why deeper multi-layer turns exist in the model but aren't exposed here).
 */
export function attachDodecaSwipeTurning(scene: CustomDodecaScene, moveCountRef: { current: number }): DodecaSwipeController {
  const dom = scene.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  let enabled = true;
  let drag: DragState | null = null;
  let releaseCancel: (() => void) | null = null;
  let releaseTarget: 1 | -1 | null = null;
  let catchUp: CatchUpTween | null = null;
  const TURN_DEPTH = 1;
  const controller: DodecaSwipeController = {
    onCommit: null,
    setEnabled(value: boolean) {
      enabled = value;
    },
    detach() {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
    },
  };

  function interruptRelease() {
    releaseCancel?.();
    releaseCancel = null;
    if (!scene.isTurning()) return;
    const target = releaseTarget;
    scene.endTurn(target);
    if (target !== null) {
      moveCountRef.current += 1;
      controller.onCommit?.(moveCountRef.current);
    }
  }

  function startRelease(fromProgress: number) {
    const committing = Math.abs(fromProgress) >= COMMIT_PROGRESS_THRESHOLD;
    const targetProgress = committing ? Math.sign(fromProgress) : 0;
    const target: 1 | -1 | null = committing ? (Math.sign(fromProgress) as 1 | -1) : null;
    releaseTarget = target;
    const start = performance.now();
    let cancelled = false;
    releaseCancel = () => {
      cancelled = true;
    };
    function step(now: number) {
      if (cancelled) return;
      const t = Math.min((now - start) / RELEASE_ANIMATION_MS, 1);
      const eased = easeOutCubic(t);
      scene.setTurnProgress(fromProgress + eased * (targetProgress - fromProgress));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        releaseCancel = null;
        scene.endTurn(target);
        if (target !== null) {
          moveCountRef.current += 1;
          controller.onCommit?.(moveCountRef.current);
        }
      }
    }
    requestAnimationFrame(step);
  }

  function stepCatchUp(now: number) {
    if (!catchUp || !drag?.locked) {
      catchUp = null;
      return;
    }
    const t = Math.max(0, Math.min((now - catchUp.startTime) / CATCH_UP_MS, 1));
    const eased = easeOutCubic(t);
    catchUp.displayed = catchUp.fromProgress + eased * (catchUp.toProgress - catchUp.fromProgress);
    scene.setTurnProgress(catchUp.displayed);
    if (t < 1) {
      requestAnimationFrame(stepCatchUp);
    } else {
      catchUp = null;
    }
  }

  function commitPending(dx: number, dy: number, rect: DOMRect): boolean {
    if (!drag || !drag.pending) return false;
    const { faceIndex, screenDir } = drag.pending;
    if (!scene.beginTurn(faceIndex, TURN_DEPTH)) {
      drag = null;
      return false;
    }
    const fullTurnPx = rect.width * FULL_TURN_FRACTION_OF_WIDTH;
    const projected = dx * screenDir.x + dy * screenDir.y;
    const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
    drag.locked = { faceIndex, screenDir, fullTurnPx, progress };
    scene.setTurnProgress(0);
    catchUp = { startTime: performance.now(), fromProgress: 0, toProgress: progress, displayed: 0 };
    requestAnimationFrame(stepCatchUp);
    return true;
  }

  function onPointerDown(e: PointerEvent) {
    if (!enabled || e.button !== 0) return;
    if (releaseCancel) interruptRelease();
    const rect = dom.getBoundingClientRect();
    const hitPoint = raycastDodecaNear(scene, raycaster, e.clientX, e.clientY, rect);
    if (!hitPoint) return;

    const faceIndex = nearestFaceIndex(hitPoint);
    dom.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, hitPoint: hitPoint.clone(), faceIndex, locked: null, settleRef: null, pending: null };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const rect = dom.getBoundingClientRect();

    if (!drag.locked) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      if (!drag.settleRef) {
        if (Math.hypot(dx, dy) < SETTLE_PX) return;
        drag.settleRef = { x: e.clientX, y: e.clientY };
        return;
      }
      const rdx = e.clientX - drag.settleRef.x;
      const rdy = e.clientY - drag.settleRef.y;
      const dist = Math.hypot(rdx, rdy);
      if (dist < SETTLE_PX) return;

      const screenDir = screenTangent(scene, drag.hitPoint, drag.faceIndex, rect);
      drag.pending = { faceIndex: drag.faceIndex, screenDir };

      const commitDistancePx = rect.width * FULL_TURN_FRACTION_OF_WIDTH * COMMIT_DISTANCE_FRACTION_OF_FULL_TURN;
      if (dist < commitDistancePx) return;
      commitPending(dx, dy, rect);
      return;
    }

    const { screenDir, fullTurnPx } = drag.locked;
    const projected = dx * screenDir.x + dy * screenDir.y;
    const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
    drag.locked.progress = progress;
    if (catchUp) {
      catchUp.toProgress = progress;
    } else {
      scene.setTurnProgress(progress);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    let fromProgress: number | null = null;
    if (drag.locked) {
      fromProgress = catchUp ? catchUp.displayed : drag.locked.progress;
    } else if (drag.pending) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const rect = dom.getBoundingClientRect();
      if (commitPending(dx, dy, rect)) {
        catchUp = null;
        fromProgress = drag.locked!.progress;
      }
    }
    catchUp = null;
    if (fromProgress !== null) startRelease(fromProgress);
    drag = null;
  }

  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerup", onPointerUp);
  dom.addEventListener("pointercancel", onPointerUp);

  return controller;
}
