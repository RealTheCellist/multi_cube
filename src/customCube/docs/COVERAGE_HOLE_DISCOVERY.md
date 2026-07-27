# Coverage Hole Discovery Sprint v1 (Solver Completeness Achievement Program, Phase 1)

Status: **Phase 1 complete**. 142-case Hole Dataset built from actual final
stuck wing-pairing states (not just aggregate stats). 80.3% are **True
Coverage Hole** (no existing primitive succeeds even in isolation), 19.7%
are **Reachable-but-Unexploited** (a primitive DOES work in isolation, but
production's solve() loop never finds/applies it). 20 distinct Dead State
Clusters identified. Full driver report:
`coverageAtlas/data/coverage-hole-discovery-v1-report.txt`, machine-readable
summary: `coverageAtlas/data/coverage-hole-discovery-v1-result.json`.

---

## 1. Scope and Method

This Sprint is the first of the Solver Completeness Achievement Program's
6-phase roadmap (Master Directive v1.0). Phase 1's job is narrow: **find and
classify** the structural Coverage Hole the just-completed Solver
Completeness Verification Sprint v1 already proved exists (717/717
non-convergent, Gate2/5/6 FAIL), not fix it. No Primitive/Planner/
Recovery/Executor file was touched -- zero diff confirmed against all
protected production files.

**Input dataset (142 cases, not the full 717)**: Worst Case Library (52,
curated for parity/recovery-failed/high-wrongWingCount diversity) + a
stratified subsample of snapshot335 (first 30) + scrambleDepths (first 10
of each of 6 depth buckets = 60). Disclosed scope choice: at the prior
Sprint's own measured ~58-62s/case, a full 717-case discovery pass would
cost ~12 hours for STEP1 alone; a 142-case representative slice is
proportionate for a *discovery* phase. Phase 6 (Completeness Verification)
re-runs the full population once real coverage fixes exist.

**Key methodological choice**: for every non-convergent case, this Sprint
kept the actual final stuck `Cubie[]` state (by holding a reference to the
array `runFullPipeline()` mutates in place -- no change to that existing
probe was needed) and then tested all 5 existing capability-tested
primitives (BASE/FLIP/CASE/PARITY/RECOVERY, via the existing, unmodified
`capabilityAnalysis/primitiveCapabilityTester.ts`) against a **scratch
clone** of that exact state. RECOVERY there already wraps the real
production Recovery layer's `attemptRecovery()` -- i.e. DISRUPT/SETUP/
REPAIR/CCR combined -- so this is a rigorous, direct test against the real
production Primitive Library, not an inferred/simulated one.

This distinguishes two previously-conflated failure classes:

- **True Coverage Hole**: no primitive succeeds even in isolation --
  genuinely missing capability (Directive Goal 1/3 territory).
- **Reachable-but-Unexploited**: >=1 primitive DOES succeed in isolation,
  but the real solve() loop still got stuck for 50 iterations -- a
  scheduling/Planner problem, not a missing-capability problem (Directive
  Goal 2 territory).

## 2. Hole Dataset Results (STEP1)

| | Count | Share |
|---|---|---|
| Input cases | 142 | -- |
| Confirmed Hole (non-convergent, no exception) | 142/142 | 100.00% |
| **True Coverage Hole** | **114** | **80.28%** |
| **Reachable-but-Unexploited** | **28** | **19.72%** |

The 100% Hole confirmation rate matches the prior Sprint's full-717 finding
exactly (no sampling artifact). The 80/20 split is the Sprint's central new
finding: **most of the population needs new Primitive capability, but a
meaningful minority (~1 in 5) is a pure scheduling defect** -- the
production solve() loop is failing to find or apply a primitive that
demonstrably works on that exact state when tested in isolation. This
second class was invisible in the prior Sprint's aggregate-only census.

## 3. Dead State Clusters (STEP2)

20 clusters emerged from a composite key over (parity presence, longest
cycle length bucket, conflict-edge presence, wrongWing-count bucket) --
reusing `capabilityAnalysis/stateGraphBuilder.ts`'s existing WANTS-graph
unmodified, no new structural-detection logic. Top 5 by size:

| Cluster | Size | anyPrimitiveApplicable |
|---|---|---|
| Parity + long(5+) cycle, wrongWing 9+ | 25 (17.6%) | 11/25 |
| Long multi-piece cycle, no parity, wrongWing 5-8 | 21 (14.8%) | 1/21 |
| Conflict-only (one-sided WANTS, no cycle), wrongWing 5-8 | 15 (10.6%) | 0/15 |
| short(3-4) cycle, no parity, wrongWing 5-8 | 12 (8.5%) | 0/12 |
| Conflict-only, wrongWing 9+ | 9 (6.3%) | 2/9 |

Every "Conflict-only" cluster (24 cases total across two size buckets) has
`anyPrimitiveApplicable` near-zero (2/24) -- conflict-dominant states are
the hardest True Coverage Hole subclass in this dataset. By contrast the
largest single cluster (Parity + long cycle) has the *highest*
Reachable-but-Unexploited rate (11/25 = 44%) -- parity cases with a long
resolvable cycle are disproportionately where the scheduling gap lives.

## 4. Zero-Move Loop confirmation (STEP3)

The prior Sprint's report claimed the non-convergence was "결정론적으로
고정된 잔여 상태" (deterministically fixed) based on a single 50-iteration
run per case. This Sprint did not take that on faith -- it re-invoked the
real, unmodified `FiveByFiveEdgeSolverEngine.solve()` **N=10 times** against
an *unchanged* clone of each of the 142 stuck states (moves never applied
back), matching the Directive's literal Goal 2 definition ("동일 Cube
State에서... 0 Move가 발생하면 실패").

| | Result |
|---|---|
| Confirmed genuine zero-move loop (10/10 empty) | **142/142 (100.00%)** |
| Partially stochastic (>=1/10 non-empty) | 0 |

**Fully confirmed, not refuted**: every one of the 142 stuck states is a
genuine deterministic dead end for `solve()` itself -- `solve()`'s own
`shuffle()`-driven stochasticity never rescues it, in 1,420 repeat calls
total. This closes the possibility that the prior Sprint's finding was a
single-draw artifact.

## 5. Conflict Analysis (STEP4)

No `PairConflictAnalyzer.ts` existed anywhere in the repo prior to this
Sprint (verified by repo-wide search) despite an earlier Sprint's task list
entry claiming one was built -- this module (`coverageAtlas/
ConflictAnalysis.ts`) is a genuine first build, layered on
`stateGraphBuilder.ts`'s existing `CONFLICT` edge type (a directed WANTS
edge A->B not part of any detected cycle -- satisfying A costs B something
B never gets back).

