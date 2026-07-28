# Novel Low-Footprint Move Existence Validation Sprint v1

Status: **Complete. Decision: Conclusion C -- 저-footprint Move의 존재를
입증하지 못했다 (footprintRatio<=2.0 기준 미달), 그러나 이전 Sprint들과는
질적으로 다른, 실제 개선/부분 상쇄가 관측된 결과.** Pure
Research/Validation Sprint -- no new Primitive, no Prototype, nothing
wired into Recovery/Executor/Planner. Full report:
`novelLowFootprintMoveExistence/data/novel-low-footprint-move-existence-v1-report.txt`.

---

## 0. Method

Move Representation Prototype Sprint v1 tested a SINGLE conjugation
(`Setup + Core + Undo-Setup` = `A Core A'`), and found it cannot reduce
footprint, only relocate it (Conclusion C, avgFootprintRatio=14.00). This
Sprint tests a mechanism never tried anywhere in this research arc: a
genuine GROUP-THEORETIC **bracket commutator** of TWO INDEPENDENTLY
conjugated copies of a known clean pattern -- `[A, B] = A B A' B'` where
`A = SetupA + KnownPattern + SetupA'` and `B = SetupB + KnownPattern +
SetupB'`. Standard group theory: if A and B are transpositions sharing one
element, `[A,B]` is a genuine 3-cycle, and each half's own collateral
disturbance cancels against its own inverse -- this is the actual
mechanism real big-cube speedcubers use for wing-cycle algorithms.

For each of the 28 PURE_CYCLE_ISOLATION cases: 3 known patterns
(BASE_ALG/FLIP_ALG/PARITY_ALG, tried separately, never mixed) x 49 x 49
ordered pairs of `buildAtomicFragments()` setups (IDENTITY included) =
**7203 bracket-commutator attempts per case**, all built from existing,
unmodified exports only (`buildAtomicFragments`, `invertSequence`,
`applySeq`, `cloneCubies`, `slotKey`, `wrongWingCount5`,
BASE_ALG/FLIP_ALG/PARITY_ALG). This is a measurement tool, never exposed
with the `(Cubie[], WingLibrary, deadline) -> Move[] | null` Primitive
contract.

## 1. Intrinsic Footprint (RQ-3 groundwork)

| Pattern | moveLength | affectedWingCount (standalone, from solved) |
|---|---|---|
| BASE_ALG | 11 | 18 |
| FLIP_ALG | 3 | 16 |
| PARITY_ALG | 38 | 25 |

Even the ONE "clean isolated swap" building block already displaces far
more slots than its own "2 truly swapped" description suggests (the
"pairing-safe rigid groups" it also moves count toward affectedWingCount).
Two independent conjugated copies, naively summed, would be ~32-50 --
actual results below show real cancellation well below that naive sum.

## 2. Low-Footprint Move Catalog + Minimal Footprint Distribution

**15/28 cases (53.6%) found at least one genuinely improving bracket
commutator** (wrongWingCount decreased) -- a sharp, qualitative contrast
with Move Representation Gap Analysis Sprint v1's 0/418 and this arc's own
Prototype's 1/28 (and that 1 was the already-easy case, not new
capability). All 15 found here are DISTINCT-from-baseline improving
constructions on the genuinely hard PURE_CYCLE_ISOLATION population.

| | Value |
|---|---|
| foundCount | 15/28 (53.6%) |
| avgBestFootprintRatio (found only) | 3.66 |
| medianBestFootprintRatio | 3.40 |
| **minBestFootprintRatio** | **2.33** |
| maxBestFootprintRatio | 6.33 |
| lowFootprintAchieved (<=2.0) | **0/15 (0.0%)** |

By cycleLength: 3 (1/3 found), 4 (2/5), 5 (5/9), 6 (7/11) -- longer cycles
found improving constructions MORE often, not less, consistent with more
setup-pair combinations happening to align favorably.

**The best single result found: `scrambleDepth40:1` (cycleLength=6),
footprintRatio=2.33 (affectedWingCount=14) via PARITY_ALG-based
commutator** -- real cancellation occurred (14, not the ~36-50 naive sum),
just short of the disclosed 2.0 bar.

## 3. Existing Generator Coverage Check (RQ-3)

Verified by direct source inspection (not assumed):
- `enumerateWingCandidates()` returns exactly `[...setup, ...entry.seq]`
  -- one fixed library entry + one single-piece BFS relocation.
