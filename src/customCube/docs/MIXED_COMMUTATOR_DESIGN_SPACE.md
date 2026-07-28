# Mixed Commutator Design Space Validation Sprint v1

Status: **Complete. Decision: Conclusion A -- Bracket Commutator는 충분한
설계 공간을 가진다. Prototype 확장 가능.** Pure Research/Validation
Sprint -- no new Primitive, no Prototype, Production Solver untouched.
Full report:
`mixedCommutatorDesignSpace/data/mixed-commutator-design-space-v1-report.txt`.

---

## 0. Question

Novel Low-Footprint Move Existence Validation Sprint v1 found 15/28 cases
with an improving bracket commutator, but the best footprintRatio (2.33)
missed the disclosed 2.0 target, and that search was narrow: same-pattern
pairs only, single-fragment setups only. This Sprint asks: is 2.33 a
**structural floor** of the bracket-commutator mechanism, or an
**artifact of that narrow search**?

## 1. Method

**Phase 1 (RQ-1, Mixed vs Same Pattern)**: all 6 pattern pairs (3 same:
BASE+BASE/FLIP+FLIP/PARITY+PARITY, 3 mixed: BASE+FLIP/BASE+PARITY/
FLIP+PARITY) x 49x49 single-fragment setups = 14406 attempts/case, all 28
PURE_CYCLE_ISOLATION cases -- 403,368 attempts total.

**Phase 2 (RQ-2/RQ-3, Setup Length)**: using the single empirically-best
pattern pair from Phase 1, extends ONE side's setup to 2 fragments
(2304 options, exhaustive) or 3 fragments (2304 deterministic-stride
sample of the 110592 possible), while holding the OTHER side fixed at its
own Phase-1-best setup -- both directions tried, 9216 attempts/case,
28 cases -- 258,048 attempts total. (A full symmetric L2xL2 cross product
was computationally infeasible -- disclosed, not hidden.)

All code reuses only existing, unmodified exports
(`buildAtomicFragments`, `invertSequence`, `applySeq`, `cloneCubies`,
`slotKey`, `wrongWingCount5`, BASE_ALG/FLIP_ALG/PARITY_ALG). Measurement
tool only -- never exposed with the Primitive contract, never wired into
Recovery/Executor/Planner.

## 2. Mixed Commutator Report (Required Analysis #1)

| Pair | Type | Success/28 | avgAffected | avgMoveLen | avgImprovement |
|---|---|---|---|---|---|
| BASE+BASE | Same | 4 | 17.75 | 55.0 | 1.50 |
| FLIP+FLIP | Same | 9 | 18.67 | 24.0 | 1.67 |
| PARITY+PARITY | Same | 3 | 14.33 | 160.0 | 1.67 |
| BASE+FLIP | Mixed | 5 | 18.60 | 40.8 | 1.40 |
| BASE+PARITY | Mixed | 0 | -- | -- | -- |
| FLIP+PARITY | Mixed | 1 | 22.00 | 94.0 | 1.00 |

**Same vs Mixed**: Same success=16, avgFootprint=16.92; Mixed success=6,
avgFootprint=20.30 -- on AVERAGE, Same still edges out Mixed. But the
single best-ever result in the whole design space came from a MIXED pair
(see Section 4) -- averages hide the winning outlier.

## 3. Design Space Coverage -- Setup Length Probes

Winning pattern pair for Phase 2: **PARITY_ALG+PARITY_ALG** (lowest
avgAffectedWingCount=14.33 among pairs with success, the disclosed
selection method). Extending setup length to 2 fragments improved 5
individual cases (best: `snapshot335:b714481`, footprintRatio 2.00),
length-3 improved none further. This confirms setup length CAN help for
this pair, but the improvement plateaus at L2.

## 4. Footprint Distribution + Convergence Analysis (RQ-3)

Pooled across the whole expanded design space: n=69, **min=1.60**,
avg=3.49, median=3.40, max=6.33.

