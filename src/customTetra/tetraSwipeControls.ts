import * as THREE from "three";
import type { CustomTetraScene } from "./CustomTetraScene";
import { axisVector, barycentricOf, depthFromVertex, FACE_VERTEX_INDICES, nearestFaceIndex, VERTEX_INDICES, VERTICES, type VertexIndex } from "./tetraMath";

// Same pixel/time constants as customSwipeControls.ts (see that file's
// extensive comments/validation docs for why these values) -- none of them
// are turn-angle-specific, so they carry over unchanged.
const DRAG_THRESHOLD_PX = 12;
const SETTLE_PX = 6;
const COMMIT_DISTANCE_FRACTION_OF_FULL_TURN = 0.4;
// How much of the canvas width a full 120-degree drag needs to cover.
// Scaled from the cube's 0.14 (a full 90-degree drag) by 120/90 -- a
// starting value, not empirically validated on a real device yet (the
// cube's own equivalent constant went through several real-device
// revisions before landing on 0.14; expect this one to need the same).
const FULL_TURN_FRACTION_OF_WIDTH = 0.19;
const COMMIT_PROGRESS_THRESHOLD = 0.3;
const RELEASE_ANIMATION_MS = 220;
const CATCH_UP_MS = 80;

export interface TetraSwipeController {
  setEnabled(enabled: boolean): void;
  onCommit: ((moveCount: number) => void) | null;
  detach(): void;
}

interface TetraCandidate {
  vertexIndex: VertexIndex;
  depth: number;
}

interface LockedTurn {
  vertexIndex: VertexIndex;
  depth: number;
  screenDir: THREE.Vector2;
  fullTurnPx: number;
  progress: number;
}

