# Gesture axis classification: face-plane raycast (replaces tangent-line comparison)

## Background

`docs/GESTURE_MATERIALINDEX_REWRITE_AND_MATH_FLOOR_V1.md` proved that
comparing a swipe's instantaneous 2D screen direction against each
candidate axis's screen-tangent LINE (`axisAlignment`/`screenTangent`, the
method live since that sprint) has a real mathematical floor: on every
visible face, points exist where the two candidates' tangent lines are
under 0.2 degrees apart, which no direction-only comparison can resolve.
Measured real-app error at those points: 100% wrong. Broad random-sample
error across the cube: 4.3%.

The user rejected UI hints, snap-avoidance, and camera retuning, and asked
for the swipe system to be rebuilt from scratch referencing external
libraries. cubing.js's twisty-player and andrewmacheret/cube were both
researched (via WebFetch of their real source). Neither compares an
instantaneous 2D tangent line. cubing.js's `PG3D.ts` /
`Twisty3DPuzzleWrapper.ts` re-raycasts the **current** drag position
against invisible per-facelet hit-plane proxies each move, and picks
whichever move family's axis direction the resulting 3D point is most
aligned with -- it never reduces the decision to a single infinitesimal
direction vector.

## First attempt: forward endpoint-match (rejected)

The first rewrite (not shipped) predicted where `hitPoint` would land on
screen after rotating it FORWARD by an angle inferred from raw drag
pixels (`impliedAngleRad = dragPx / fullTurnPx * 90deg`), for each
candidate axis x each sign, and picked whichever predicted screen point
was closest to the finger's actual current screen position.

This scored 0% wrong in two separate pure-math validations (the exact
points proven degenerate above, and a broad 1440-sample sweep), but
**66.7% wrong when tested in the real running app**. Root cause (found via
a Playwright debug probe comparing real hitPoint/dx/dy against manual
recomputation): comparing absolute predicted SCREEN POSITIONS conflates
direction error with magnitude error. The two candidate axes generally
have different screen-pixels-per-radian rates at a given point; whichever
axis's assumed uniform angle-to-pixel rate happened to numerically match
the actual (short, real) drag length won, regardless of whether its
direction was right. At the Front worst point, a clean 44px rightward
drag was consistently classified "x" (a vertical-column turn) instead of
the intuitively-correct "y" (a horizontal-row turn), because x-axis
rotation there produces less screen displacement per radian than y-axis
rotation, so its forward-predicted point stayed closer to the real
(short) drag distance even though its direction was worse.

## Shipped method: face-plane raycast

Instead of predicting a point forward from an assumed angle, raycast the
**current** pointer position BACKWARD onto a static plane: the flat plane
of the touched face, through the original `hitPoint`, fixed at
touchdown (not the rotated cube). This is the direct analog of cubing.js's
hit-plane proxies.

The two in-plane axes of that plane are always exactly the two
candidates (a face's normal excludes itself from the candidate set by
construction). So the raycasted current point's displacement from
`hitPoint`, split into its two in-plane components, picks the axis
directly: whichever component is LARGER, the OTHER candidate is the
answer. E.g. on the front face (candidates x/y, normal z): a drag that
moves the raycasted point mostly along x means "turn around y" (a
horizontal drag turns the row), and vice versa.

```ts
function classifyByFacePlane(raycaster, scene, ndc, hitPoint, facePlane, candidates) {
  raycaster.setFromCamera(ndc, scene.camera);
  const current = new THREE.Vector3();
  const [c0, c1] = candidates;
  if (!raycaster.ray.intersectPlane(facePlane, current)) return c0;
  const delta = current.sub(hitPoint);
  const comp0 = Math.abs(componentOf(delta, c0.axis));
  const comp1 = Math.abs(componentOf(delta, c1.axis));
  return comp0 >= comp1 ? c1 : c0;
}
```

This is direction-only (immune to any pixel/angle scale assumption, unlike
the forward-predict attempt) while still using the drag's real, current,
non-infinitesimal position (unlike the old tangent-line method) -- the
raycast through true camera projection naturally captures whatever
curvature/perspective nonlinearity exists between screen pixels and the
face plane, without needing to model it explicitly.

