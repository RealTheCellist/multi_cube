# State Taxonomy Sprint v2 — Structural Mechanism Analysis

Status: **Complete**. Answers the question Phase 2 STEP1 (State Taxonomy
v1) could not: not just *what kind* of Coverage Hole each case is, but
*why* it arises. Grounded in a freshly regenerated 142-case Hole Dataset
that persists both the final stuck state and the original pre-pipeline
state (fixing the data-retention gap found after Phase 1). Full report:
`mechanismAnalysis/data/mechanism-analysis-v1-report.txt`.

---

## 1. Method

No new full-pipeline simulation was needed for STEP1-4 -- this Sprint
re-classifies the regenerated Hole Dataset's 142 cases per-case (not
cluster-bucketed, unlike Phase 2 STEP1), then tests three concrete
mechanism hypotheses per case using cheap, targeted re-execution:

- **Bridge Missing**: `componentCount > 1` in the real WANTS-graph -- is
  the cycle isolated because the graph itself is split into disjoint
  pieces with no bridging piece?
- **Budget/DFS cutoff**: re-running the existing, unmodified capability
  tester at **12.5x the baseline deadline** (5000ms vs 400ms -- the
  tester now takes an optional `deadlineMs` parameter, added this Sprint,
  fully backward compatible) -- does a primitive that failed at 400ms
  succeed at 5000ms?
- **Precondition vs. byproduct** (Conflict Dominant only): does a
  structural CONFLICT edge in the final stuck state also exist between
  the same two slots in the *original* pre-pipeline state? If yes, the
  conflict predates the pipeline; if no, the pipeline's own centers/wing-
  pairing moves manufactured it.

## 2. Cycle Isolation Subtypes (STEP1, 56 cases this run)

| Subtype | Count | Mechanism |
|---|---|---|
| **PURE_STRUCTURAL_ISOLATION** | **24** | Single component, budget doesn't help -- genuine structural gap in existing search strategy |
| BRIDGE_MISSING_AND_BUDGET_RECOVERABLE | 16 | Disjoint components, but found at 5000ms anyway |
| BRIDGE_MISSING | 9 | Disjoint WANTS-graph components -- Directive's "Bridge Missing" **confirmed to exist** |
| BUDGET_RECOVERABLE | 7 | Reachable, just needs more search budget -- not a capability gap |

Cycle length distribution: 3-cycle=7, 4-cycle=15, 5-cycle=15, 6-cycle=19 --
longer cycles dominate, consistent with State Taxonomy v1's finding that
CYCLE edges vastly outnumber SWAP edges.