| | Result |
|---|---|
| Cases with >=1 structural CONFLICT edge | 45/142 (31.69%) |
| Cases where a conflict targets an already-SolvedPair slot | 0 |
| Avg conflict edges per case | 2.44 |
| Among True-Coverage-Hole cases: conflict present | 35/114 |
| Among True-Coverage-Hole cases: conflict absent | 79/114 |

Zero cases have a conflict targeting an already-SolvedPair slot -- the
"Conflict Dominant Sacrifice" mechanism theorized in an earlier Sprint
(`solverPrimitivePrototype/ConflictDominantSacrificePrototype.ts`) does not
appear in this Hole Dataset's specific population; conflicts here target
still-unsolved WingPair/BrokenPair slots, not completed ones. Conflict
presence is a minority feature of True Coverage Hole cases (35/114 = 31%)
-- most True Coverage Hole cases (79/114) have no structural CONFLICT edge
at all, meaning "conflict" alone does not explain most of this Sprint's
Coverage Hole population; cycle-length and parity structure (Section 3)
carry more of the explanatory weight.

## 6. State Graph Atlas (STEP5)

Scoping disclosure: "State Graph" here means the existing per-case WANTS/
constraint graph (12 canonical slot nodes) aggregated across the Hole
Dataset -- not a literal reachability graph over the full state space
(computationally infeasible). One full representative graph was captured
per Dead State Cluster for Phase 2 to inspect directly.