- `invertSequence()` -- required to build any bracket commutator's undo
  halves -- is used NOWHERE in `fiveByFiveEdges.ts`,
  `solverV2Prototype/BoundedResolver.ts` (BP-1), or
  `solverPrimitiveCCRPrototype/CCRPrototype.ts` (CCR); all three only ever
  concatenate candidates forward, never invert/undo.

**Therefore, structurally: Existing Generator ⊂ Required Move Set** -- the
bracket-commutator shape this Sprint tests is categorically outside what
the current generator, BP-1, or CCR can ever produce, independent of this
Sprint's own empirical result.

## 4. Structure Classification (RQ-4)

| Label | Count |
|---|---|
| NONE_FOUND | 13 |
| **CONJUGATED_CYCLE** | **15 (100% of found)** |

Every found case's best construction has `affectedWingCount > cycleLength
+ 1` (none qualify as `PURE_CYCLE_COMMUTATOR`) -- the commutator mechanism
achieves REAL, substantial cancellation (vs. naive composition) but not
down to the theoretical minimum of "approximately cycleLength." Dominant
share = 100%, well above the 60% bar -- structurally uniform.

## 5. Blueprint Feasibility Assessment

**Conclusion C -- 저-footprint Move의 존재를 입증하지 못했다**, per the
disclosed rubric (existence requires >=1 case at footprintRatio<=2.0;
0/28 qualify). This is the literal, disclosed-threshold verdict.

**However, this is NOT the same finding as prior Sprints' dead ends**,
and should not be read as such:
- 53.6% of cases found a REAL improving construction via a mechanism
  (true 4-part bracket commutator) never tested anywhere in this research
  arc before -- a qualitatively different, much more positive signal than
  Move Representation Gap Analysis Sprint v1's 0/418 or the Prototype's
  1/28 (lucky, already-easy case).
- Real cancellation was measured (best case: footprintRatio=2.33,
  affectedWingCount=14 vs. a naive ~32-50 sum of two independent
  BASE_ALG-family conjugates) -- the theoretical mechanism the Blueprint
  originally proposed DOES work, partially, empirically confirmed here for
  the first time.
- The gap to the disclosed 2.0 bar is small (2.33 vs 2.0) -- this search
  only tried SAME-known-pattern pairs (BASE_ALG+BASE_ALG,
  FLIP_ALG+FLIP_ALG, PARITY_ALG+PARITY_ALG) and only single-fragment
  setups (max 2 raw moves each); it did NOT try mixed known-pattern pairs
  (e.g. BASE_ALG conjugate x FLIP_ALG conjugate) or multi-fragment
  (longer) setups, both of which remain untested and could plausibly close
  this gap.

## 6. Manual Analysis of a Representative Case ("수동 분석", no new search code)

`scrambleDepth40:1` (cycleLength=6, best result): reasoning by hand from
the measured numbers alone -- BASE_ALG/FLIP_ALG/PARITY_ALG's own intrinsic
footprints (18/16/25) mean ANY bracket built from two independent copies
of the SAME pattern starts from a "budget" of roughly double that number
before cancellation; the fact that the actual measured result (14) is
LOWER than even a single copy's own intrinsic footprint (16 for FLIP_ALG,
18 for BASE_ALG) proves the two copies' collateral genuinely overlapped
and cancelled each other far beyond what either alone achieves -- direct,
measured evidence the bracket-commutator mechanism is real and not merely
a wrapper. The remaining gap to `cycleLength=6` (footprint 14 vs. an ideal
~6-7) is consistent with the two conjugated copies' own "rigid collateral
groups" only PARTIALLY overlapping/cancelling, not fully -- exactly the
geometric constraint (disjoint-vs-overlapping collateral regions) this
Sprint's own design notes anticipated as the limiting factor.

## 7. File Scope Verification

`git status --short` confirms only `novelLowFootprintMoveExistence/`
(new, standalone) and this doc were added. `git diff --stat` against
`fiveByFiveEdges.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdgeRecovery.ts`,
`primitivePrototype/CycleChasePrototype.ts`,
`solverV2Prototype/`, `solverPrimitiveCCRPrototype/`, `primitiveDiscovery/`
(read from -- `buildAtomicFragments`, `invertSequence` -- never modified)
confirms **0 diff**. No new Primitive was implemented; this Sprint's
modules are never exposed with the Primitive contract and are never
imported by any production file.
