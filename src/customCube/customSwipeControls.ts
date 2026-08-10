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
// re-anchoring the direction reference past it, and also the minimum
// distance past that reference before even attempting a candidate read
// (see docs/GESTURE_DEFERRED_COMMIT_V1.md).
const SETTLE_PX = 6;
// This file used to carry a layered gate/correction system built up
// across three separate sprints -- a pixel gate (DECISION_PX), a
// margin-scaled extra wait on top of it (LOW_CONFIDENCE_MARGIN /
// LOW_CONFIDENCE_MAX_EXTRA_PX), and a one-shot post-lock correction
// (CORRECTION_MARGIN) -- four constants answering the same underlying
// question in three different ways (see
// docs/GESTURE_AXIS_MAPPING_VALIDATION_V4.md and
// docs/GESTURE_AXIS_MAPPING_LATE_CORRECTION_V1.md for that history). All
// of it is replaced by one rule: don't reveal ANY axis until the
// cumulative settleRef-anchored direction has traveled this far, then
// decide once from the most current reading and never revisit it. A
// headless sweep (N=800/point, see docs/GESTURE_DEFERRED_COMMIT_V1.md)
// showed this distance-vs-accuracy relationship is cleanly monotonic --
// longer wait is never worse -- but that sweep only modeled a straight
// line plus independent per-step noise, and a first real-device pass
// (see docs/GESTURE_DEFERRED_COMMIT_V1.md "Real-device regression")
// caught two things that model missed. First, a FIXED 80px was picked
// against a ~550px test canvas (fullTurnPx there is ~77px), but on a
// phone-width canvas (350-430px) fullTurnPx is only 49-60px -- meaning
// the commit distance was routinely LONGER than a full 90-degree turn,
// so nothing was ever revealed until the drag had already overshot a
// full turn, then it snapped straight to an already-maxed rotation the
// instant it appeared. Second, a real hand's path curves over that much
// travel in a way independent per-step noise never does, and deciding
// from the FULL cumulative settleRef-to-current vector gave that
// curvature much more room to drift the decision off-axis the longer
// the required distance -- a failure mode the synthetic sweep, being
// straight-line, was structurally blind to. Both point the same
// direction: keep this distance short, and scale it with the canvas
// instead of a fixed pixel count so it can't exceed a full turn on any
// screen size again.
const COMMIT_DISTANCE_FRACTION_OF_FULL_TURN = 0.4;
// How much of the canvas width a full 90-degree drag needs to cover.
const FULL_TURN_FRACTION_OF_WIDTH = 0.14;
const COMMIT_PROGRESS_THRESHOLD = 0.3;
const RELEASE_ANIMATION_MS = 220;
// The instant an axis reveals, `progress` is already computed from
// displacement measured all the way back at the touchdown pixel -- by
// COMMIT_DISTANCE_PX that's a large fraction of a full turn already (see
// docs/GESTURE_FEEL_OPTIMIZATION_V1.md STEP 1 -- measured, not assumed:
// screenshots at 19px vs 20px go from a fully static cube to one already
// rotated ~34 degrees in a single frame, under the old, much shorter
// gate). CATCH_UP_MS smooths that jump into a short eased ramp from 0,
// reusing the same easeOutCubic + requestAnimationFrame shape already
// proven in startRelease() below. This only touches how an
// ALREADY-DECIDED axis's progress is displayed; it cannot change which
// axis gets chosen or when.
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

