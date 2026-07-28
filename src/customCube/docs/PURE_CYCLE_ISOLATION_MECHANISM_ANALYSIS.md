# PURE_CYCLE_ISOLATION Structural Mechanism Analysis Sprint v1

Status: **Complete. Verdict: a common failure mechanism explains the large
majority of the population (24-25/28, 85.7-89.3%) -- closest to
Conclusion A**, with two disclosed, quantified exceptions (Section 5). No
new Primitive was designed. Full report:
`pureCycleIsolationMechanism/data/pure-cycle-isolation-mechanism-analysis-v1-report.txt`.

---

## 1. Method

One parameterized, fidelity-verified shadow search
(`CycleSearchShadow.ts`) serves BOTH mechanisms under study: BP-1
(`resolveBoundedMultiCycle`, branching width 2) and CCR (branching width
3). This is possible because both mechanisms, per direct code reading,
share the *exact same* underlying algorithm shape -- both call
`analyzeMultiCycle()` (`solverV2Prototype/MultiCycleAnalyzer.ts`) for
identical cycle-node ordering, both bounded-DFS with a per-hop
`enumerateWingCandidates()` call, both share the same
`MAX_LEAVES_EXPLORED=64` cap (the literal same exported constant from
`BoundedResolver.ts`). The only difference this Sprint measures is
branching width. Fidelity for the BP-1 side was verified against the
real, exported `resolveBoundedMultiCycle()`: **0/28 mismatches**. The CCR
side's fidelity was already established in CCR Completeness Validation
Sprint v1 (0/60 mismatches, a superset including these same 28 cases).

**Disclosed methodological note**: this shadow deliberately bypasses each
mechanism's own production Gate (BP-1's `MIN_CYCLE_LENGTH=4`, CCR's
`cycleLength 5-6 AND conflictEdgeCount=0`) to isolate the two search
CORES for a like-for-like comparison, independent of each one's separate
gating policy. This means the "BP-1"/"CCR" results here measure "what
would this search algorithm do if applied," not "what does the real,
Gate-checked production function do" -- a distinction that matters for one
case (Section 5).

## 2. BP-1 vs CCR Failure Matrix (RQ-1/RQ-2/RQ-3)

| | Count/Avg |
|---|---|
| Same termination reason (BP-1 == CCR) | 25/28 (89.3%) |
| Both SEARCH_EXHAUSTED | 24/28 (85.7%) |
| Either LEAF_CAP_REACHED | 3/28 (10.7%) |
| avg leaves explored | BP-1: 5.6, CCR: 16.3 |
| avg max depth reached | BP-1: 3.8, CCR: 3.9 |

