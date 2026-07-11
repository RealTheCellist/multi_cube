import * as THREE from "three";
import type { CustomCubeScene } from "./CustomCubeScene";
import { type Axis, axisVector } from "./cubeMath";

const DRAG_THRESHOLD_PX = 12;
// How much of the canvas width a full 90-degree drag needs to cover -- see
// the analogous constant (and its rationale) in ../swipeControls.ts. Reused
// verbatim here for a fair A/B comparison between the two renderers.
const FULL_TURN_FRACTION_OF_WIDTH = 0.14;
const COMMIT_PROGRESS_THRESHOLD = 0.3;
const RELEASE_ANIMATION_MS = 220;

export interface CustomSwipeController {
  setEnabled(enabled: boolean): void;
  onCommit: ((moveCount: number) => void) | null;
  detach(): void;
}

interface Candidate {
  axis: Axis;
  layer: 1 | -1;
  screenDir: THREE.Vector2;
}

interface LockedTurn {
  axis: Axis;
  layer: 1 | -1;
  screenDir: THREE.Vector2;
  fullTurnPx: number;
  progress: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  candidates: [Candidate, Candidate] | null;
  locked: LockedTurn | null;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function worldToScreen(scene: CustomCubeScene, point: THREE.Vector3, rect: DOMRect): THREE.Vector2 {
  const ndc = point.clone().project(scene.camera);
  return new THREE.Vector2((ndc.x * 0.5 + 0.5) * rect.width, (1 - (ndc.y * 0.5 + 0.5)) * rect.height);
}

function screenTangent(scene: CustomCubeScene, hitPoint: THREE.Vector3, axis: Axis, rect: DOMRect): THREE.Vector2 {
  const tangentWorld = axisVector(axis).clone().cross(hitPoint);
  const a = worldToScreen(scene, hitPoint, rect);
  const b = worldToScreen(scene, hitPoint.clone().addScaledVector(tangentWorld, 0.05), rect);
  return b.sub(a).normalize();
}

export function attachCustomSwipeTurning(scene: CustomCubeScene, moveCountRef: { current: number }): CustomSwipeController {
  const dom = scene.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  let enabled = true;
  let drag: DragState | null = null;
  let releaseCancel: (() => void) | null = null;
  let releaseTarget: 1 | -1 | null = null;
  const controller: CustomSwipeController = {
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

  function ndcFromEvent(e: PointerEvent, rect: DOMRect): THREE.Vector2 {
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
  }

  // A new gesture can start before the previous swipe's release tween
  // finishes (fast consecutive swipes). Rather than dropping the new
  // gesture or reverting the still-in-flight one, jump straight to whatever
  // it was already heading toward -- committing it if it had crossed the
  // commit threshold, reverting it otherwise -- so the new beginTurn() call
  // always starts from a clean (non-turning) scene.
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

  function onPointerDown(e: PointerEvent) {
    if (!enabled || e.button !== 0) return;
    if (releaseCancel) interruptRelease();
    const rect = dom.getBoundingClientRect();
    raycaster.setFromCamera(ndcFromEvent(e, rect), scene.camera);
    const [hit] = raycaster.intersectObjects(scene.raycastableObjects(), false);
    if (!hit || !hit.face) return;
    const cubieId = scene.cubieIdForMesh(hit.object);
    const cubie = cubieId === null ? undefined : scene.getCubieById(cubieId);
    if (!cubie) return;

    // Rounded-corner geometry means the raw normal isn't always exactly
    // axis-aligned near a bevel -- pick the dominant component instead of
    // requiring it to already be ~axis-aligned.
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const ax = Math.abs(worldNormal.x);
    const ay = Math.abs(worldNormal.y);
    const az = Math.abs(worldNormal.z);
    const faceAxis: Axis = ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z";
    const otherAxes: Axis[] = (["x", "y", "z"] as Axis[]).filter((a) => a !== faceAxis);
    const candidates = otherAxes.map((axis) => {
      const layer = Math.round(cubie.position[axis]) as 1 | -1;
      return { axis, layer, screenDir: screenTangent(scene, hit.point, axis, rect) };
    }) as [Candidate, Candidate];

    dom.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, candidates, locked: null };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.locked) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      const dragVec = new THREE.Vector2(dx, dy);
      const [c0, c1] = drag.candidates!;
      const d0 = Math.abs(dragVec.dot(c0.screenDir));
      const d1 = Math.abs(dragVec.dot(c1.screenDir));
      const chosen = d0 >= d1 ? c0 : c1;
      const rect = dom.getBoundingClientRect();
      const fullTurnPx = rect.width * FULL_TURN_FRACTION_OF_WIDTH;
      scene.beginTurn(chosen.axis, chosen.layer);
      const projected = dx * chosen.screenDir.x + dy * chosen.screenDir.y;
      const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
      scene.setTurnProgress(progress);
      drag.locked = { axis: chosen.axis, layer: chosen.layer, screenDir: chosen.screenDir, fullTurnPx, progress };
      return;
    }

    const { screenDir, fullTurnPx } = drag.locked;
    const projected = dx * screenDir.x + dy * screenDir.y;
    const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
    drag.locked.progress = progress;
    scene.setTurnProgress(progress);
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.locked) startRelease(drag.locked.progress);
    drag = null;
  }

  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerup", onPointerUp);
  dom.addEventListener("pointercancel", onPointerUp);

  return controller;
}
