import * as THREE from "three";
import type { CustomCubeScene } from "./CustomCubeScene";
import { type Axis, axisVector } from "./cubeMath";

const DRAG_THRESHOLD_PX = 12;
// A real finger "hooks" through a short, incidental off-axis segment
// before settling into the direction it actually means (see
// docs/GESTURE_DIRECTION_STABILIZATION_V1.md STEP 2b -- measured with a
// synthetic hooked swipe: an 11px off-axis hook followed by a long, clean,
// unambiguous swipe was still classified by the hook's direction, because
// the axis lock used to fire on displacement from the touchdown pixel
// itself). SETTLE_PX is the length of hook this is willing to absorb by
// re-anchoring the direction reference past it; DECISION_PX is how far
// past that reference the finger has to move before the axis locks.
const SETTLE_PX = 6;
const DECISION_PX = 8;
// On faces viewed at an oblique angle (e.g. the top/right faces in the
// default 3-face camera pose), the two candidate axes' screen tangents can
// end up nearly parallel instead of close to perpendicular -- a sweep
// across the visible canvas found 27% of sampled points on those faces had
// an axis-alignment margin under 0.25, several under 0.02 (see
// docs/GESTURE_AXIS_MAPPING_VALIDATION_V2.md). At that margin the winning
// candidate is effectively decided by hand-tremor noise in a single
// snapshot. When the margin is this low, wait for more drag distance past
// the normal decision point before locking -- a longer real swipe's
// direction is a more stable signal than a short one, the same reasoning
// SETTLE_PX/DECISION_PX already rely on for the hook problem. This never
// fires on well-separated faces (front-face margins measured consistently
// >=0.3), so it leaves that already-validated 0%-misrecognition behavior
// untouched.
const LOW_CONFIDENCE_MARGIN = 0.15;
// Extra wait distance is scaled continuously by how low the observed margin
// actually is, rather than one fixed amount for every margin under the
// threshold (see docs/GESTURE_AXIS_MAPPING_VALIDATION_V4.md) -- margin near
// 0 (two candidate tangents nearly identical on screen) waits up to
// LOW_CONFIDENCE_MAX_EXTRA_PX, while margin near LOW_CONFIDENCE_MARGIN
// itself waits close to nothing extra, matching the old fixed-20px
// behavior at that boundary exactly (so this never waits LESS than the
// previous behavior did, only ever more for the worse-margin cases that
// previously got the same flat 20px as everything else).
const LOW_CONFIDENCE_MAX_EXTRA_PX = 80;
function lowConfidenceExtraPx(margin: number): number {
  return LOW_CONFIDENCE_MAX_EXTRA_PX * (1 - margin / LOW_CONFIDENCE_MARGIN);
}
// A genuinely near-tied touch point (the two candidate tangents almost
// parallel on screen) can still lock wrong even after the low-confidence
// wait above -- waiting longer only shrinks the ANGULAR NOISE in the
// cumulative drag vector, and for a small enough true margin that noise
// can still dominate at the point of locking (see
// docs/GESTURE_AXIS_MAPPING_LATE_CORRECTION_V1.md). Rather than stop
// re-evaluating once locked, keep comparing both candidates against the
// same cumulative direction (now with more real drag distance behind it)
// for a single follow-up correction if the picture becomes unambiguous.
// Reusing LOW_CONFIDENCE_MARGIN as the "confident enough to act on" bar
// keeps one meaning for "confident" everywhere in this file, rather than
// introducing an unexplained second threshold.
const CORRECTION_MARGIN = LOW_CONFIDENCE_MARGIN;
// How much of the canvas width a full 90-degree drag needs to cover.
const FULL_TURN_FRACTION_OF_WIDTH = 0.14;
const COMMIT_PROGRESS_THRESHOLD = 0.3;
const RELEASE_ANIMATION_MS = 220;
// The instant the axis locks, `progress` is already computed from
// displacement measured all the way back at the touchdown pixel -- by the
// time SETTLE_PX/DECISION_PX have been satisfied that's already ~20px, so
// the very first frame of visible feedback used to jump straight to
// roughly a third of a quarter-turn instead of starting from zero (see
// docs/GESTURE_FEEL_OPTIMIZATION_V1.md STEP 1 -- measured, not assumed:
// screenshots at 19px vs 20px go from a fully static cube to one already
// rotated ~34 degrees in a single frame). CATCH_UP_MS smooths that jump
// into a short eased ramp from 0, reusing the same easeOutCubic +
// requestAnimationFrame shape already proven in startRelease() below.
// This only touches how an ALREADY-DECIDED axis's progress is displayed;
// it cannot change which axis gets chosen or when.
const CATCH_UP_MS = 80;

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
  candidates: [Candidate, Candidate] | null;
  locked: LockedTurn | null;
  // Set once total displacement from (startX, startY) first clears
  // SETTLE_PX -- the direction decision is then based on movement from
  // THIS point, not from the touchdown pixel, so a short initial hook
  // doesn't dominate the snapshot the axis gets decided from.
  settleRef: { x: number; y: number } | null;
  // Whether the one-shot late correction (see CORRECTION_MARGIN) has
  // already fired for this gesture -- capped at one to avoid oscillating
  // back and forth between the two candidates on a genuinely borderline
  // drag.
  corrected: boolean;
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

