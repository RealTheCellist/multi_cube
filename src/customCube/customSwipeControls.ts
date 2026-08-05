import * as THREE from "three";
import type { CustomCubeScene } from "./CustomCubeScene";
import { type Axis, axisVector } from "./cubeMath";

const DRAG_THRESHOLD_PX = 12;
// How much of the canvas width a full 90-degree drag needs to cover.
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
  layer: number;
}

interface LockedTurn {
  axis: Axis;
  layer: number;
  screenDir: THREE.Vector2;
  fullTurnPx: number;
  progress: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  hitPoint: THREE.Vector3;
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

// The same rotation setTurnProgress() applies visually to the live layer
// group (axisVector(axis), angle = progress * 90 degrees) -- reusing that
// exact convention here means a predicted screen position for a given
// progress always matches what the user would actually see mid-scrub.
function rotatedPoint(point: THREE.Vector3, axis: Axis, progress: number): THREE.Vector3 {
  const q = new THREE.Quaternion().setFromAxisAngle(axisVector(axis), progress * (Math.PI / 2));
  return point.clone().applyQuaternion(q);
}

// Finds the turn progress (in units of quarter-turns, unclamped) whose
// predicted screen position for `hitPoint` best matches `targetScreen` --
// a coarse-then-refined 1D search over the actual nonlinear rotation
// trajectory, not a linear approximation. Used ONLY to decide which of the
// two candidate axes a drag means (see below) -- NOT for the ongoing
// progress value, since "closest point on this axis's finite trajectory
// curve to the pointer's absolute screen position" doesn't grow without
// bound as the user keeps dragging in a straight line (verified directly:
// a sustained straight drag can asymptote at a residual well under the
// commit threshold if the line's bearing doesn't closely match the curve's
// overall bearing, i.e. dragging further would never commit the turn no
// matter how far you go). Ongoing progress instead reuses the original
// fixed-tangent linear projection once an axis is chosen, which is
// monotonic and unbounded by construction.
function bestFitProgress(scene: CustomCubeScene, hitPoint: THREE.Vector3, axis: Axis, rect: DOMRect, targetScreen: THREE.Vector2): { progress: number; error: number } {
  function errorAt(progress: number): number {
    const predicted = worldToScreen(scene, rotatedPoint(hitPoint, axis, progress), rect);
    return predicted.distanceToSquared(targetScreen);
  }
  let best = { progress: 0, error: errorAt(0) };
  for (let p = -1.6; p <= 1.6 + 1e-9; p += 0.05) {
    const error = errorAt(p);
    if (error < best.error) best = { progress: p, error };
  }
  const center = best.progress;
  for (let p = center - 0.05; p <= center + 0.05 + 1e-9; p += 0.002) {
    const error = errorAt(p);
    if (error < best.error) best = { progress: p, error };
  }
  return best;
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

  // Adjacent cubie meshes don't actually touch -- there's a real (if thin)
  // 3D gap between them (see CUBIE_SIZE_RATIO in CustomCubeScene.ts), which
  // is what makes the black grid lines read as gaps rather than seams. A
  // touch landing in that gap, or just past a corner cubie's rounded bevel,
  // hits nothing at all -- most likely exactly where three faces meet
  // (a corner cubie), since that's where the most gap-edges converge. Retry
  // with a small ring of pixel offsets around the exact point before giving
  // up, so a touch that's a few pixels off a boundary still finds the cubie
  // the user was obviously aiming for instead of silently doing nothing.
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

  function raycastNear(clientX: number, clientY: number, rect: DOMRect): THREE.Intersection | null {
    for (const [dx, dy] of MISS_RETRY_OFFSETS_PX) {
      const ndcEvent = { clientX: clientX + dx, clientY: clientY + dy } as PointerEvent;
      raycaster.setFromCamera(ndcFromEvent(ndcEvent, rect), scene.camera);
      const [hit] = raycaster.intersectObjects(scene.raycastableObjects(), false);
      if (hit && hit.face) return hit;
    }
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    if (!enabled || e.button !== 0) return;
    if (releaseCancel) interruptRelease();
    const rect = dom.getBoundingClientRect();
    const hit = raycastNear(e.clientX, e.clientY, rect);
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
      // A valid grid coordinate is an exact integer for odd grid sizes and
      // an exact half-integer for even ones (see cubeState.ts) -- snapping
      // to the nearest integer here would be wrong for a 4x4's inner layers
      // (e.g. 1.5 rounds to 2, a layer that doesn't exist). 0 specifically
      // means a middle-slice (M/E/S) turn on a 3x3x3 -- a touched edge or
      // center piece has one or both of its non-face-axis coordinates at 0.
      // CustomCubeScene.endTurn knows how to commit and name that turn, so
      // this is passed through as-is rather than forced to an outer layer.
      const layer = Math.round(cubie.position[axis] * 2) / 2;
      return { axis, layer };
    }) as [Candidate, Candidate];

    dom.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, hitPoint: hit.point.clone(), candidates, locked: null };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.locked) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      const rect = dom.getBoundingClientRect();
      const targetScreen = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);
      const [c0, c1] = drag.candidates!;
      const fit0 = bestFitProgress(scene, drag.hitPoint, c0.axis, rect, targetScreen);
      const fit1 = bestFitProgress(scene, drag.hitPoint, c1.axis, rect, targetScreen);
      const chosen = fit0.error <= fit1.error ? c0 : c1;
      const screenDir = screenTangent(scene, drag.hitPoint, chosen.axis, rect);
      const fullTurnPx = rect.width * FULL_TURN_FRACTION_OF_WIDTH;
      // Someone else (a solve-preview animation, most likely) already owns
      // the scene's turn -- e.g. this finger was resting on the cube, below
      // the drag threshold, when a preview started. Abandon the gesture
      // rather than faking a locked drag: without this check, the drag
      // below still tracks progress and fires startRelease()/onCommit() on
      // release even though no move was ever actually applied, desyncing
      // the move counter from the real cube state.
      if (!scene.beginTurn(chosen.axis, chosen.layer)) {
        drag = null;
        return;
      }
      const projected = dx * screenDir.x + dy * screenDir.y;
      const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
      scene.setTurnProgress(progress);
      drag.locked = { axis: chosen.axis, layer: chosen.layer, screenDir, fullTurnPx, progress };
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