**The Directive's "Bridge Missing" category is real** (9+16=25 of 56 cases
show componentCount>1), not a hypothetical -- this Sprint is the first to
confirm it with actual component-count measurement on real states (Phase 2
STEP1 could not check this; the raw states weren't retained yet).

## 3. Conflict Dominant Cause-vs-Effect (STEP2, 34 cases this run)

| Verdict | Count | Meaning |
|---|---|---|
| PRECONDITION | 0 | (none -- every conflict case has at least one byproduct edge) |
| **MIXED** | **29** | Some conflict edges pre-existed, some were manufactured by the pipeline itself |
| BYPRODUCT | 5 | 100% of conflict edges were created by centers/wing-pairing moves, not present originally |

**Zero pure-precondition cases.** Every single Conflict Dominant case
involves at least some conflict structure the pipeline itself created --
the "Conflict Dominant Sacrifice" mechanism (from the earlier Primitive
Prototype Sprint v2) targeting purely pre-existing conflicts may be
targeting a narrower slice of the real problem than assumed; the dominant
finding (29/34 = 85%) is **mixed causation**, where pipeline moves
compound an already-present dependency rather than creating it from
nothing or leaving it untouched.

## 4. Parity-Gated Cycle Split (STEP3, 51 cases this run)

| Verdict | Count | Meaning |
|---|---|---|
| RECOVERY_RECOVERABLE | 0 | (none -- confirms Planner Investigation Sprint's finding that RECOVERY never resolves this population) |
| BASE_PIPELINE_RECOVERABLE | 21 | Main pipeline (BASE/FLIP/CASE/PARITY) already covers it -- scheduling issue |
| **BUDGET_RECOVERABLE** | **24** | Needs more search time, not new capability |
| **TRUE_GAP** | **6** | Genuine new-Primitive target |

**Cross-Sprint consistency**: zero RECOVERY_RECOVERABLE cases here exactly
matches the Planner Scheduling Investigation Sprint's independent finding
(0/28 cases resolved via RECOVERY in isolation) -- two separate analyses
of the same regenerated dataset converge on the same conclusion about
Recovery's irrelevance to this population.

## 5. Primitive Opportunity Map (STEP5)

Only true-gap subtypes get a Primitive candidate -- everything
scheduling/budget-recoverable is explicitly routed to the Planner
Scheduling Investigation Sprint instead (Section 6).

| ID | Target | Cases | Expected Mechanism | Prior Art |
|---|---|---|---|---|
| Primitive-Candidate-A | Cycle Isolation / Pure Structural Isolation | 24 | **Deep Cycle Resolver** -- a different search strategy for isolated 3+ cycles within one component, since more budget alone doesn't help | `solverV2Prototype/BoundedResolver.ts` (BP-1) -- confirmed to exist, never integrated into production |
| Primitive-Candidate-B | Cycle Isolation / Bridge Missing | 25 (9+16) | **Bridge Injection** -- deliberately sacrifice one component to create a new WANTS relation bridging it to the other | `solverPrimitivePrototype/MultiHopBridgePrototype.ts` (Primitive Prototype Sprint v2) -- confirmed to exist |
| Primitive-Candidate-D | Parity-Gated Cycle / True Gap | 6 | **Parity-Cycle Specialist** -- conjugate PARITY_ALG by setup moves tuned to the specific cycle shape | `solverV2PrototypeBP2/ParityAwareResolver.ts` (BP-2) -- confirmed to exist |

All three prior-art citations were verified to exist on disk (exact file
paths) before being included -- not assumed from task-history text.

## 6. Non-Primitive Recommendations (route to Planner track)

| Target | Cases | Recommendation |
|---|---|---|
| Cycle Isolation / Budget Recoverable | 7 | Budget/priority tuning only |
| Conflict Dominant / Byproduct | 5 | Task-ordering fix (Planner), not a new Primitive |
| Parity-Gated Cycle / Scheduling-fixable | 45 (21+24) | Core target for Planner Scheduling Investigation Sprint |

## 7. File Scope Verification

`git diff --stat` against all protected Solver production files
(`fiveByFiveEdges.ts`, `fiveByFiveEdgeSolverEngine.ts`,
`fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdgeRecovery.ts`, `fiveByFiveCenters.ts`,
`fiveByFiveHumanCenters.ts`, `fiveByFiveHumanEdges.ts`,
`fiveByFiveReduction.ts`, `cubeState.ts`, `goalPlanner/GoalAnalyzer.ts`)
confirms **0 diff**. This Sprint's only non-`mechanismAnalysis/`
production-adjacent change was adding an optional, backward-compatible
`deadlineMs` parameter to `capabilityAnalysis/primitiveCapabilityTester.ts`
(default unchanged) -- committed and verified separately during Phase 1
follow-up.

---

## Appendix: numbers differ slightly from State Taxonomy Sprint v1

This Sprint required regenerating the Hole Dataset (the original run's raw
states were lost to a checkpoint-deletion bug, fixed immediately after
discovery). The regeneration reused the same 142-case selection function,
but 60 of the 142 cases (`scrambleDepth*`) are freshly randomly generated
each run (not seeded) -- only the 82 `worstCase`/`snapshot335` cases are
exactly reproducible. This is why this run's category totals (Parity-Gated
Cycle 51, Cycle Isolation 56, Conflict Dominant 34, remainder Locked Pair)
differ slightly from v1's (56/50/33/3) -- both runs are valid samples of
the same underlying population, not a discrepancy in either Sprint's
method.
