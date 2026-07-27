# Deep Cycle Resolver Validation Sprint v1

Status: **Complete. Decision: Conclusion C -- Primitive-Candidate-A 기각.**
This Sprint asked whether State Taxonomy Sprint v2's "Primitive-Candidate-A
(Deep Cycle Resolver)" is a genuine new-Primitive research opportunity for
Recovery Necessity Validation Sprint v1's 3 RECOVERY_REQUIRED cases -- per
the Directive, **no new Primitive or Prototype was implemented**; this
Sprint only measures and specifies. Full report:
`deepCycleResolverValidation/data/deep-cycle-resolver-validation-v1-report.txt`.

---

## 1. Central Finding

Direct measurement (not assumption) shows the mechanism Primitive-Candidate-A
was proposed to build **already exists in production**: CCR (Clean-Cycle
Resolution, `solverPrimitiveCCRPrototype/CCRPrototype.ts`), wired into
`fiveByFiveEdgeRecovery.ts`'s `genCCR` since CCR Production Integration
Sprint v1. CCR's own Gate (`cycleLength` in [5,6] AND `conflictEdgeCount`
== 0) matches the RECOVERY_REQUIRED profile exactly, and all 3
RECOVERY_REQUIRED cases pass it (`allGateEligible=true`). The EXISTING CCR
implementation already solves 2 of the 3 cases at a measured budget
(500-2000ms, well under production's own reserved slices).

## 2. A Reproducibility Anomaly, Disclosed

STEP0's own repeat-trial check found that `worstCase:b714481` -- one of the
3 cases Recovery Necessity Validation Sprint v1 recorded as
`extendedRecoverySucceeded: true` -- does **NOT** reproduce: re-running the
exact same, unmodified `computeGroundTruthForHole`/`testAllCapabilities`
call 3x, then a dedicated N=10 repeat-trial stability check at budgets from
140ms up to 30000ms (214x the original 5000ms extended-budget test), never
once succeeds (0/10, deterministic). Root cause, confirmed via
`runCCRPrototype`'s own Gate+DFS call directly: CCR's bounded DFS
(`solverV2Prototype/BoundedResolver.ts`'s `MAX_LEAVES_EXPLORED = 64`, a
**fixed leaf-count cap, not a time cap**) explores the same 64 leaves
regardless of how much wall-clock budget remains -- increasing the budget
200x+ produces byte-identical behavior. This is disclosed as an open
discrepancy against the prior Sprint's recorded data, not silently
corrected; the prior Sprint's own deliverable is unchanged (already
committed/released), but this Sprint's own measurement is the one used for
every conclusion below.

## 3. Structural Comparison (RQ-1, all 142 cases)

| Class | n | cycleLen | cycleCnt | component | wrongWing | conflictEdge | swapEdge | depDepth | bridgeDist | branching | parity | singleCycle |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **RECOVERY_REQUIRED** | 3 | **6.00** | 1.33 | 1.33 | 7.33 | **0.00** | 0.67 | 6.00 | 0.33 | 0.89 | 33.3% | 66.7% |
| RECOVERY_OPTIONAL | 5 | 5.40 | 2.60 | 1.80 | 11.00 | 0.00 | 0.40 | 5.40 | 0.80 | 0.51 | 80.0% | 0.0% |
| RECOVERY_UNNECESSARY | 134 | 3.49 | 1.30 | 1.40 | 7.85 | 2.43 | 0.37 | 5.45 | 0.40 | 0.51 | 43.3% | 30.6% |

`dependencyDepth`/`bridgeDistance`/`branchingFactor` are new metrics this
Sprint defines and measures directly (see
`deepCycleResolverValidation/StructuralProfile.ts` for exact, disclosed
definitions -- `branchingFactor` in particular is a REAL measured quantity:
the average `enumerateWingCandidates()` result-count across each case's
active WANTS-graph nodes, not an estimate). REQUIRED's shape is
distinctive -- longest cycles, zero conflict edges, highest single-cycle
share (66.7%) -- exactly the CCR Gate's target shape.

## 4. Primitive Failure Map (RQ-2)

| Label | BASE/FLIP/CASE | PARITY | RECOVERY | Stability (N=10) |
|---|---|---|---|---|
| worstCase:b714481 | never succeeds (140ms-30000ms) | succeeds only at 30000ms | **never succeeds (140ms-30000ms)** | **0/10 (0%)** |
| worstCase:1e928fb1 | never succeeds | succeeds only at 10000ms | succeeds from 1000ms | 10/10 (100%), CCR |
| scrambleDepth10:8 | never succeeds | succeeds only at 30000ms | succeeds from 2000ms | 10/10 (100%), CCR |

