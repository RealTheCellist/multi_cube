# Move Representation Gap Analysis Sprint v1

Status: **Complete. Decision: Conclusion A -- 현재 Move Generator의 표현력
부족이 Residual Failure의 주요 원인이다.** This Sprint tested the
hypothesis PURE_CYCLE_ISOLATION Structural Mechanism Analysis Sprint v1
raised (search parameters aren't the bottleneck) by directly capturing
and structurally classifying every real candidate `enumerateWingCandidates()`
offers at each cycle hop, across all 28 PURE_CYCLE_ISOLATION cases. No new
Primitive or Move Generator change was implemented. Full report:
`moveRepresentationGap/data/move-representation-gap-analysis-v1-report.txt`.

---

## 1. Method

For every one of the 28 cases, at every node of its cycle
(`analyzeMultiCycle`'s own node ordering, unmodified), the real
`enumerateWingCandidates()` was called (up to 10 results per hop) and
each returned candidate was **applied and measured**: wrongWingCount,
cycleCount, componentCount, and conflictEdgeCount before/after, plus how
many wing pieces actually changed slot (`affectedWingCount`). 418 candidate
measurements were captured in total.

## 2. Generated Move Taxonomy (Move Coverage Matrix)

| Move Class | Count | Share |
|---|---|---|
| COMPONENT_SPLIT | 223 | 53.3% |
| CYCLE_SPLIT | 83 | 19.9% |
| LATERAL_NO_CHANGE | 57 | 13.6% |
| CYCLE_MERGE | 44 | 10.5% |
| REGRESSIVE | 11 | 2.6% |
| **CYCLE_ROTATION_IMPROVING** | **0** | **0.0%** |
| COMPONENT_MERGE | 0 | 0.0% (trivially impossible -- these cases already start single-component, so componentCount cannot decrease below 1) |

## 3. Representation Gap Report -- The Central Finding

**28/28 (100.0%) cases have ZERO candidates, at ANY cycle hop, that
reduce wrongWingCount.** `CYCLE_ROTATION_IMPROVING` -- the one move class
that would represent genuine net progress with the structure otherwise
unchanged -- is **never observed, in any of the 418 measured candidates,
across the entire population.** Every real candidate the move generator
offers either splits the cycle/component structure further, merges two
cycles without improving wrongWingCount, leaves wrongWingCount exactly
unchanged (moves the "wrongness" to a different wing), or makes it worse.

This is a stronger, more direct confirmation than the prior Sprint's own
85.7% (full-search) figure -- measured here at the first-hop candidate
level, before any search even begins, the generator simply does not offer
an improving move for this population's shape.

## 4. Residual Move Requirement (specification only, no implementation)

- **Observed limitation**: candidates that leave the cycle/component
  structure unchanged (`LATERAL_NO_CHANGE`, 13.6%) affect a large number
  of wing pieces on average (avg `affectedWingCount` ~30, reflecting the
  long real move sequences `enumerateWingCandidates()` returns for a
  5x5 cube -- avg move length ~104-125 physical quarter-turns) yet still
  net to zero wrongWingCount change: relocating one target wing into its
  home slot displaces whatever was already there, an exact zero-sum
  trade within a pure isolated cycle.
- **Required structural condition**: breaking this zero-sum requires a
  single logical move (a setup+commutator combination, in cubing terms)
  that relocates **two or more** wings of the same cycle to their correct
  slots simultaneously, rather than the current one-wing-at-a-time
  relocation unit `enumerateWingCandidates()` operates on.
- **Expected mechanism shape**: a commutator-style move over the cycle's
  own node set (e.g. resolving a 3-node A->B->C->A cycle via one
  compound move that swaps A<->C while returning B) -- explicitly a
  future Primitive/Prototype design question, not something this Sprint
  implements.

## 5. Blueprint Readiness Assessment

**Conclusion A -- 현재 Move Generator의 표현력 부족이 Residual Failure의
주요 원인이다.** 28/28 (100%, well above this research arc's 60%
threshold) show zero improving candidates at the move-generation level
itself -- not a search-algorithm limitation (already ruled out by the
prior Sprint) and not noise. **Recommendation**: proceed to a Move
Representation Blueprint Sprint targeting a multi-wing, commutator-style
move unit as the concrete design target.

## 6. File Scope Verification

`git diff --stat` against every protected file this Sprint's Directive
lists, plus `solverV2Prototype/` (read from -- `analyzeMultiCycle` called
read-only, never modified) confirms **0 diff**. `enumerateWingCandidates()`
itself (in the protected `fiveByFiveEdges.ts`) was called exactly as every
prior Sprint in this research arc already does, never modified. This
Sprint added only `moveRepresentationGap/` (measurement/specification
modules) and this document. No new Primitive, Prototype, or Move
Generator change was implemented.
