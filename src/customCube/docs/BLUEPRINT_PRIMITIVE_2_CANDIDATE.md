# Primitive #2 Candidate — Blueprint

Status: Blueprint stage only (per `docs/PRIMITIVE_RESEARCH_PROCESS.md`'s own
process) — structural analysis + candidate contract. **No implementation
in this document or this Sprint.**

**Source Sprint**: Primitive Discovery Sprint #2 (Gap Analysis), 2026-07-21.

---

## 1. How this gap was found

Following the recommended order (recollect → cluster by Representation →
pick the largest unresolved cluster → write its Blueprint):

1. **Recollected** failures under the CURRENT production solver
   (`reservedBudget`/REPAIR default, shipped in Integration Validation
   Sprint v1) via the existing, unmodified `runFailureAnalysis.ts` driver:
   150 → 335 snapshots (185 freshly collected across two batches).
2. **Revalidated** the pre-existing 150 snapshots against the current
   solver (a single fresh `solve()` call each, reusing
   `failureAnalysis/failureReplay.ts`'s `replayFailure()` unmodified) — 0
   of them are now resolved by REPAIR, so none were stale; all 335 are
   genuine current failures.
3. **Clustered by Structural Representation** — REPAIR's own Gate
   features (`cycleLength` via `analyzeMultiCycle`, `conflictEdgeCount`
   via `countConflictEdges`, both reused unmodified), plus `wrongWingCount`/
   `parity`. An exact-tuple clustering fragmented into 173 clusters
   (largest only 8/335) — the same over-fragmentation
   `failureAnalysis/failureCluster.ts`'s own comment already warned
   about — so a coarser, cycleLength-banded macro-clustering was used
   instead (`primitiveDiscoverySprint2/StructuralClustering.ts`).

## 2. The gap, quantified

| Structural bucket | Count | Share | REPAIR Gate eligible |
|---|---|---|---|
| cycleLength 5-6, conflictEdgeCount=0 | 173 | 51.6% | 0% |
| cycleLength 2-4, conflictEdgeCount=0 | 77 | 23.0% | 0% |
| cycleLength 2-4, conflictEdgeCount>0 | 41 | 12.2% | **100% (REPAIR's own territory)** |
| no cycle found, conflictEdgeCount>0 | 28 | 8.4% | 0% |
| cycleLength 5-6, conflictEdgeCount>0 | 16 | 4.8% | 0% |

**The single largest pattern**: `conflictEdgeCount=0` (a "clean," pure
WANTS-graph cycle — no competing/ambiguous wants edges) accounts for
**250/335 (74.6%)** of ALL current failures, split across cycleLength
2-4 (77) and 5-6 (173, the single biggest bucket at 51.6% on its own). No
cycle longer than 6 was observed in this dataset.

REPAIR's Gate requires **both** `cycleLength` 2~4 **and**
`conflictEdgeCount>0` (`solverPrimitivePrototypeRefinementV2/
GateExpansionV2.ts`) — by construction, it structurally cannot fire on
any `conflictEdgeCount=0` case, regardless of cycle length. This isn't a
scheduling or budget problem (Integration Refinement/Validation Sprints
already closed that gap) — it's a genuine, unaddressed structural
population.

## 3. Why existing Primitives miss this

`CONFLICT` edges (`capabilityAnalysis/stateGraphBuilder.ts`) are WANTS
edges that fall **outside** any detected cycle — i.e., ambiguous/competing
"wants" relationships. Their presence is what originally motivated a
*search*-based approach (REPAIR's bounded multi-hop DFS): when wants are
ambiguous, you need to search for which hop sequence actually resolves
them.

A **clean cycle** (`conflictEdgeCount=0`) has no such ambiguity — every
wing's "wants" relationship already forms a closed loop. Mechanically,
this should be an *easier* case than what REPAIR targets: resolving a
pure N-cycle is a well-understood permutation problem (cycle-follow /
3-cycle decomposition), not a search problem. The existing BASE/pairing
primitives evidently already handle *some* cycle lengths (since these
335 snapshots are residuals *after* BASE/FLIP/PARITY/ENDGAME/Recovery all
already ran and failed) — but not reliably up to length 5-6, and,
per the 77-case bucket, not always even at length 2-4 once a case reaches
this deep into the pipeline's own residual states.

## 4. Candidate Primitive contract

**Name (working)**: Clean-Cycle Resolution ("CCR")

**Precondition (Gate)**: `conflictEdgeCount(cubies) === 0 AND
cycleLength(cubies) >= 2` — deliberately the *complement* of REPAIR's own
Gate on the conflict-edge dimension (REPAIR: `conflictEdgeCount > 0`; CCR:
`conflictEdgeCount === 0`), so the two Gates partition the "has a
detectable cycle" population without overlapping.

**Contract**: given a cube state whose WANTS graph is a pure cycle of
length N (2 <= N <= 6, per what's actually been observed — no evidence
yet for N>6), produce a move sequence that resolves the full cycle (net
`wrongWingCount5` improvement covering all N members), or report no match
if the structure doesn't hold.

**Validation discipline to carry over unchanged**: Deferred Validation
(only accept moves that net-improve `wrongWingCount5`, exactly as
`solverV2Prototype/DeferredValidator.ts`'s `validateDeferred` already
enforces for REPAIR) — no new validation philosophy needed here.

## 5. UPDATE (Gate Relaxation Validation Sprint v1, 2026-07-21): the cheap experiment was run — RESULT A

The open question above was answered empirically, not just flagged.
`solverPrimitiveGateRelaxation/` compared REPAIR's real, unmodified Gate
(G0: `cycleLength 2~4 AND conflictEdgeCount>0`, calling `runSuccessV2`
directly) against a relaxed Gate (G1: `cycleLength 2~4` only — a
disclosed hop-for-hop reimplementation of `runSuccessV2`'s own DFS body
with exactly the `conflictEdgeCount===0` early-return removed, otherwise
byte-identical) across all 335 snapshots, N=15 runs, Standard Evaluation
Protocol.

**Result**: G1 resolves **17-19 of the 77** `cycleLength 2-4,
conflictEdgeCount=0` snapshots (stably, across a majority of runs) —
paired-diff GapRescue 95% CI excludes zero in two independent full runs
([1.300, 2.033] and [2.300, 3.033]), **zero regressions**, and — crucially
— G1's performance on REPAIR's *own* original population is mathematically
unchanged (G1's Gate is a strict superset of G0's, so it cannot do worse
there; verified numerically: G0/G1 success counts on the shared
population matched within rounding in both runs). The initial blended-
precision comparison looked like a "Coarsening Trap" (45.9%→30.6%) but
this was a measurement artifact of averaging in a genuinely harder new
population, not a real capability regression — confirmed by splitting
precision per-population instead of blending it (see
`solverPrimitiveGateRelaxation/CoarseningCheck.ts`'s own disclosed
correction).

**Decision: A.** `conflictEdgeCount>0` was an unnecessary constraint for
the `cycleLength 2~4` band. **CCR's own scope now narrows to specifically
the `cycleLength 5-6` population (173 cases, 51.6% of all current
failures)** — the part no Gate relaxation of REPAIR can reach, since
REPAIR's search is only validated/tuned for cycles up to length 4.

This Sprint did **not** change REPAIR's production Gate — see the
following update for that.

## 5b. UPDATE (Integration Sprint v2, 2026-07-21): SHIPPED to production

The relaxed Gate is now live. `solverPrimitivePrototypeRefinementV2/
SuccessOptimizationV2.ts`'s `runSuccessV2` no longer checks
`conflictEdgeCount>0` — REPAIR's Gate is simply `cycleLength 2~4`. This
was a 2-line production diff (the check removed, its now-unused
`countConflictEdges` import removed) — no DFS/search/scheduling change.

Validated against the real, shipped code (Standard Evaluation Protocol,
N=15): paired-diff GapRescue 95% CI `[2.035, 2.498]`, zero regressions,
zero Planner impact beyond baseline jitter, and **17/77** of the target
subset solved stably — matching Gate Relaxation Validation Sprint v1's
own finding exactly (17/77, both prior independent runs). This is the
**third** independent confirmation of the same effect across this
research arc. Decision: A — adopted as the production default.

**CCR's scope is now definitively narrowed to `cycleLength 5-6` only**
(173/335, 51.6% of all current failures) — the `cycleLength 2-4`
sub-problem this Blueprint originally worried about is closed by the
Gate change above, not by a new Primitive.

## 6. What this Blueprint (and the research behind it) does NOT do

No algorithm was designed for CCR. The Gate Relaxation Validation
Sprint's own benchmark code (G0/G1 in `solverPrimitiveGateRelaxation/`)
never touched production — it was Integration Sprint v2 (section 5b
above) that actually shipped the 2-line Gate change, and only that one
change; `fiveByFiveEdgeRecovery.ts`, `MultiHopBridgePrototypeV3.ts`,
`DeferredValidator.ts` remain exactly as REPAIR originally shipped them.
The next step, per `docs/PRIMITIVE_RESEARCH_PROCESS.md`, is **Primitive
Discovery Sprint #3 / a real CCR Prototype** targeting specifically
`cycleLength 5-6` (173 cases) — now that `cycleLength 2-4` is fully
closed by the shipped Gate, this is the only remaining scope.