// Which of the two candidate axes a drag means is decided by direct angle
// comparison: the swipe's screen-space direction against each axis's local
// screen tangent LINE at the touch point (see screenTangent below). "Line"
// because a candidate can be dragged either way along its tangent -- a
// swipe pointing along +tangent or -tangent both mean that axis -- so the
// comparison is sign-agnostic (|dot| of the normalized directions, i.e. how
// parallel the two lines are) rather than a signed vector match. Picking
// the axis whose tangent line the swipe is more nearly parallel to is a
// direct geometric answer with no ambiguity except at the exact angle
// bisector between the two tangents (an actual 50/50 case, not a bug).
function axisAlignment(dragDir: THREE.Vector2, tangent: THREE.Vector2): number {
  return Math.abs(dragDir.dot(tangent));
}

export function attachCustomSwipeTurning(scene: CustomCubeScene, moveCountRef: { current: number }): CustomSwipeController {
  const dom = scene.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  let enabled = true;
  let drag: DragState | null = null;
  let releaseCancel: (() => void) | null = null;
  let releaseTarget: 1 | -1 | null = null;
  let catchUp: CatchUpTween | null = null;
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

  // Runs only for the first CATCH_UP_MS after an axis locks, easing the
  // displayed progress from 0 up to whatever the live drag distance
  // already implies (see CATCH_UP_MS above) instead of snapping straight
  // there. `toProgress` keeps getting updated by onPointerMove while this
  // is in flight, so a continuing drag blends smoothly into live 1:1
  // tracking rather than fighting this tween once it finishes.
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
    // Every real cubie missed, even with the retry ring above -- try the
    // enlarged invisible proxy (see CustomCubeScene.ts's edgeGestureProxy)
    // before giving up entirely. Only the exact touch point is tried here
    // (no retry ring): the proxy is already generously padded past the
    // cube's true surface, so a further pixel ring would just widen an
    // already-forgiving fallback into over-triggering on background touches.
    const ndcEvent = { clientX, clientY } as PointerEvent;
    raycaster.setFromCamera(ndcFromEvent(ndcEvent, rect), scene.camera);
    const [proxyHit] = raycaster.intersectObjects(scene.edgeGestureProxyObjects(), false);
    return proxyHit && proxyHit.face ? proxyHit : null;
  }

  function onPointerDown(e: PointerEvent) {
    if (!enabled || e.button !== 0) return;
    if (releaseCancel) interruptRelease();
    const rect = dom.getBoundingClientRect();
    const hit = raycastNear(e.clientX, e.clientY, rect);
    if (!hit || !hit.face) return;
    // Note: this no longer requires hit.object to resolve to a real cubie.
    // A hit against the edgeGestureProxy fallback (see raycastNear above)
    // never does -- everything below only reads hit.face/hit.point/
    // hit.object.matrixWorld, none of which need an actual cubie.

    // Rounded-corner geometry means the raw normal isn't always exactly
    // axis-aligned near a bevel -- pick the dominant component instead of
    // requiring it to already be ~axis-aligned.
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const ax = Math.abs(worldNormal.x);
    const ay = Math.abs(worldNormal.y);
    const az = Math.abs(worldNormal.z);
    const faceAxis: Axis = ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z";
    const otherAxes: Axis[] = (["x", "y", "z"] as Axis[]).filter((a) => a !== faceAxis);
    // A valid grid coordinate is an exact integer for odd grid sizes and an
    // exact half-integer for even ones (see cubeState.ts's buildSolvedCube:
    // coordinate = index - (gridSize-1)/2). Rounding to the nearest half
    // unconditionally -- as this used to -- is only correct for even grids;
    // on an odd grid like 3x3 it can snap a hit point to e.g. 0.5, a layer
    // that doesn't exist, silently producing an empty turn group (the move
    // counter still increments since beginTurn succeeds, but no cubie
    // actually moves). Round to the parity this gridSize actually uses.
    const isEvenGrid = scene.gridSize % 2 === 0;
    // A proxy-fallback hit point sits past the cube's true surface (that's
    // the whole point of the padding), so its raw grid coordinate can round
    // to a layer index one past the outermost real layer -- clamp back to
    // the outermost valid layer rather than producing a layer with no
    // cubies in it (an empty turn group: beginTurn "succeeds" but nothing
    // visibly moves, indistinguishable from the original miss this exists
    // to fix).
    const maxLayer = (scene.gridSize - 1) / 2;
    const candidates = otherAxes.map((axis) => {
      // 0 specifically means a middle-slice (M/E/S) turn on a 3x3x3 -- a
      // touched edge or center piece has one or both of its non-face-axis
      // coordinates at 0. CustomCubeScene.endTurn knows how to commit and
      // name that turn, so this is passed through as-is rather than forced
      // to an outer layer.
      //
      // Snapped from the raycast hit POINT, not the hit cubie's own center:
      // right at a row/column boundary, the ray can land on a neighboring
      // cubie's rounded bevel instead of the one the touch visually landed
      // on (rounded-corner meshes don't end exactly where their flat face
      // does), which would silently turn the wrong layer if snapped to
      // that neighbor's center instead of to where the touch actually was.
      const raw = scene.worldToGrid(hit.point[axis]);
      const rounded = isEvenGrid ? Math.round(raw * 2) / 2 : Math.round(raw);
      const layer = Math.max(-maxLayer, Math.min(maxLayer, rounded));
      return { axis, layer };
    }) as [Candidate, Candidate];

    dom.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, hitPoint: hit.point.clone(), candidates, locked: null, settleRef: null, corrected: false };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const rect = dom.getBoundingClientRect();

    if (!drag.locked) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      // Dead zone: don't decide the axis from the touchdown pixel itself.
      // Wait for total displacement to clear SETTLE_PX, re-anchor the
      // direction reference there (absorbing a short hook as settling
      // noise), then require DECISION_PX more movement past that anchor
      // before actually locking. See GESTURE_DIRECTION_STABILIZATION_V1.md
      // STEP 2b for the measured hooked-swipe failure this fixes.
      if (!drag.settleRef) {
        if (Math.hypot(dx, dy) < SETTLE_PX) return;
        drag.settleRef = { x: e.clientX, y: e.clientY };
        return;
      }
      const rdx = e.clientX - drag.settleRef.x;
      const rdy = e.clientY - drag.settleRef.y;
      if (Math.hypot(rdx, rdy) < DECISION_PX) return;

      const dragDir = new THREE.Vector2(rdx, rdy).normalize();
      const [c0, c1] = drag.candidates!;
      const tangent0 = screenTangent(scene, drag.hitPoint, c0.axis, rect);
      const tangent1 = screenTangent(scene, drag.hitPoint, c1.axis, rect);
      const align0 = axisAlignment(dragDir, tangent0);
      const align1 = axisAlignment(dragDir, tangent1);
      // See LOW_CONFIDENCE_MARGIN above -- on an oblique-angle face the two
      // candidates can be nearly tied here. Don't lock on a low-confidence
      // snapshot; wait for more real drag distance (up to the extended
      // cap) so a longer, steadier swipe gets to resolve the tie instead of
      // a single noisy sample deciding it.
      const margin = Math.abs(align0 - align1);
      if (margin < LOW_CONFIDENCE_MARGIN && Math.hypot(rdx, rdy) < DECISION_PX + lowConfidenceExtraPx(margin)) {
        return;
      }
      const useC0 = align0 >= align1;
      const chosen = useC0 ? c0 : c1;
      const screenDir = useC0 ? tangent0 : tangent1;
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
      drag.locked = { axis: chosen.axis, layer: chosen.layer, screenDir, fullTurnPx, progress };
      scene.setTurnProgress(0);
      catchUp = { startTime: performance.now(), fromProgress: 0, toProgress: progress, displayed: 0 };
      requestAnimationFrame(stepCatchUp);
      return;
    }

    // A lock made under LOW_CONFIDENCE_MARGIN can still land on the wrong
    // candidate -- waiting longer before locking only shrinks the ANGULAR
    // NOISE in the cumulative drag vector, which for a small enough true
    // margin can still exceed it right at the moment of locking. Keep
    // comparing both candidates against the same settleRef-anchored
    // direction (now backed by more real drag distance) for one follow-up
    // correction, rather than freezing the decision forever the instant it
    // first clears the gate. Well-separated faces never trigger this (their
    // margin is already far above CORRECTION_MARGIN at lock time, so the
    // "other" candidate can never look confidently better), so this cannot
    // regress the case that was already solved.
    if (!drag.corrected && drag.settleRef) {
      const rdx = e.clientX - drag.settleRef.x;
      const rdy = e.clientY - drag.settleRef.y;
      const dragDir = new THREE.Vector2(rdx, rdy).normalize();
      const [c0, c1] = drag.candidates!;
      const tangent0 = screenTangent(scene, drag.hitPoint, c0.axis, rect);
      const tangent1 = screenTangent(scene, drag.hitPoint, c1.axis, rect);
      const align0 = axisAlignment(dragDir, tangent0);
      const align1 = axisAlignment(dragDir, tangent1);
      const margin = Math.abs(align0 - align1);
      const leader = align0 >= align1 ? c0 : c1;
      const leaderScreenDir = align0 >= align1 ? tangent0 : tangent1;
      if (margin >= CORRECTION_MARGIN && leader.axis !== drag.locked.axis) {
        drag.corrected = true;
        // Undo the wrong turn's visual state (no move was ever committed,
        // so this is a pure revert) and start the correct one in its
        // place, exactly like the initial lock does.
        scene.endTurn(null);
        if (scene.beginTurn(leader.axis, leader.layer)) {
          const fullTurnPx = rect.width * FULL_TURN_FRACTION_OF_WIDTH;
          const projected = dx * leaderScreenDir.x + dy * leaderScreenDir.y;
          const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
          drag.locked = { axis: leader.axis, layer: leader.layer, screenDir: leaderScreenDir, fullTurnPx, progress };
          scene.setTurnProgress(0);
          catchUp = { startTime: performance.now(), fromProgress: 0, toProgress: progress, displayed: 0 };
          requestAnimationFrame(stepCatchUp);
          return;
        }
        // beginTurn() failing here would mean someone else grabbed the
        // scene's turn in the instant between our endTurn(null) and this
        // call -- not expected on a single-pointer gesture, but abandon
        // cleanly rather than track progress against a turn that doesn't
        // exist.
        drag = null;
        return;
      }
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
    if (drag.locked) {
      // If the catch-up tween is still mid-flight, release from whatever
      // is actually ON SCREEN right now (catchUp.displayed), not from the
      // already-locked target progress -- starting the release tween from
      // the target would itself snap the display straight to that value
      // first, reintroducing the exact jump this sprint removes.
      const fromProgress = catchUp ? catchUp.displayed : drag.locked.progress;
      catchUp = null;
      startRelease(fromProgress);
    }
    drag = null;
  }

  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerup", onPointerUp);
  dom.addEventListener("pointercancel", onPointerUp);

  return controller;
}