BASE/FLIP/CASE never succeed at any tested budget for any of the 3 cases
(confirms these are genuinely outside the main pipeline's reach, not
merely budget-starved). PARITY only ever succeeds at absurd budgets
(10-30 seconds) far beyond any practical Contract -- a side-finding, not a
practical path. RECOVERY (via CCR specifically, confirmed by trace) is the
only realistic path for 2/3 cases; for the 3rd, it is not budget-dependent
at all -- it is capped by CCR's own leaf-count limit.

## 5. Mechanism Identification (RQ-3/RQ-4)

All 3 cases pass CCR's Gate (`allGateEligible=true`) -- i.e. all 3 require
**the same Primitive family** (RQ-4 answer: same mechanism, not 2+
different ones). Isolated `runCCRPrototype()` probes (bypassing
DISRUPT/SETUP/REPAIR scheduling entirely) confirm: `singleCycle` and
`multiCycle` strategies behave identically on all 3 cases (both solve the
same 2, both fail the same 1) -- the multi-cycle extension makes no
difference here. **Verdict: `SAME_EXISTING_MECHANISM_INCOMPLETE`** --
right mechanism family, existing implementation, incomplete search.

## 6. Deep Cycle Resolver Capability Specification (RQ-3, definition only)

- **Input condition**: single-component, conflict-free, 5-6-length WANTS
  cycle -- identical to CCR's existing Gate.
- **Required state**: every cycle-node's wrong wing must have
  `enumerateWingCandidates() > 0` (branching factor > 0); if this breaks,
  no search strategy of any kind can enter that node.
- **Expected output**: a net-improving move sequence resolving the whole
  cycle -- already produced by existing CCR for 2/3 of this population.
- **Search direction**: bounded DFS over the cycle's nodes, exactly
  `CCRPrototype.ts`'s existing `runBoundedDfs` -- not a new algorithm.
- **Expected cost**: the real, measured limiting resource is not time
  (500-2000ms already suffices where it works) but the DFS's own
  `MAX_LEAVES_EXPLORED=64` cap against a 3^6=729 combinatorial ceiling for
  6-node cycles -- a parameter/heuristic-tuning cost on an EXISTING
  Primitive, not a new-Primitive design cost.

## 7. Primitive Opportunity Map Revision

Primitive-Candidate-A is **downgraded from "new Primitive opportunity" to
"duplicate of existing CCR, with a leaf-cap refinement gap"**. State
Taxonomy Sprint v2 proposed it citing `BoundedResolver.ts`/BP-1 as prior
art -- CCR (which post-dates that Sprint's own prior-art search) was not
cross-referenced at the time and turns out to be a near-exact match.
**Recommendation**: remove Primitive-Candidate-A from the new-Primitive
research track; if further work is warranted, reclassify it as "CCR Search
Completeness Refinement" (leaf-cap/candidate-ordering tuning on an
existing Primitive) -- explicitly out of this Sprint's own charter (no new
Primitive/Prototype implementation, Production Solver frozen), requiring a
separate future Sprint if pursued.

## 8. Prototype Readiness Decision

**Conclusion C -- Primitive-Candidate-A 자체가 잘못되었다.** Not because
"Deep Cycle Resolver" as a mechanism is wrong, but because it is not a NEW
Primitive: it is already implemented (CCR), already production-integrated,
and already solves 2 of the 3 target cases. Proposing a new Primitive here
would duplicate existing capability. No Prototype stage follows from this
Sprint.

## 9. File Scope Verification

`git diff --stat` against every protected file this Sprint's own Directive
lists (`fiveByFiveEdges.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdgeRecovery.ts`,
`primitivePrototype/CycleChasePrototype.ts`, plus BASE_ALG/FLIP_ALG/
PARITY_ALG/CASE Library and every other protected file from this whole
research arc, including `solverPrimitiveCCRPrototype/` and
`solverV2Prototype/` which this Sprint reads from extensively) confirms
**0 diff**. This Sprint added only `deepCycleResolverValidation/` (new
measurement/specification modules, no executable search logic beyond
existing-primitive budget sweeps) and this document.
