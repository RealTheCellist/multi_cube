# Mobile Gesture Axis Mapping Validation — v2 (Ambiguity Zone Mapping)

Follow-on to `GESTURE_AXIS_MAPPING_VALIDATION_V1.md`. That investigation
tested one touch point per face (front/top/right) with N=100 realistic
swipes each and found 0% misrecognition everywhere — but the user then
reported real, reliably-reproducible "wrong axis rotates" errors when
swiping in the default 3-face-visible view. This document reconciles that
discrepancy. **Diagnosis only — no code changes.**

## Method

Reused the same axis-decision instrumentation as v1 (temporarily added to
`customSwipeControls.ts`, reverted after measurement -- final diff is this
document only). Instead of one touch point per face, swept a 7x6 grid (42
touch points, 78 with a valid cube hit) across the entire visible canvas
in the default (never-orbited) camera pose, with a clean horizontal and a
clean vertical drag at each point. For each, recorded `Dot0`/`Dot1` (the
axis-alignment scores of the two candidate axes) and `margin = |Dot0 -
Dot1|` -- the gap between the winning and losing candidate. A small margin
means the decision is close to a coin flip: a realistic, slightly
imprecise human swipe can easily land on the "wrong" side of that margin.

## Finding

**21 of 78 sampled points (27%) have margin < 0.25**, concentrated in two
regions:

- The **top face** (`faceAxis=y`), roughly `xf=0.45-0.65, yf=0.15-0.55` in
  canvas-fraction coordinates -- i.e. most of the top face's visible
  surface in the default view.
- The **far edge of the right face** (`faceAxis=x`), around `xf=0.85`.

Several are essentially exact ties:

```
xf=0.85 yf=0.55 angle=0   faceAxis=x  Dot0=0.302 Dot1=0.306  margin=0.004
xf=0.85 yf=0.55 angle=90  faceAxis=x  Dot0=0.953 Dot1=0.952  margin=0.001
xf=0.85 yf=0.45 angle=90  faceAxis=x  Dot0=0.978 Dot1=0.992  margin=0.014
xf=0.55 yf=0.25 angle=0   faceAxis=y  Dot0=0.889 Dot1=0.867  margin=0.022
xf=0.65 yf=0.35 angle=90  faceAxis=y  Dot0=0.803 Dot1=0.823  margin=0.020
```

At these points, which candidate "wins" is effectively decided by noise
(a few pixels of hand tremor, which finger segment the touch lands on,
antialiasing-level differences) rather than by a clear geometric signal --
this is the direct mechanism behind "always wrong" on the top/right faces.

### Why v1's single-touch-point test missed this

v1 tested `(0.55, 0.22)` on the top face and `(0.75, 0.45)` on the right
face. Both happen to sit in comfortable margins in this sweep (not sampled
exactly, but neighboring points there show margins in the 0.2-0.4 range) --
those specific spots were not representative of the face as a whole. A
user's thumb naturally covers a wide area of the visible top/right face
while swiping, so it reliably lands in the 27%-of-surface ambiguous zone
sooner or later -- consistent with "무조건" (always/reliably) rather than
occasional.

### Consistency with v1's structural finding

v1 (STEP4) already established that `screenTangent()` is geometrically
correct -- it directly computes how each candidate axis's rotation would
move the touched point on screen, given the actual camera. This sweep
doesn't contradict that: the tangent computation is still correct at every
point. What's new is the quantified fact that on faces viewed at an
oblique angle in this camera's default pose, the two candidate tangent
directions can become nearly parallel (rather than close to perpendicular,
as they are on the front face) across a large fraction of the face's
surface -- collapsing the dot-product margin toward zero. This is the same
class of fact as v1's "the boundary isn't 45 degrees" finding, now shown
to be severe enough in specific screen regions to functionally break axis
selection there.

## Root Cause Classification

| Candidate | Verdict |
|---|---|
| A. Axis Mapping Bug (wrong axis picked for a given tangent pair) | No -- the code picks whichever candidate has the higher dot product, correctly, every time. |
| B. Screen Tangent Bug (tangent computed wrong) | No -- confirmed correct in v1 STEP4 and unchanged here. |
| C. Sign Bug | No -- out of scope for this finding, not implicated. |
| **D. Structural ambiguity from camera geometry** | **Yes, quantified.** On ~27% of the top/right face's visible surface in the default camera pose, the two candidate axes' screen tangents are close enough to parallel that dot-product margin is under 0.25 (many under 0.05) -- decision noise-dominated, not signal-dominated. |

## Not yet decided: what to do about it

This document stops at diagnosis, per the same scope constraint as v1 and
the frozen-baseline rule from the Gesture Feel Optimization sprint
(Direction Decision Algorithm / axis-selection formula must not be changed
without explicit sign-off). Rough candidate directions for a future
Blueprint, not evaluated or implemented here:

- Bias the default camera to a less-oblique angle for the top/right faces
  (reduces ambiguous surface area, but changes the visual presentation).
- Add a face-specific confidence gate: if margin is below a threshold at
  decision time, require more drag distance before committing (trades
  responsiveness for reliability specifically in ambiguous zones).
- Weight the tangent comparison by something other than raw screen-space
  dot product (e.g. incorporate the swipe's total distance-to-target
  ambiguity) -- needs its own STEP1-5 investigation to avoid touching the
  now-proven-solid front-face behavior.

No decision has been made on any of these; this is a factual record of
the sweep only.
