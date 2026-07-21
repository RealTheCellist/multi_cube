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

## 5. An open question worth answering BEFORE building a new Primitive

The 77-case `cycleLength 2-4, conflictEdgeCount=0` bucket sits **inside**
REPAIR's own cycle-length range — only the `conflictEdgeCount>0`
requirement excludes it. `runSuccessV2`/`W2_widerHop`'s own bounded DFS
mechanism doesn't obviously *require* a conflict edge to exist — that
requirement came from the original Blueprint's own empirically-chosen
precondition, not a proven mechanical necessity.

**Before designing and implementing a whole new CCR Primitive, it's worth
first running a cheap experiment**: does simply relaxing REPAIR's own
Gate to drop the `conflictEdgeCount>0` requirement (keeping cycleLength
2~4) already resolve a meaningful share of that 77-case bucket, using the
EXISTING, unmodified `runSuccessV2`? If so, a large chunk of this gap
closes via a Refinement-stage Gate change to REPAIR itself, not a new
Primitive — and CCR's own scope narrows to specifically the cycleLength
5-6 population (173 cases, the part REPAIR's cycle-length cap excludes
regardless of the conflict-edge question). This is a Prototype-stage
question, not answered here — flagged so the next Sprint spends its
first cycle on the cheapest test, not the most code.

## 6. What this Blueprint does NOT do

No algorithm was designed. No code beyond the read-only Gap Analysis
driver (`runPrimitiveDiscoverySprint2.ts`,
`primitiveDiscoverySprint2/StructuralRepresentation.ts`,
`RevalidationCheck.ts`, `StructuralClustering.ts` — all read-only,
imports existing unmodified analysis functions, touches nothing in
Solver/Planner/Executor/Recovery/Primitive Registry) was written. The
next step, per `docs/PRIMITIVE_RESEARCH_PROCESS.md`, is **Prototype**:
first the cheap REPAIR-gate-relaxation experiment above, then (if still
needed) a real CCR implementation and a benchmark against this same
recollected dataset.
