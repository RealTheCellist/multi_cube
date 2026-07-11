import * as THREE from "three";
import type { Alg } from "cubing/alg";
import type { ExperimentalMillisecondTimestamp, TwistyPlayer } from "cubing/twisty";
import { applyRealisticCubeStyling } from "./cubeStyling";

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
// Requiring most of a full-turn drag to commit is a bad match for speed-
// solving, where turns are short flicks rather than slow full swipes. This
// only needs to clear a bit more than the direction-lock distance itself, so
// once a swipe's direction is recognized at all, releasing commits it — while
// still letting an explicit drag back toward the start cancel the move.
const COMMIT_PROGRESS_THRESHOLD = 0.12;
// How long a full (100%-of-the-turn) release animation takes; scaled down by
// however little distance is actually left so a short flick — which barely
// moved the face during the drag itself — doesn't suddenly snap through the
// remaining ~90% far faster than the drag was moving, which read as a
// second, separate turn instead of one continuous motion.
//
// The turning layer visibly separates from the rest of the cube mid-turn —
// real perspective on a rotating layer, not a bug, but the longer that gap
// lingers open before snapping shut, the more it reads as the layer
// "popping" rather than smoothly finishing. Shortening these (previously
// 300/60) makes the close-out snappier without changing anything about how
// the live drag itself tracks the finger.
const FULL_RELEASE_ANIMATION_MS = 180;
const MIN_RELEASE_ANIMATION_MS = 45;

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

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// The finger drives `player.timestamp` 1:1 during the drag itself, but on
// release we still need to cover whatever fraction of the turn is left — a
// hard jump there reads as an abrupt stutter rather than a continuation of
// the same motion. Ease the remaining distance out over the duration
// `getDurationMs()` reports instead of snapping straight to the end/start
// (callers scale this by how much distance is actually left, so a short
// flick doesn't visibly speed up at the hand-off). Reading the duration via
// a callback each frame — rather than taking a fixed number — lets a caller
// shrink it mid-flight to cut the animation short (see settleLocked's
// `requestExpedite`). Also reused by solvePlayback.ts to animate each solver
// move, with a callback that always returns the same fixed duration.
export function animateTimestampTo(
  player: TwistyPlayer,
  fromTimestamp: number,
  toTimestamp: number,
  isStillCurrent: () => boolean,
  getDurationMs: () => number,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now: number) {
      if (!isStillCurrent()) {
        resolve();
        return;
      }
      const t = Math.min((now - start) / getDurationMs(), 1);
      const eased = easeOutCubic(t);
      player.timestamp = (fromTimestamp +
        eased * (toTimestamp - fromTimestamp)) as ExperimentalMillisecondTimestamp;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

interface LockedTurn {
  dragDirX: number;
  dragDirY: number;
  fullTurnPx: number;
  t0: number;
  t1: number;
  originalAlg: Alg;
  progress: number;
  // Set once settling starts (by whichever happens first: the natural
  // release, or a new gesture interrupting this one) so a second caller
  // reuses the same in-flight settle instead of starting a competing one.
  settlePromise: Promise<void> | null;
  // Lets a later interrupting caller shrink an already-running settle's
  // remaining duration instead of leaving it to finish at its original,
  // un-rushed pace.
  requestExpedite: (() => void) | null;
  // How fast progress has been changing lately (progress-fraction per ms),
  // updated on every drag-scrub tick. A slow, deliberate drag and a fast
  // flick can cover the exact same remaining distance at release, but a
  // release duration sized only off that distance (the old
  // releaseDurationFor behavior) ran a fast flick's hand-off several times
  // slower than the finger had actually been moving -- feeling like a
  // sudden deceleration right where the finger let go, i.e. "not as smooth
  // as a slow drag." Tracking real velocity lets the release continue at
  // roughly the pace the finger was already going instead.
  progressPerMs: number;
  lastMoveAt: number;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  point: THREE.Vector3;
  lockingPromise: Promise<void> | null;
  locked: LockedTurn | null;
  // Kept up to date on every pointermove even before locking (and even
  // during the interrupt-settle wait inside lockDrag, while events are
  // otherwise ignored) so that once locking finishes, progress can be
  // computed from where the finger actually is right now instead of
  // defaulting to 0 -- see the comment in lockDrag for why that matters.
  latestDx: number;
  latestDy: number;
}

export interface SwipeTurningController {
  /** Turns swipe-to-turn gestures on/off without tearing down the listeners
   * (used to hand the same canvas over to cubing.js's own camera-orbit drag
   * while the user is just looking around, not solving). */
  setEnabled: (enabled: boolean) => void;
  detach: () => void;
}

const NOOP_CONTROLLER: SwipeTurningController = { setEnabled: () => {}, detach: () => {} };

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
export async function attachSwipeTurning(player: TwistyPlayer): Promise<SwipeTurningController> {
  const [canvas] = await waitForNonEmpty(() => player.experimentalCurrentCanvases());
  const [vantage] = await waitForNonEmpty(async () => [...(await player.experimentalCurrentVantages())]);
  if (!canvas || !vantage) return NOOP_CONTROLLER;

  const camera = await vantage.camera();
  const puzzleObj = (await player.experimentalCurrentThreeJSPuzzleObject()) as unknown as PG3DLike;
  if (!("experimentalGetControlTargets" in puzzleObj)) return NOOP_CONTROLLER;

  void applyRealisticCubeStyling(puzzleObj, vantage);

  canvas.style.touchAction = "none";
  let enabled = true;

  // stickerDat.axis holds 26 entries on a 3x3x3: 6 outer-face axes (F/B/U/D/L/R,
  // single-letter families) plus 8 corner axes (whole-cube "rotation" moves,
  // e.g. UFR) and 12 edge axes (slice moves, e.g. UF, used for "secondSlice").
  // We only ever want outer-face turns here, so the argmax search below must
  // be restricted to the 6 single-letter entries — otherwise a touch point
  // anywhere near an edge or corner of the cube (extremely common) matches a
  // corner/edge axis instead, producing a nonsense in-plane basis and turning
  // the wrong slice entirely.
  const faceAxes = puzzleObj.stickerDat.axis.filter((axis) => axis.quantumMove.family.length === 1);

  // Fixed world-space axis each slice family's *unprimed* direction rotates
  // around (unlike the per-touch `rotationAxisDir` computed below, whose sign
  // flips depending on which of the up to 4 surrounding faces was touched).
  // M follows L's turn direction, which is a positive (right-hand-rule) turn
  // about R's axis, not L's; same pattern for E~D (axis: U) and S~F (axis: B).
  const CANONICAL_SLICE_AXIS_FAMILY: Record<"M" | "E" | "S", string> = { M: "R", E: "U", S: "B" };
  function canonicalSliceAxis(family: "M" | "E" | "S"): THREE.Vector3 {
    const refFamily = CANONICAL_SLICE_AXIS_FAMILY[family];
    const axis = faceAxes.find((a) => a.quantumMove.family === refFamily)!;
    return new THREE.Vector3(...axis.coordinates).normalize();
  }

  const raycaster = new THREE.Raycaster();
  let drag: DragState | null = null;

  // Turns out three different designs for handling a new swipe starting
  // while the *previous* move is still settling were all broken in their own
  // way:
  //
  // 1. Let both animate concurrently, each racing to set player.timestamp on
  //    its own rAF schedule. Two different LockedTurns can each be mid-
  //    settle at once — e.g. three fast swipes queue up faster than their
  //    own natural releases finish — so this isn't just the *most recent*
  //    turn fighting the new one; an older, already-superseded turn's own
  //    delayed natural release can still be running and stomping writes,
  //    which read as a just-turned layer suddenly popping back out.
  // 2. Make the new gesture *wait* for the old one's full release to finish
  //    naturally before touching anything: a fast enough swipe's pointermove
  //    events are all dispatched and ignored — since lockDrag hasn't set
  //    `locked` yet — before the wait ever resolves, silently dropping the
  //    move entirely.
  // 3. Force an *instant*, unanimated snap the moment a new turn locks in:
  //    trades the problem for a different visible glitch — a fast swipe
  //    could interrupt the previous move a long way from finished, so the
  //    snap covered a large, sudden jump that itself looked like a pop.
  //
  // The actual fix: there must only ever be *one* settle in flight per
  // locked turn (not per "most recent" turn), and interrupting it should
  // speed up that same animation rather than start a second one alongside
  // it. `settleLocked` is idempotent per turn (a second caller just awaits
  // the first's existing promise), and `requestExpedite` lets an interrupting
  // caller shrink its remaining duration instead of leaving it at its
  // original, un-rushed pace.
  const INTERRUPT_CATCHUP_MS = 80;
  let activeLocked: LockedTurn | null = null;

  // The old version of this always sized the release purely off how much
  // distance was left, as if every drag moved at the same reference speed
  // (the whole turn in FULL_RELEASE_ANIMATION_MS). A slow, deliberate drag
  // already covers most of the distance during the drag itself, so its
  // (short) release is barely noticeable either way. But a fast flick
  // released more of the turn's distance for the release phase to cover, at
  // that same fixed reference pace — several times slower than the finger
  // had actually been moving — which read as an abrupt deceleration right
  // at the hand-off. If the finger's own measured speed is faster than the
  // reference, matching it keeps the release feeling like a continuation of
  // the same flick instead of suddenly downshifting. Slow/held drags (where
  // measured speed is at or below the reference) keep the old formula,
  // which already behaves fine there.
  function releaseDurationFor(locked: LockedTurn): number {
    const remaining = locked.progress >= COMMIT_PROGRESS_THRESHOLD ? 1 - locked.progress : locked.progress;
    const referenceSpeed = 1 / FULL_RELEASE_ANIMATION_MS;
    const speed = Math.abs(locked.progressPerMs);
    if (speed > referenceSpeed) {
      return Math.max(MIN_RELEASE_ANIMATION_MS, remaining / speed);
    }
    return Math.max(MIN_RELEASE_ANIMATION_MS, remaining * FULL_RELEASE_ANIMATION_MS);
  }

  // Deliberately does NOT clear `activeLocked` here, even when it currently
  // points at `locked` -- it gets left alone and simply superseded whenever
  // lockDrag assigns a newer turn to it. Nulling it out as soon as *any*
  // settle starts (the natural release included) was the actual remaining
  // bug: if a turn's own natural release won the race to call this before
  // the next swipe's lockDrag ran its interrupt check, that check would find
  // activeLocked already null and skip straight past -- so the next swipe
  // never expedited or awaited it, and the two settles (each unaware of the
  // other) animated concurrently, each stomping the other's writes to
  // player.timestamp. Once settled, calling this again is a cheap no-op (the
  // `settlePromise` guard below resolves immediately), so there's no harm in
  // activeLocked continuing to point at an already-finished turn until the
  // next lockDrag replaces it.
  function settleLocked(locked: LockedTurn): Promise<void> {
    if (locked.settlePromise) return locked.settlePromise;
    const committing = locked.progress >= COMMIT_PROGRESS_THRESHOLD;

    const promise = (async () => {
      const current = await player.experimentalGet.timestamp();
      let durationMs = releaseDurationFor(locked);
      const start = performance.now();
      locked.requestExpedite = () => {
        durationMs = Math.min(durationMs, performance.now() - start + INTERRUPT_CATCHUP_MS);
      };
      await animateTimestampTo(player, current, committing ? locked.t1 : locked.t0, () => true, () => durationMs);
      locked.requestExpedite = null;
      if (committing) {
        player.timestamp = "end";
      } else {
        player.alg = locked.originalAlg;
      }
    })();

    locked.settlePromise = promise;
    return promise;
  }

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
    if (!enabled) return;
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
      latestDx: 0,
      latestDy: 0,
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
    if (activeLocked) {
      activeLocked.requestExpedite?.();
      await settleLocked(activeLocked);
    }

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
      const family: "M" | "E" | "S" =
        Math.abs(rotationAxisDir.x) > 0.5 ? "M" : Math.abs(rotationAxisDir.y) > 0.5 ? "E" : "S";
      // Use the family's fixed canonical axis here, not `rotationAxisDir` —
      // that vector is derived from the touched face's own in-plane basis, so
      // its sign flips depending on which of the (up to 4) surrounding faces
      // was touched, which previously made the same swipe gesture resolve to
      // opposite moves depending on which face you grabbed.
      const canonicalAxis = canonicalSliceAxis(family);
      const tangent = new THREE.Vector3().crossVectors(canonicalAxis, point).normalize();
      const tangentScreen = screenDirFrom(point, tangent);
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

    // Deliberately doesn't bail out here just because `drag` has already
    // moved on to a newer gesture (e.g. the pointer was released, or even a
    // whole new swipe already started, while the interrupt-settle above was
    // in flight) -- finishDrag is already waiting on this same lockDrag call
    // via `target.lockingPromise` and will correctly commit or revert once
    // target.locked exists below, using progress caught up from the finger's
    // actual last-known position (see the catch-up block after this). An
    // earlier version reverted the move outright whenever `drag !== target`,
    // which conflated "this gesture was legitimately released" with "this
    // gesture never happened" -- discarding perfectly valid swipes whenever
    // the next one started before this one's async setup had finished.
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
      settlePromise: null,
      requestExpedite: null,
      progressPerMs: 0,
      lastMoveAt: performance.now(),
    };
    // Registered as soon as the move is committed to the alg (not only once
    // the pointer is released) so a fast next swipe can find and settle it
    // even if this one's finishDrag hasn't run yet.
    activeLocked = target.locked;

    // Catch up to wherever the finger actually is right now. While this
    // function was busy locking in the move (interrupt-settling the
    // previous turn included), onPointerMove kept updating latestDx/Dy but
    // skipped touching player.timestamp or progress -- target.locked didn't
    // exist yet for it to update. Left at progress 0, a swipe that was
    // dragged far (or even fully released) *during* that wait would look
    // aborted once finishDrag runs, since nothing else will have advanced
    // progress past its default in the meantime.
    const locked = target.locked;
    const projected = target.latestDx * locked.dragDirX + target.latestDy * locked.dragDirY;
    locked.progress = Math.min(Math.max(projected / locked.fullTurnPx, 0), 1);
    player.timestamp = (locked.t0 + locked.progress * (locked.t1 - locked.t0)) as ExperimentalMillisecondTimestamp;
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    drag.latestDx = dx;
    drag.latestDy = dy;

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
    const newProgress = Math.min(Math.max(projected / locked.fullTurnPx, 0), 1);

    const now = performance.now();
    const dt = now - locked.lastMoveAt;
    if (dt > 0) {
      const instantaneous = (newProgress - locked.progress) / dt;
      // Light smoothing so one noisy/coalesced event (a big dt with a big
      // jump, or vice versa) doesn't single-handedly set the release speed.
      locked.progressPerMs = locked.progressPerMs === 0 ? instantaneous : locked.progressPerMs * 0.5 + instantaneous * 0.5;
    }
    locked.progress = newProgress;
    locked.lastMoveAt = now;

    const scrubbed = locked.t0 + locked.progress * (locked.t1 - locked.t0);
    player.timestamp = scrubbed as ExperimentalMillisecondTimestamp;
  }

  async function finishDrag(target: DragState): Promise<void> {
    if (target.lockingPromise) await target.lockingPromise;
    const locked = target.locked;
    if (!locked) return;
    await settleLocked(locked);
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

  return {
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!value) drag = null;
    },
    detach: () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
    },
  };
}