| Node types (aggregate, 142 cases) | Count |
|---|---|
| SolvedPair | 638 |
| WingPair | 970 |
| BrokenPair | 96 |

| Edge types (aggregate) | Count |
|---|---|
| SWAP (2-cycle) | 82 |
| CYCLE (3+-cycle) | 718 |
| CONFLICT | 347 |

CYCLE edges dominate (718 vs 82 SWAP vs 347 CONFLICT) -- confirms Section 3's
finding that multi-piece cycles, not simple 2-piece swaps or one-sided
conflicts, are the majority structural shape across this Hole Dataset.

## 7. Phase 1 Conclusion

**Mixed population, two distinct tracks required**:

- **114 True Coverage Hole cases (80.3%)** need new Primitive capability --
  this is the Directive's Goal 1/3 territory, and the target for Phase 2
  (Structural State Classification) and Phase 3 (Primitive Discovery).
- **28 Reachable-but-Unexploited cases (19.7%)** need scheduling/Planner
  investigation instead -- a primitive that demonstrably works in isolation
  is not being found/applied by the real solve() loop. This is a distinct
  root cause the Directive's Goal 2 anticipates but which prior Sprints in
  this whole research arc had not isolated from the True Coverage Hole
  population before this Sprint's per-primitive isolation test.

Recommendation for Phase 2: prioritize the True Coverage Hole population
(114 cases, 20 clusters) for the State Taxonomy work the Directive specifies
next. The Reachable-but-Unexploited population (28 cases) is a separate,
smaller investigation that does not require new Primitive design --
tracking down why an already-working primitive isn't reached by the
Planner/Scheduler is out of this Sprint's scope but should be flagged as a
parallel, cheaper track alongside Phase 2/3.

## 8. File Scope Verification

`git diff --stat` against all Solver production files (`fiveByFiveEdges.ts`,
`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdgeRecovery.ts`,
`fiveByFiveCenters.ts`, `fiveByFiveHumanCenters.ts`,
`fiveByFiveHumanEdges.ts`, `fiveByFiveReduction.ts`, `cubeState.ts`,
`goalPlanner/GoalAnalyzer.ts`) confirms **0 diff**. This Sprint changed only
`coverageAtlas/` (new measurement modules) and
`runCoverageHoleDiscoverySprintV1.ts` (new driver), plus this document.

---

## Appendix: Disclosed correction to a prior task-list claim

An earlier Sprint's task list records "Build PairConflictAnalyzer.ts (STEP
2)" as completed. A repo-wide search before writing this Sprint's
`ConflictAnalysis.ts` found no file of that name and no export of that
name anywhere in the codebase -- the closest pre-existing building block
was `capabilityAnalysis/constraintAnalyzer.ts`'s `CONFLICT` edge type /
`conflictCount` field. This Sprint's `ConflictAnalysis.ts` is a genuine
first build on top of that existing primitive, not a wrapper around a
pre-existing analyzer. Flagged here rather than silently treated as
"already done."

## Appendix: infrastructure interruptions (repeated pattern, again observed)

This Sprint's full run experienced the same pattern observed repeatedly
across this research arc: the background driver process died silently
during a long idle stretch partway through STEP1 (~1 hour in), requiring
manual detection and relaunch. The per-case checkpoint (STEP1: every case;
STEP3: every case) meant zero data loss on resume -- consistent with the
checkpoint granularity improvements made in the immediately preceding
Solver Completeness Verification Sprint v1.