interface PendingPick {
  candidate: TetraCandidate;
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
  // Static plane of the touched face, fixed at touchdown -- see
  // classifyTetraCandidate below.
  facePlane: THREE.Plane;
  candidates: TetraCandidate[];
  locked: LockedTurn | null;
  settleRef: { x: number; y: number } | null;
  pending: PendingPick | null;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function worldToScreen(scene: CustomTetraScene, point: THREE.Vector3, rect: DOMRect): THREE.Vector2 {
  const ndc = point.clone().project(scene.camera);
  return new THREE.Vector2((ndc.x * 0.5 + 0.5) * rect.width, (1 - (ndc.y * 0.5 + 0.5)) * rect.height);
}

// Same cross-product identity as the cube's screenTangent (axisVector(axis)
// there, axisVector(vertexIndex) here) -- the instantaneous screen-space
// direction a point moves in under rotation about the given axis.
function screenTangent(scene: CustomTetraScene, hitPoint: THREE.Vector3, vertexIndex: VertexIndex, rect: DOMRect): THREE.Vector2 {
  const tangentWorld = axisVector(vertexIndex).clone().cross(hitPoint);
  const a = worldToScreen(scene, hitPoint, rect);
  const b = worldToScreen(scene, hitPoint.clone().addScaledVector(tangentWorld, 0.05), rect);
  return b.sub(a).normalize();
}

// Normalized version of the same cross product, for dot-product scoring in
// classifyTetraCandidate -- normalized so candidates at different distances
// from their own axis are compared fairly (a raw cross product's magnitude
// scales with that distance, which has nothing to do with direction match).
function tetraTangentWorld(vertexIndex: VertexIndex, point: THREE.Vector3): THREE.Vector3 {
  return axisVector(vertexIndex).clone().cross(point).normalize();
}

/**
 * Which vertex/depth axes a touch at `hitPoint` could mean. A cube always
 * has exactly 2 candidates by construction; a tetrahedron has 1-3, because
 * its topology genuinely differs (verified against the real N=3 grid, see
 * the plan doc): a TIP sticker only has one valid candidate (its own vertex
 * at depth=1 -- no ambiguity to resolve at all), an EDGE sticker has 2
 * (both depth=2, needs disambiguating by drag direction), and the central
 * AXIAL sticker on each face can have all 3 (a real Pyraminx's fixed center
 * facelet sits at the literal meeting point of three different corner-turn
 * regions -- touching it and twisting is exactly how you turn any of those
 * corners on a physical puzzle, so this is correct, not a bug to work
 * around).
 */
function candidatesForHit(hitPoint: THREE.Vector3, layerCount: number): TetraCandidate[] {
  const faceIndex = nearestFaceIndex(hitPoint);
  const candidates: TetraCandidate[] = [];
  for (const v of FACE_VERTEX_INDICES[faceIndex]) {
    const raw = depthFromVertex(hitPoint, v, layerCount);
    // Touching exactly at a vertex reads as depth 0 (barycentric weight
    // exactly 1) -- clamped UP to 1 (the shallowest real turn), not
    // discarded, since depth 0 isn't a turn at all.
    const depth = raw <= 0 ? 1 : raw;
    if (depth <= layerCount - 1) candidates.push({ vertexIndex: v, depth });
  }
  return candidates;
}

// Same technique as the cube's classifyByFacePlane (raycast the CURRENT
// pointer position onto a plane fixed at touchdown, not a live screen-angle
// comparison -- see that file's long comment on why angle comparison is
// mathematically incapable of 100% accuracy), generalized from "which of 2
// orthogonal in-plane components dominates" to "which of 1-3 candidates'
// exact rotation tangents the raycasted displacement best aligns with" --
// the tetrahedron's candidate directions aren't an orthogonal pair, so a
// dot-product score against each candidate's own tangent is the correct
// generalization rather than a component split.
function classifyTetraCandidate(
  raycaster: THREE.Raycaster,
  scene: CustomTetraScene,
  ndc: THREE.Vector2,
  hitPoint: THREE.Vector3,
  facePlane: THREE.Plane,
  candidates: readonly TetraCandidate[],
): TetraCandidate {
  raycaster.setFromCamera(ndc, scene.camera);
  const current = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(facePlane, current)) return candidates[0];
  const delta = current.sub(hitPoint);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = Math.abs(delta.dot(tetraTangentWorld(c.vertexIndex, hitPoint)));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function ndcFromEvent(e: PointerEvent, rect: DOMRect): THREE.Vector2 {
  return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
}

// Duplicated from customSwipeControls.ts rather than imported/extracted --
// that file is a validated, heavily-tuned reference; risking a shared
// refactor there for this pass isn't worth it. Worth revisiting once this
// module is itself proven out.
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

/**
 * Finds the world point a touch landed on: retries a small ring of pixel
 * offsets against the real sticker/backing meshes first (same rationale as
 * the cube's raycastNear -- a touch can land in the thin inset gap between
 * stickers), then falls back to intersecting the ray against the
 * tetrahedron's own 4 REAL face planes directly (not a padded proxy mesh --
 * barycentricOf is an affine function built around VERTICES, and a
 * uniformly-scaled proxy copy wouldn't preserve barycentric classification
 * in an easily-provable way), accepting a modest overshoot past the true
 * triangle edge.
 */
function raycastTetraNear(scene: CustomTetraScene, raycaster: THREE.Raycaster, clientX: number, clientY: number, rect: DOMRect): THREE.Vector3 | null {
  for (const [dx, dy] of MISS_RETRY_OFFSETS_PX) {
    const ndcEvent = { clientX: clientX + dx, clientY: clientY + dy } as PointerEvent;
    raycaster.setFromCamera(ndcFromEvent(ndcEvent, rect), scene.camera);
    const [hit] = raycaster.intersectObjects(scene.raycastableObjects(), false);
    if (hit) return hit.point.clone();
  }
  const ndcEvent = { clientX, clientY } as PointerEvent;
  raycaster.setFromCamera(ndcFromEvent(ndcEvent, rect), scene.camera);
  const SLOP = 0.08;
  let best: { point: THREE.Vector3; dist: number } | null = null;
  for (const f of VERTEX_INDICES) {
    const normal = axisVector(f).clone().negate();
    const refPoint = VERTICES[FACE_VERTEX_INDICES[f][0]]; // any vertex of face f lies exactly on its own plane
    const plane = new THREE.Plane(normal, -normal.dot(refPoint));
    const pt = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, pt)) continue;
    const bary = barycentricOf(pt);
    const withinFace = FACE_VERTEX_INDICES[f].every((vi) => bary[vi] >= -SLOP);
    if (!withinFace) continue;
    const dist = raycaster.ray.origin.distanceTo(pt);
    if (!best || dist < best.dist) best = { point: pt, dist };
  }
  return best?.point ?? null;
}

