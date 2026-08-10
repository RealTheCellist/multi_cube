# Face-axis identification was rotation-blind (the actual root cause)

## Symptom

After shipping `GESTURE_FACE_PLANE_RAYCAST_V1.md`, the user reported the
opposite of what the measured numbers said: "over half of real swipes turn
the wrong axis, everywhere -- not just at edges." Every synthetic
validation in this session (three different axis-decision algorithms
across multiple sprints) had shown low single-digit error rates. Something
the tests weren't exercising was badly broken in real play.

## Diagnosis

A temporary on-screen debug overlay (gated behind `?gestureDebug=1`, see
`customSwipeControls.ts`'s `DEBUG_OVERLAY_ENABLED` block) was added so a
real-device screen recording could show the live classification without
needing devtools access on a phone. The user's recording showed:

```
DOWN: faceAxis=y hit=(1.58,-0.09,-1.47) candidates=[x:1, z:-1]
```

`faceAxis=y` claims the touched face's normal points along world Y (top or
bottom face) -- but the hit point's own Y coordinate is `-0.09`, nowhere
near `+/-1.59` (the cube's half-extent). A real top/bottom-face hit's Y
coordinate has to be near the extreme. This is internally inconsistent:
whatever face was actually touched, it wasn't a Y-normal one.

## Root cause

`axisForMaterialIndex` (added in the prior `GESTURE_MATERIALINDEX_REWRITE`
sprint, replacing a normal-based lookup to fix bevel-curvature drift) used
a **static** table, `AXIS_BY_MATERIAL_INDEX = ["x","x","y","y","z","z"]`,
mapping a hit face's `materialIndex` (0-5, BoxGeometry's fixed local face
group order) directly to a world axis. That's only correct if the touched
cubie's mesh is still in its solved-orientation transform.

It isn't, for almost every cubie, almost all the time. `endTurn()` commits
a turn via `cubeGroup.attach(mesh)`, which bakes the turn's rotation into
the mesh's permanent local transform. `materialIndex 0` ("local +x",
assigned once at construction time from that cubie's solved-state
stickers) keeps meaning "local +x" forever -- but local +x stops pointing
at world +x the instant that cubie is turned. The static table was
silently reading a LOCAL, construction-time-only property as if it were a
WORLD, always-valid one.

Every previous validation in this session -- across three different axis
DECISION algorithms -- reset the cube (`리셋`) before every single trial,
so every touched cubie was always still in its solved orientation. That
made the bug invisible to every test, while making it the dominant failure
mode in any real, continuous play session (scramble once, then dozens of
moves without resetting -- exactly what real usage looks like).

This is upstream of and unfixable by anything in `customSwipeControls.ts`
itself: `axisForMaterialIndex` decides which 2 axes are even offered as
candidates, before any tangent-line/endpoint-match/face-plane-raycast
logic ever runs. A wrong candidate PAIR can't be fixed by improving how
one candidate is chosen from it.

## Fix

`axisForMaterialIndex` now takes the hit `object` and transforms the
exact LOCAL_FACE_SLOTS direction for that materialIndex by the mesh's
CURRENT world matrix, then takes the dominant component of the result --
instead of a static table lookup:

```ts
axisForMaterialIndex(materialIndex: number | undefined, object: THREE.Object3D): Axis | undefined {
  if (typeof materialIndex !== "number") return undefined;
  const localDir = LOCAL_FACE_SLOTS[materialIndex]?.dir;
  if (!localDir) return undefined;
  const worldDir = localDir.clone().transformDirection(object.matrixWorld);
  const ax = Math.abs(worldDir.x), ay = Math.abs(worldDir.y), az = Math.abs(worldDir.z);
  return ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z";
}
```

This keeps both properties the original materialIndex rewrite wanted:
`LOCAL_FACE_SLOTS[materialIndex].dir` is still an exact, discrete unit
vector (no bevel curvature involved, unlike the raw hit normal), and
transforming it by the mesh's real current rotation makes it correct
regardless of how many times that cubie has been turned. Real cube turns
are always exact 90-degree-multiple rotations, so the transformed result
stays exactly axis-aligned (up to float precision) no matter how many
turns have accumulated -- this isn't an approximation, it's the same
exactness the static table had, just evaluated against the mesh's actual
current orientation instead of an assumed one.

The now-unused `AXIS_BY_MATERIAL_INDEX` constant was removed.

## Measured results

**Direct reproduction** (real app, cube scrambled via the actual UI
button first -- not reset -- then 27 face-CENTER touches, one per point,
spread evenly across all 3 visible faces):

| | Before fix | After fix |
|---|---|---|
| Internally-inconsistent faceAxis (reported axis's own hit-point coordinate far from the cube's true surface) | **19/27 (70%)** | **0/27 (0%)** |

**End-to-end swipe accuracy on a scrambled (not reset) cube** (real app,
tremor-noise swipes, 3 faces x 5 points x 2 directions = 30 trials, no
reset between trials -- matching real continuous play for the first time
in this session's validation history):

**1/30 (3.3%) wrong** -- back in line with the already-documented
~4.3% geometric floor for pure direction classification (see
`GESTURE_MATERIALINDEX_REWRITE_AND_MATH_FLOOR_V1.md`), not the 50%+ the
user was experiencing.

## Regression checks

- `npx tsc --noEmit`, `npm run build`: pass.

## Follow-up (same sprint): stale matrixWorld on rapid consecutive swipes

A second real-device recording, taken right after this fix deployed,
still showed one inconsistent case:
`DOWN: faceAxis=z hit=(1.59,1.05,-1.09)` -- x is at the true surface
(+half), but z (the reported face axis's own coordinate) is nowhere near
+/-half. The recording showed very fast, back-to-back swiping -- each new
touch landing before the previous turn's release animation had visibly
settled.

Root cause: `syncMeshTransform` (called from `endTurn`'s `finally` block,
including via `onPointerDown`'s `interruptRelease()` -> `endTurn()` path
for a new gesture that starts while the previous one is still animating)
only sets `mesh.position`/`mesh.quaternion` -- the LOCAL transform.
`mesh.matrixWorld` -- what raycasting and `axisForMaterialIndex`'s
`transformDirection` actually read -- isn't recomputed until the next
render frame's automatic `updateMatrixWorld()`. A new gesture's raycast,
happening synchronously in the same event handler right after
`interruptRelease()` forces an immediate `endTurn()`, can run before that
next frame -- reading a stale world matrix that still reflects the
mesh's pre-turn orientation.

Fix: `syncMeshTransform` now calls `mesh.updateMatrixWorld(true)`
immediately after setting position/quaternion, so every call site
(committed turns, undo, reset, scramble) is guaranteed current the
instant it returns, regardless of whether a render frame has happened
since.

**Measured** (real app, cube scrambled, 40 rapid swipes with only a 40ms
gap between release and the next touchdown -- deliberately overlapping
`RELEASE_ANIMATION_MS`/`CATCH_UP_MS`, which a literal 0ms gap mostly just
drops instead of exercising): confirmed the test reproduces the bug
without the fix (1 mismatch reproduced on a small sample after reverting
just this change), and **0/40 mismatches with the fix in place**.

## Verdict

Between the two fixes in this sprint -- neither of which touched the
axis-decision algorithm at all -- this is the real cause of the user's
"wrong axis everywhere, over half the time" report. Ships together with
the face-plane raycast decision logic from the previous sprint.

## Still temporary: debug overlay

The `?gestureDebug=1` on-screen overlay added to diagnose this is still
in `customSwipeControls.ts`, left in for one more round of real-device
confirmation. Remove it once the user confirms the fix on their own
device.