interface PendingPick {
  candidate: Candidate;
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
  // Static plane of the touched face (through hitPoint, normal = face
  // axis), fixed at touchdown -- see classifyByFacePlane above.
  facePlane: THREE.Plane;
  candidates: [Candidate, Candidate] | null;
  locked: LockedTurn | null;
  // Set once total displacement from (startX, startY) first clears
  // SETTLE_PX -- the direction decision is then based on movement from
  // THIS point, not from the touchdown pixel, so a short initial hook
  // doesn't dominate the snapshot the axis gets decided from.
  settleRef: { x: number; y: number } | null;
  // Continuously updated with whichever candidate the cumulative
  // settleRef-anchored direction currently favors, from the first instant
  // there's enough signal to compute one. This is the ONLY axis-decision
  // state left (see COMMIT_DISTANCE_PX above) -- committed once distance
  // clears COMMIT_DISTANCE_PX, or read as-is at release for a gesture
  // that ends before then.
  pending: PendingPick | null;
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

function componentOf(v: THREE.Vector3, axis: Axis): number {
  return axis === "x" ? v.x : axis === "y" ? v.y : v.z;
}

// Which of the two candidate axes a drag means is decided by raycasting
// the CURRENT pointer position onto the touched face's own flat plane (a
// static proxy plane through the original hit point, not the rotated
// cube), not by comparing the swipe's direction against each candidate's
// instantaneous screen tangent LINE at the touch point (the old method --
// see git history and docs/GESTURE_MATERIALINDEX_REWRITE_AND_MATH_FLOOR_V1.md
// for why that's proven mathematically incapable of 100% accuracy: real
// points exist on every face where the two candidates' tangent lines are
// under 0.2 degrees apart, which no direction comparison can resolve).
//
// The idea is adapted from cubing.js's twisty-player (see
// docs/GESTURE_ENDPOINT_MATCH_V1.md), which raycasts the CURRENT drag
// position against invisible per-facelet hit-plane proxies rather than
// comparing an instantaneous 2D screen direction. An earlier version of
// this rewrite instead predicted a point FORWARD from hitPoint by an
// assumed rotation angle (derived from raw drag pixels) and compared
// absolute screen positions -- that conflates direction error with
// magnitude error, since whichever candidate's assumed angle-to-pixel
// rate happens to numerically match the actual drag length wins,
// regardless of whether its direction is right (measured: 66.7% wrong in
// the real app despite 0% wrong in an idealized math model that never
// exercised this mismatch). Raycasting the real current screen position
// onto the face's own flat plane avoids that: the two in-plane axes are
// exactly the two candidates, so splitting the raycasted point's
// displacement into those two components and picking the OTHER candidate
// whenever one dominates is direction-only, immune to any pixel/angle
// scale assumption, and correct by construction (front face, candidates
// x/y: a drag that moves the raycasted point mostly along x means "turn
// around y" -- a horizontal drag turns the row -- and vice versa).
function classifyByFacePlane(
  raycaster: THREE.Raycaster,
  scene: CustomCubeScene,
  ndc: THREE.Vector2,
  hitPoint: THREE.Vector3,
  facePlane: THREE.Plane,
  candidates: readonly [Candidate, Candidate],
): Candidate {
  raycaster.setFromCamera(ndc, scene.camera);
  const current = new THREE.Vector3();
  const [c0, c1] = candidates;
  if (!raycaster.ray.intersectPlane(facePlane, current)) return c0;
  const delta = current.sub(hitPoint);
  const comp0 = Math.abs(componentOf(delta, c0.axis));
  const comp1 = Math.abs(componentOf(delta, c1.axis));
  return comp0 >= comp1 ? c1 : c0;
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

  // Commits whatever axis is currently pending: starts the actual layer
  // turn and its initial catch-up tween (see CATCH_UP_MS above). Called
  // both from onPointerMove once COMMIT_DISTANCE_PX is cleared, and from
  // onPointerUp as a release-time fallback for gestures that end before
  // then. Returns whether the turn actually started (false only if
  // beginTurn lost a race against something else already owning the
  // scene's turn).
  function commitPending(dx: number, dy: number, rect: DOMRect): boolean {
    if (!drag || !drag.pending) return false;
    const { candidate, screenDir } = drag.pending;
    // Someone else (a solve-preview animation, most likely) already owns
    // the scene's turn -- e.g. this finger was resting on the cube, below
    // the drag threshold, when a preview started. Abandon the gesture
    // rather than faking a locked drag: without this check, the drag
    // below still tracks progress and fires startRelease()/onCommit() on
    // release even though no move was ever actually applied, desyncing
    // the move counter from the real cube state.
    if (!scene.beginTurn(candidate.axis, candidate.layer)) {
      drag = null;
      return false;
    }
    const fullTurnPx = rect.width * FULL_TURN_FRACTION_OF_WIDTH;
    const projected = dx * screenDir.x + dy * screenDir.y;
    const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
    drag.locked = { axis: candidate.axis, layer: candidate.layer, screenDir, fullTurnPx, progress };
    scene.setTurnProgress(0);
    catchUp = { startTime: performance.now(), fromProgress: 0, toProgress: progress, displayed: 0 };
    requestAnimationFrame(stepCatchUp);
    return true;
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
      // A hit that lands on bare plastic (no sticker) means the ray slipped
      // through the gap between two cubies onto a neighbor's interior face
      // -- see CustomCubeScene.isStickerFaceHit. That's not the cubie the
      // touch visually landed on, so treat it the same as a miss and keep
      // retrying the offset ring instead of accepting a bogus axis pair.
      if (hit && hit.face && scene.isStickerFaceHit(hit.object, hit.face.materialIndex)) return hit;
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

    // Which macro face was touched, read from the exact/discrete
    // materialIndex rather than the face's normal -- see
    // CustomCubeScene.axisForMaterialIndex. The normal is a continuous
    // quantity that legitimately drifts away from axis-aligned near a
    // bevel (more so the larger the bevel radius), where materialIndex is
    // exact by construction regardless of curvature. Falls back to the
    // normal's dominant component only for a hit with no materialIndex,
    // which none of this app's own geometry produces in practice.
    const matIdxAxis = scene.axisForMaterialIndex(hit.face.materialIndex);
    const faceAxis: Axis =
      matIdxAxis ??
      (() => {
        const worldNormal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
        const ax = Math.abs(worldNormal.x);
        const ay = Math.abs(worldNormal.y);
        const az = Math.abs(worldNormal.z);
        return ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z";
      })();
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

    const facePlane = new THREE.Plane(axisVector(faceAxis), -axisVector(faceAxis).dot(hit.point));

    dom.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, hitPoint: hit.point.clone(), facePlane, candidates, locked: null, settleRef: null, pending: null };
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
      // noise) before reading any candidate at all. See
      // docs/GESTURE_DIRECTION_STABILIZATION_V1.md STEP 2b for the
      // measured hooked-swipe failure this fixes.
      if (!drag.settleRef) {
        if (Math.hypot(dx, dy) < SETTLE_PX) return;
        drag.settleRef = { x: e.clientX, y: e.clientY };
        return;
      }
      const rdx = e.clientX - drag.settleRef.x;
      const rdy = e.clientY - drag.settleRef.y;
      const dist = Math.hypot(rdx, rdy);
      // Same minimum again, now measured from settleRef -- avoids reading
      // a candidate from a near-zero-length (numerically noisy) vector.
      if (dist < SETTLE_PX) return;

      // See classifyByFacePlane above -- raycast the CURRENT pointer
      // position onto the touched face's own flat plane and pick whichever
      // candidate the resulting in-plane displacement favors.
      const chosen = classifyByFacePlane(raycaster, scene, ndcFromEvent(e, rect), drag.hitPoint, drag.facePlane, drag.candidates!);
      // screenDir still comes from the chosen candidate's tangent LINE --
      // that's for tracking live progress/sign smoothly once locked (see
      // commitPending/onPointerMove's locked branch below), a different
      // concern from which axis to pick in the first place.
      const screenDir = screenTangent(scene, drag.hitPoint, chosen.axis, rect);
      // Keep updating this on every move regardless of distance -- it's
      // the read onPointerUp falls back to if the gesture ends before
      // COMMIT_DISTANCE_PX (see docs/GESTURE_DEFERRED_COMMIT_V1.md).
      drag.pending = { candidate: chosen, screenDir };

      // See COMMIT_DISTANCE_FRACTION_OF_FULL_TURN above -- nothing is
      // revealed before this distance, so there's nothing to revisit or
      // correct once it does commit. Scaled off the canvas's own
      // fullTurnPx rather than a fixed pixel count, so it can never
      // exceed a full turn's worth of drag on any screen size.
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
      // Already committed during an earlier onPointerMove -- release from
      // whatever's actually ON SCREEN right now (catchUp.displayed), not
      // the already-locked target progress, so a still-mid-flight
      // catch-up tween doesn't get its jump reintroduced by snapping
      // straight to the target first.
      fromProgress = catchUp ? catchUp.displayed : drag.locked.progress;
    } else if (drag.pending) {
      // Gesture ended before COMMIT_DISTANCE_PX (see
      // docs/GESTURE_DEFERRED_COMMIT_V1.md) -- decide right now from
      // whatever direction was accumulated, instead of silently dropping
      // a short but deliberate swipe. There's nothing already on screen
      // to preserve (this is the first and only reveal), so no catch-up
      // tween is needed -- release straight from the freshly computed
      // progress.
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