CCR's wider branching (3 vs 2) explores ~3x more leaves on average for
the same depth, yet **89.3% of cases still terminate with the identical
reason** -- strong, direct evidence that the two mechanisms fail for the
same underlying cause, not different ones (RQ-3's answer: same reason).
A notable, counter-intuitive nuance: CCR's wider branching causes it to
hit the SHARED 64-leaf cap on 3 cases where BP-1's narrower branching
lets it fully exhaust the same search space naturally -- wider branching
burns through the shared leaf budget faster without proportionally more
solutions found.

## 3. Subtype Taxonomy (RQ-4) -- and Why It Needs a Second Look

The raw, measured-feature-based classifier (priority order: NESTED_CYCLE
-> LOCKED_CYCLE -> LONG_CYCLE -> DEAD_CYCLE -> UNKNOWN) produces:

| Subtype | n | Share |
|---|---|---|
| DEAD_CYCLE | 16 | 57.1% |
| LONG_CYCLE | 8 | 28.6% |
| LOCKED_CYCLE | 3 | 10.7% |
| UNKNOWN | 1 | 3.6% |

Taken at face value, no bucket reaches this research arc's 60%-dominance
threshold, which is why the automated `BlueprintReadinessAssessment`
module returns Conclusion B. **But a direct cross-check reveals this
split is an artifact of the classifier's own priority order, not a real
mechanism difference**: all 8 LONG_CYCLE cases *also* satisfy
`bothSearchExhausted` -- they were only routed to LONG_CYCLE because the
classifier checks `cycleLength>=6` before checking termination reason.
DEAD_CYCLE(16) + LONG_CYCLE(8) = 24, exactly matching
`bothSearchExhaustedCount` from Section 2. **Cycle length is not actually
a distinguishing factor for the failure mechanism** -- length-5 and
length-6 single-cycle cases fail for the identical reason once the
classifier's incidental length-based split is set aside.

## 4. Mechanism Gap Specification

- **Currently possible**: both mechanisms can bounded-DFS through the
  shared cycle-node ordering, branching on real
  `enumerateWingCandidates()` output, reaching avg depth ~3.8-3.9 (of a
  max possible 5-6).
- **Currently impossible**: for 24/28 (85.7%), even fully exhausting
  every reachable branch (both mechanisms independently confirm this --
  `SEARCH_EXHAUSTED`, not merely time- or leaf-limited) finds no
  net-improving leaf. This is not a search-parameter problem (width,
  depth, leaf cap) -- it is a **representational gap**:
  `enumerateWingCandidates()` genuinely does not offer any move sequence,
  within either mechanism's own reach, that improves these specific
  permutations.
- **Common failure condition**: 25/28 (89.3%) share the identical
  termination reason across both mechanisms -- the strongest single piece
  of evidence for one shared cause.

## 5. Two Disclosed, Quantified Exceptions

1. **LOCKED_CYCLE (3/28, 10.7%)** -- genuinely different: CCR's wider
   branching hits the *shared* leaf cap before the search can complete,
   while BP-1's narrower branching (paradoxically) finishes naturally.
   This subset's failure IS partly search-parameter-related (a smarter
   leaf-budget allocation, not a wider net alone, might help) -- distinct
   from the representational-gap majority.
2. **One case (snapshot335:1af658ab, 3.6%)** -- this Sprint's own
   Gate-bypassed test found BOTH mechanisms' underlying search algorithm
   already SOLVES it (`SOLUTION_FOUND`, 4 leaves). It was only counted as
   "unsolved" in Solver Primitive Set Completeness Validation Sprint v1
   because CCR's own Gate (`cycleLength 5-6`) rejects this case's length-3
   cycle before ever attempting a search -- a Gate-policy false negative,
   not a capability gap. Out of scope for this Sprint to fix (Gate/CCR
   modification forbidden), but worth flagging as a separate, low-cost
   finding for a future Sprint.

## 6. Blueprint Readiness Assessment

**Closest to Conclusion A**: a common failure mechanism (both mechanisms'
bounded-DFS exhausting every reachable branch found in
`enumerateWingCandidates()`'s own output, with no improving leaf) explains
85.7% of the population once the classifier's incidental cycle-length
split is corrected for. The automated module's literal output is
Conclusion B (driven by the length-based subtype split not crossing 60%),
but that split does not reflect a different underlying cause -- both
"subtypes" share the identical mechanism. **Recommendation**: proceed
toward a Blueprint targeting the representational gap (a move-generation
limitation, not a search-algorithm limitation) as the primary target,
while separately noting LOCKED_CYCLE's distinct leaf-budget-allocation
issue (10.7%) as a secondary, lower-priority consideration.

## 7. File Scope Verification

`git diff --stat` against every protected file this Sprint's Directive
lists, plus `solverV2Prototype/` and `solverPrimitiveCCRPrototype/` (read
from extensively -- `resolveBoundedMultiCycle`/`analyzeMultiCycle` called
read-only, never modified) confirms **0 diff**. This Sprint added only
`pureCycleIsolationMechanism/` (measurement modules) and this document. No
new Primitive or Prototype was designed or implemented.
