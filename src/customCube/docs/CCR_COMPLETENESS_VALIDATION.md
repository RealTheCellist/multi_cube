# CCR Completeness Validation Sprint v1

Status: **Complete. Decision: Conclusion A -- CCR은 현재 구조에서 충분히
Complete하다. Recommendation: MAINTAIN.** This Sprint measured whether the
EXISTING, unmodified CCR (Clean-Cycle Resolution) implementation is
search-complete, or whether its fixed `MAX_LEAVES_EXPLORED=64` leaf cap is
a real bottleneck -- per the Directive, CCR itself, the leaf cap, and every
protected production file were left untouched throughout. Full report:
`ccrCompletenessValidation/data/ccr-completeness-validation-v1-report.txt`.

---

## 0. Method: Fidelity-Verified Shadow Instrumentation

`CCRPrototype.ts`'s own `runBoundedDfs` is a **private, non-exported**
function -- there is no way to read its internal leaf/depth/branch
counters without either modifying that file (forbidden) or building a
disclosed, faithful reimplementation. `CCRShadowInstrumentation.ts`
reimplements the exact same algorithm, using the same public building
blocks (`enumerateWingCandidates`, `applySeq`, `wrongWingCount5`,
`pairCountOf`, `validateDeferred`) and the same constants
(`MAX_LEAVES_EXPLORED` imported directly from `BoundedResolver.ts`;
`PER_HOP_DEADLINE_MS=60`/`MAX_CANDIDATES_PER_HOP=3` copied verbatim from
`CCRPrototype.ts`'s own source, cited). **Fidelity was verified, not
assumed**: all 60 CCR-Gate-eligible cases were run through both the real
`runCCRPrototype()` and the shadow at an identical deadline -- **0/60
mismatches** in solved/unsolved verdict and move count.

## 1. Population and Search Funnel

Of the full 142-case Hole Dataset, **60 cases (42.3%) pass CCR's own Gate**
(`cycleLength` in [5,6] AND `conflictEdgeCount` == 0) -- a much larger
population than the 3 RECOVERY_REQUIRED cases Recovery Necessity
Validation Sprint v1 measured (most of these 60 are already solved by the
main pipeline or Recovery Optional; only 3 are CCR's true burden).

| Stage | Count |
|---|---|
| Gate Passed | 60 |
| DFS Started | 60 |
| Leaf Expansion Occurred | 60 |
| Termination Recorded | 60 |
| Solved | 11 |

## 2. Termination Classification

| Reason | Count | Share |
|---|---|---|
| SOLUTION_FOUND | 11 | 18.3% |
| SEARCH_EXHAUSTED | 47 | 78.3% |
| LEAF_CAP_REACHED | 2 | 3.3% |
| BUDGET_EXPIRED | 0 | 0.0% |

Measured at a 15000ms deadline (3x Deep Cycle Resolver Sprint's own 5000ms
extended-budget convention); the 0 BUDGET_EXPIRED cases needed no
60000ms secondary retest. The dominant outcome by far is
**SEARCH_EXHAUSTED**: the DFS reaches every reachable branch on its own
terms and correctly finds nothing better -- not an artificial cutoff.

## 3. Completeness Matrix

| | Count | Share |
|---|---|---|
| Search Complete (SOLUTION_FOUND or SEARCH_EXHAUSTED) | 58 | 96.7% |
| Search Incomplete (LEAF_CAP_REACHED or BUDGET_EXPIRED) | 2 | 3.3% |

## 4. Leaf Cap Impact Analysis

Only **2/60 (3.3%)** cases (`worstCase:1513fcff`, `snapshot335:45959141`)
actually hit the 64-leaf cap. Their measured `estimatedSearchTree`
(avgBranchingFactor^cycleLength) averages **2.29x** the leaf cap (231.7 and
60.9 respectively, vs cap=64) -- genuinely oversized search trees, unlike
the unaffected population's average ratio of 0.56x (well under the cap).

## 5. A Correction to Deep Cycle Resolver Validation Sprint v1's Own Hypothesis

That Sprint (this session's own immediately-prior work) attributed
`worstCase:b714481`'s unsolved status to the `MAX_LEAVES_EXPLORED=64` leaf
cap, reasoning from a first-hop-only branching-factor probe. **This
Sprint's direct instrumentation refutes that attribution**:
`worstCase:b714481` explored only **7 leaves** (nowhere near the 64 cap)
before terminating with `SEARCH_EXHAUSTED` at `maxDepthReached=6` (full
cycle depth) -- its own `estimatedSearchTree` here is 11.4, well under the
cap. The real reason CCR cannot solve this specific case is not "the
search got cut off before finding the answer" but "the search fully
explored everything `enumerateWingCandidates` can offer along this cycle,
and none of it improves on the starting state" -- a genuine structural
dead-end in the existing candidate-generation reach, not a truncated
search. This is disclosed as a correction, not silently folded in; the
prior Sprint's own document is left unchanged (already delivered), but
this Sprint's own conclusion is built on this newer, more precise
measurement.

## 6. Completeness Assessment + Recommendation

**Conclusion A -- CCR은 현재 구조에서 충분히 Complete하다.** Both
LEAF_CAP_REACHED (3.3%) and BUDGET_EXPIRED (0.0%) fall under this
research arc's own 5% meaningful-impact threshold (matching Recovery
Necessity Validation Sprint's own precedent for distinguishing a real
population effect from noise). The overwhelming majority (96.7%) of
Gate-eligible cases reach a definitive search conclusion on their own
terms. **Recommendation: MAINTAIN** -- no Parameter Refinement or
Architectural Change Sprint is justified by this population's own data.

## 7. File Scope Verification

`git diff --stat` against every protected file this Sprint's Directive
lists, plus `solverPrimitiveCCRPrototype/` and `solverV2Prototype/`
(read from extensively, never modified) confirms **0 diff**. This Sprint
added only `ccrCompletenessValidation/` (measurement/instrumentation
modules, fidelity-verified against the real, unmodified CCR) and this
document. CCR itself, `MAX_LEAVES_EXPLORED`, and every production file
were left untouched.