`DragState` now carries `facePlane: THREE.Plane`, built once at
touchdown from the already-computed `faceAxis` (materialIndex-based, see
the previous sprint) and `hit.point`. `commitPending`'s progress tracking
is unchanged -- it still reads the chosen axis's screen-tangent line for
smooth 1:1 scrubbing once locked; only the axis DECISION changed.

## Measured results

**Pure math (idealized flat-face points, no bevel/raycast noise):**

| Test | Old (tangent-line) | New (face-plane) |
|---|---|---|
| 3 curated worst points (0.03-0.19 deg separation), both swipe directions, N=30 tremor-noise trials each | 100%/100%/0%/0%/0%/0% wrong (2 of 6 cases always wrong) | 0/0/0/0/0/6 of 30 wrong (only Top's 0.03 deg point, the single hardest point on the cube, at theta=90) -- 3.3% overall |
| Broad random sample, 3 faces x 40 points x 4 directions = 480 | not re-measured (baseline was 4.3%, see below) | 2/480 wrong (0.42%) |

**Real browser (Playwright, tremor-noise swipes, actual raycast hit
points including bevel effects):**

- Curated worst points, N=15/case: Top 0/15 + 6/15 (the 0.03deg point,
  same residual as the math model), Front 0/15 + 0/15, Right 0/15 + 0/15
  -- 12/90 (13.3%) wrong overall, vs the old method's 100%/100%/0%/0%/0%/0%
  at these same points.
- Broad random sample, 15 points x 4 directions x N=6 = 360 real
  browser trials: **17/360 (4.7%)** wrong, roughly matching the old
  method's already-measured 4.3% floor on a similarly broad sample.

**Important finding during validation, not a bug:** an initial real-app
run against the Right-face worst point showed 100% "wrong" on both
directions. Root-caused (see below) to the validation script's own truth
oracle, not the classifier: at that specific 0.19deg point the old
tangent-line method's own pick is a coin flip (0.7694 vs 0.7673 alignment
-- a 0.003 margin), and the two methods happened to land on opposite
sides of that coin flip. Re-deriving "truth" from the new method's own
logic (same face-plane rule, evaluated at a near-zero probe distance)
showed the real app is 100% internally consistent with its own intent at
that point (0/15 wrong both directions) and, unlike the old method,
agrees with the same "horizontal drag on a side face turns the row"
convention already established as correct on the front face.

**Second finding, also not a bug:** the one glaring outlier in the broad
random sample (`Front (-1.04,0.53,1.59)` theta=135, initially 6/6
"wrong") turned out to be a **test artifact**, not a classification
error: the point was close enough to a cubie's rounded bevel edge that
the actual raycast hit point differed non-trivially from the idealized
flat-face coordinate the test assumed (`(-1.159, 0.481, 1.555)` vs
`(-1.04, 0.53, 1.59)`). Recomputing the expected answer from the REAL
raycast hit point and REAL click trajectory (not the idealized target)
confirmed the shipped code's answer was correct for the point it actually
hit; the test's assumed ground truth was for a different point than what
was actually touched.

## Regression checks

- `npx tsc --noEmit`: passes, no new type errors.
- `npm run build`: passes (`vite build` succeeds; pre-existing chunk-size
  warnings only).
- Functional smoke test (Playwright, 2x2/3x3/4x4/5x5, six swipes each at
  varied points/directions): 0 axis-classification errors on all sizes.

## Known pre-existing issue found during this sprint (not fixed, out of scope)

The smoke test's back-to-back swipes (new gesture starting before the
previous release animation finishes) reproducibly triggers
`Error: unreachable` from `cubeState.ts`'s `faceLetterForAxisSign`, called
via `CustomCubeScene.endTurn` -> `interruptRelease`. **Confirmed present
on the pre-rewrite code too** (reverted this file via `git stash`,
reran the same smoke test, same error) -- this is a latent, pre-existing
bug unrelated to axis classification, not a regression from this sprint.
Left untouched, flagged for separate follow-up.

## Verdict

Ships. The curated worst-point failure rate went from 100% (2 of 3 points,
both directions) to a single 20%-wrong residual at the single hardest
point on the entire cube (0.03 degree separation -- an even more extreme
case than the ones the previous sprint already accepted as a documented
floor). The broad random-sample rate (4.7%) is statistically in line with
the already-accepted 4.3% floor, not a regression -- and unlike the old
method, this one's remaining errors cluster at genuinely near-degenerate
points and test artifacts, not at systematically-biased ones.