export function attachTetraSwipeTurning(scene: CustomTetraScene, moveCountRef: { current: number }): TetraSwipeController {
  const dom = scene.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  let enabled = true;
  let drag: DragState | null = null;
  let releaseCancel: (() => void) | null = null;
  let releaseTarget: 1 | -1 | null = null;
  let catchUp: CatchUpTween | null = null;
  const controller: TetraSwipeController = {
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

  // A new gesture can start before the previous swipe's release tween
  // finishes -- see customSwipeControls.ts's interruptRelease for the same
  // rationale.
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
    const { candidate, screenDir } = drag.pending;
    if (!scene.beginTurn(candidate.vertexIndex, candidate.depth)) {
      drag = null;
      return false;
    }
    const fullTurnPx = rect.width * FULL_TURN_FRACTION_OF_WIDTH;
    const projected = dx * screenDir.x + dy * screenDir.y;
    const progress = Math.max(-1, Math.min(1, projected / fullTurnPx));
    drag.locked = { vertexIndex: candidate.vertexIndex, depth: candidate.depth, screenDir, fullTurnPx, progress };
    scene.setTurnProgress(0);
    catchUp = { startTime: performance.now(), fromProgress: 0, toProgress: progress, displayed: 0 };
    requestAnimationFrame(stepCatchUp);
    return true;
  }

  function onPointerDown(e: PointerEvent) {
    if (!enabled || e.button !== 0) return;
    if (releaseCancel) interruptRelease();
    const rect = dom.getBoundingClientRect();
    const hitPoint = raycastTetraNear(scene, raycaster, e.clientX, e.clientY, rect);
    if (!hitPoint) return;

    const candidates = candidatesForHit(hitPoint, scene.layerCount);
    if (candidates.length === 0) return; // believed unreachable -- every surface point has >=1 valid candidate

    const faceIndex = nearestFaceIndex(hitPoint);
    // Face f's outward normal is exactly -axisVector(f): the centroid of
    // face f's own 3 vertices is, by construction, in the -axisVector(f)
    // direction from the origin (the 4 vertex directions from the
    // tetrahedron's centroid sum to zero). Must .clone() before .negate()
    // -- axisVector() returns a shared singleton Vector3 (see tetraMath.ts),
    // and mutating it in place would corrupt every other turn's axis math.
    const faceNormal = axisVector(faceIndex).clone().negate();
    const facePlane = new THREE.Plane(faceNormal, -faceNormal.dot(hitPoint));

    dom.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, hitPoint: hitPoint.clone(), facePlane, candidates, locked: null, settleRef: null, pending: null };
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

      // A single candidate (a tip touch) needs no classification at all --
      // skip the raycast-and-score step entirely.
      const chosen =
        drag.candidates.length === 1
          ? drag.candidates[0]
          : classifyTetraCandidate(raycaster, scene, ndcFromEvent(e, rect), drag.hitPoint, drag.facePlane, drag.candidates);
      const screenDir = screenTangent(scene, drag.hitPoint, chosen.vertexIndex, rect);
      drag.pending = { candidate: chosen, screenDir };

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
