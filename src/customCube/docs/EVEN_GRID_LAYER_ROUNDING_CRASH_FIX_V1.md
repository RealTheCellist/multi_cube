# `Error: unreachable` crash on rapid consecutive swipes -- root cause found and fixed

## Background

A pre-existing crash (`Error: unreachable` from `cubeState.ts`'s
`faceLetterForAxisSign`) was discovered during this session's gesture-fix
work, confirmed present before any of that work too (via `git stash`), and
explicitly left out of scope at the time -- reproducible only via rapid,
back-to-back swiping (each new gesture interrupting the previous turn's
still-in-flight release animation).

## Diagnosis

Added a temporary `console.log` right before the crashing call in
`CustomCubeScene.ts`'s `endTurn()`, then reproduced via Playwright (rapid,
no-gap swipes on a 2x2). The log right before the crash:

```
{gridSize: 2, axis: "x", layer: -0, commitSign: -1, sign: -0}
```

`turn.layer` was `-0` -- JavaScript's negative zero. `Math.sign(-0)` is
`-0`, which is `===` neither `1` nor `-1`, so `faceLetterForAxisSign`'s
loop over `FACE_TURNS` never finds a match and throws.

## Root cause

`customSwipeControls.ts`'s candidate-layer snapping, for even grid sizes:

```ts
const rounded = isEvenGrid ? Math.round(raw * 2) / 2 : Math.round(raw);
```

`Math.round(raw * 2) / 2` rounds to the nearest multiple of 0.5 -- which
includes whole integers (0, 1, 2, ...) whenever `raw` is close to one. On
an even grid there is no layer 0 (valid layers are only odd multiples of
0.5: 0.5, 1.5, ...), so a `raw` value near an integer boundary rounds to
an invalid layer.

This can happen from an ordinary touch near the seam between two columns,
but is much more likely during rapid/interrupted swipes: a touch whose
raycast lands on a cubie that's a member of a still-animating previous
turn isn't constrained to a resting position, so its hit point's
coordinate can land anywhere along the turn's arc -- including much closer
to an integer boundary than any resting cubie's surface normally would.

Confirmed **not** a duplicate of the earlier `matrixWorld`-staleness fix
from this session (that one was about which face axis a touch resolves
to; this one is about the layer *index* along an already-correct axis) --
distinct bug, same general "cubie isn't in its resting position" root
cause family.

## Fix

```ts
const rounded = isEvenGrid ? Math.floor(raw) + 0.5 : Math.round(raw);
```

`Math.floor(raw) + 0.5` always lands on the nearest odd multiple of 0.5 --
there is no `raw` value for which this produces an integer, closing the
crash regardless of why `raw` ended up near a boundary.

## Measured results

**Direct reproduction** (the exact rapid-swipe pattern that found the
bug): crash before fix, clean after.

**Broad stress test** (Playwright, 60 rapid no-gap randomized swipes x
2x2/3x3/4x4/5x5 = 240 total, deliberately biased toward face-center/seam
touch points): **0 errors on all 4 grid sizes** (console errors AND page
errors, both checked).

**Regression**: `npx tsc --noEmit`, `npm run build` pass. Odd-grid path
(`Math.round(raw)`, gridSize 3/5) untouched.

## Verdict

Ships. This was the pre-existing crash flagged (but not fixed) during
`GESTURE_ROTATION_AWARE_FACE_AXIS_V1.md` and `GESTURE_FACE_PLANE_RAYCAST_V1.md`.