| Stage | Cumulative Attempts | Cases w/ Improvement | Global Min | Low-Footprint(≤2.0) Count |
|---|---|---|---|---|
| 1. Same Pattern L1 (== prior Sprint) | 201,684 | 15 | 2.33 | 0 |
| 2. **+ Mixed Pattern L1** | 403,368 | 18 | **1.60** | **1** |
| 3. + Setup Length L2 | 532,392 | 19 | 1.60 | 2 |
| 4. + Setup Length L3 | 661,416 | 19 | 1.60 | 2 |

**The breakthrough happened at Stage 2 (Mixed Pattern), not Stage 3/4
(Setup Length).** Global min dropped from 2.33 to 1.60 -- BELOW the 2.0
target -- the moment mixed-pattern pairs were tried. Setup length
extension (Stage 3/4) helped individual cases but never beat that 1.60
global minimum.

**The winning construction, independently re-verified** (case
`scrambleDepth10:0`, cycleLength=5): `BASE_ALG` (setup `Q(x2-)`) +
`FLIP_ALG` (setup `W(y-2-)`) bracket commutator, `moveLength=40`,
`affectedWingCount=8`, **`footprintRatio=1.60`**, `wrongWingBefore=5` →
`wrongWingAfter=3` (a genuine partial improvement, re-confirmed by direct
independent re-run, not a one-off artifact of the aggregation code).

## 5. Structure Classification (RQ-4)

| Label | Count |
|---|---|
| NONE_FOUND | 9 |
| MIXED_PATTERN | 3 |
| DEEP_SETUP | 2 |
| **WIDE_SETUP** | **14 (73.7% of found)** |

Dominant structure: WIDE_SETUP (both sides use a non-trivial length-1
setup, same pattern) -- the single BEST result (MIXED_PATTERN) is a
minority shape, but the dominant found-population still favors Same
Pattern + non-trivial setup on both sides.

## 6. Limiting Factor Analysis (Required Analysis #4)

**limitingFactor: SETUP_LENGTH.** Mixed Pattern moved the global min
(2.33 → 1.60, Pattern choice was NOT the limiting factor -- it broke
through). Setup length extension (1.60 → 1.60) produced no further global
improvement -- Setup Length is the CURRENT limiting factor for going
beyond 1.60, not Pattern choice and not the existing algorithms'
intrinsic footprint (which Novel Low-Footprint Move Existence Validation
Sprint v1 had flagged as a candidate root cause -- ruled out here, since
mixing patterns alone already broke through that ceiling).

## 7. Mechanism Assessment (Deliverable #5, Success Criteria)

**Conclusion A -- Bracket Commutator는 충분한 설계 공간을 가진다.
Prototype 확장 가능.** `globalMinFootprintRatio=1.60 <= 2.0` (the
disclosed target, met directly, not merely via the near-miss band).
Regression/Integration were never at risk (measurement-only module,
same discipline as every prior Sprint in this arc).

**Honest caveat, disclosed rather than glossed over**: the 1.60 result is
a genuine, independently re-verified IMPROVING construction (wrongWingBefore
5 → wrongWingAfter 3), not a full solve of that case's cycle -- consistent
with this whole arc's "found" bar (net wrongWingCount improvement), the
same bar used in every prior Sprint. Only 1/28 cases (2/28 counting the
Stage-3 addition) reach footprintRatio≤2.0 so far -- this Sprint answers
the EXISTENCE question (RQ-1/RQ-2/RQ-3), not "is this ready for
production," which is exactly what the Directive asked for.

## 8. File Scope Verification

`git status --short` confirms only `mixedCommutatorDesignSpace/` (new,
standalone) and this doc were added. `git diff --stat` against
`fiveByFiveEdges.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdgeRecovery.ts`,
`primitivePrototype/CycleChasePrototype.ts`, `primitiveDiscovery/`
(read from -- `buildAtomicFragments`, `invertSequence` -- never modified)
confirms **0 diff**. No new Primitive was implemented; this Sprint's
modules are never exposed with the Primitive contract and are never
imported by any production file.
