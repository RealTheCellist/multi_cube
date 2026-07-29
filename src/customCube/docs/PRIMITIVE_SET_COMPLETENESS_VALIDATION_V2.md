# Solver Primitive Set Completeness Validation Sprint v2

Status: **Complete. Decision: Conclusion A -- Residual 대부분이 기존
Primitive Set으로 구조적으로 설명되며, 새로운 독립 Failure Family는
관측되지 않음. Primitive Discovery 종료 가능.** Read-only Research/
Validation Sprint -- `git status --short`/`git diff --stat` confirm 0 diff
on every tracked Production file (Recovery/Planner/Executor/Prototype/
Evaluator/capability-analysis/gateRefinement); only new untracked research
modules under `primitiveSetCompletenessV2/` and this document were added.

---

## 1. Executive Summary

This Sprint is a **closure gate**, not Primitive-discovery research: it asks
whether the current Production Primitive Set -- now including Mixed
Commutator behind Gate C (`cycleCount===1 AND componentCount===1`), wired in
by Gate Production Integration Sprint v1 -- structurally explains every
Residual, or whether a genuinely new independent Failure Family remains.

**Answer: Conclusion A.** Residual shrank from v1's 53/142 (37.3%) to
**29/142 (20.4%)** -- a 45.3% reduction, driven almost entirely by Mixed
Commutator closing the majority of what used to be PURE_CYCLE_ISOLATION and
BRIDGE_MISSING cases. Every one of the 29 remaining Residuals is explainable
by an *existing named structural category* (BRIDGE_MISSING/
PURE_CYCLE_ISOLATION/CONFLICT_DEEP_DEPENDENCY) -- none fall into UNKNOWN,
and no coherent new-shape cluster was found. Conclusion A does **not** mean
these 29 cases are solved -- the real production Recovery layer, run for
real (Gate C, N=10 repeats), produces literally zero candidates on all 29 --
it means their *unsolved-ness* is already structurally accounted for by
categories this research arc already named, not a mysterious new shape. The
research center of gravity can now shift from Primitive Discovery to
completeness verification and engineering optimization, per the Directive's
own framing.

## 2. Dataset

142-case Hole Dataset (`loadRawHoleDataset()`, unchanged from every prior
Sprint in this arc). `buildLibs()` for `ExecutorLibraries`. No new dataset
generation -- this Sprint is entirely a Residual re-classification against
the current production Primitive Set.

## 3. Residual Population Analysis (RQ-1)

Union Coverage test (`CoverageMatrixV2.ts`), decoupled from Gate/budget
exactly like v1's own methodology, extended with MIXED_COMMUTATOR as a 6th
independently-tested primitive (via `tryMixedCommutatorPrototype`,
unconditional -- no Gate -- at the same `COVERAGE_TEST_BUDGET_MS=5000`
extended budget v1 used for BASE/FLIP/CASE/PARITY/CCR):

| Primitive | Solved | Rate |
|---|---:|---:|
| BASE | 60/142 | 42.3% |
| FLIP | 0/142 | 0.0% |
| CASE | 0/142 | 0.0% |
| PARITY | 80/142 | 56.3% |
| CCR | 11/142 | 7.7% |
| **MIXED_COMMUTATOR** | **86/142** | **60.6%** |
| Union (any of 6) | 113/142 | 79.6% |
| **Residual** | **29/142** | **20.4%** |

Mixed Commutator, tested independently of its production Gate, solves
86/142 cases in isolation -- far more than any other single primitive.
**Residual v1 (5-primitive union) = 53/142 -> Residual v2 (6-primitive
union) = 29/142: -24 cases, a 45.3% reduction.**

## 4. Failure Taxonomy v2 (RQ-2)

`ResidualFailureTaxonomy.ts`'s own `classifyResidual()` (Solver Primitive Set
Completeness Validation Sprint v1) reused **completely unmodified** -- same
5-class taxonomy, same disclosed first-match-wins rule. No new label was
needed:

| Class | n | avgConflictEdgeCount | avgCycleLength | parityRate |
|---|---:|---:|---:|---:|
| BRIDGE_MISSING | 3 | 0.00 | 3.67 | 0.0% |
| PURE_CYCLE_ISOLATION | 10 | 0.00 | 4.50 | 10.0% |
| CONFLICT_DEEP_DEPENDENCY | 16 | 7.38 | 0.00 | 37.5% |
| LOCKED_PAIR_NO_CYCLE | 0 | -- | -- | -- |
| UNKNOWN | 0 | -- | -- | -- |

**Zero UNKNOWN residuals** -- every one of the 29 falls into a category this
arc already named and already has a disclosed structural definition for.

## 5. Primitive Coverage Analysis (RQ-4)

`RecoveryAttemptProbe.ts` calls the REAL, unmodified, current-production
`generateRecoveryStrategies()`/`chooseBestRecovery()` (Gate C as actually
wired in, no reconstruction) against each of the 29 residuals, N=10 fresh
repeats each (this arc's own established repeat convention), recording which
of DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR reached "start" (attempted) and
"generated" (produced a candidate):

| Primitive | Attempted | Produced |
|---|---:|---:|
| DISRUPT | 100.0% | 0.0% |
| SETUP | 100.0% | 0.0% |
| REPAIR | 100.0% | 0.0% |
| CCR | 100.0% | 0.0% |
| MIXED_COMMUTATOR | 100.0% | 0.0% |

`solvedByRecoveryCount=0/29 (0.0%)`. Every primitive is genuinely tried on
every residual (100% attempted) but **none ever produces a candidate**
(0% produced across the board, all 10 repeats) -- this is not a scheduling
or Gate-eligibility miss, it is a real capability ceiling: these 29 states
are outside what any current Primitive's search can construct, full stop.

## 6. Family Transition Matrix (RQ-3)

Previous (v1, 5-primitive union) vs Current (v2, 6-primitive union with
Mixed Commutator):

| Family | Previous | Current | Delta |
|---|---:|---:|---:|
| BRIDGE_MISSING | 12 | 3 | **-9** |
| PURE_CYCLE_ISOLATION | 28 | 10 | **-18** |
| CONFLICT_DEEP_DEPENDENCY | 13 | 16 | **+3** |
| LOCKED_PAIR_NO_CYCLE | 0 | 0 | 0 |
| UNKNOWN | 0 | 0 | 0 |

Mixed Commutator's Gate (`cycleCount===1 AND componentCount===1`) directly
targets the exact shape PURE_CYCLE_ISOLATION and (partially, via cycle
resolution reducing component count) BRIDGE_MISSING occupy -- explaining
the -18 and -9 drops. CONFLICT_DEEP_DEPENDENCY actually **grew** (+3, not
shrank) even though total Residual fell sharply -- because Mixed
Commutator's Gate structurally excludes conflict-bearing states
(`conflictEdgeCount` isn't part of Gate C, but the Primitive's own
mechanism targets isolated cycles, not conflict chains), so cases that used
to be masked by co-occurring cycle/bridge structure are now revealed as
pure conflict-dependency residuals once the cycle/bridge component is
cleared elsewhere in the union test. **CONFLICT_DEEP_DEPENDENCY is now the
dominant residual class (16/29, 55.2%)** -- the clearest concrete target
for any future Gate/Budget refinement work (see Section 9).

## 7. Structural Closure Assessment (RQ-5)

Disclosed rule (`StructuralClosureAssessment.ts`): a residual is judged
**A (explainable)** iff `classifyResidual()` assigns it a named existing
class; **B (new-Family candidate)** iff UNKNOWN. Since no residual fell into
UNKNOWN, all 29 are judged A:

- `totalResiduals=29, explainableCount=29, explainableRate=100.0%`
- `newFamilyCandidateCount=0`
- UNKNOWN cluster signature check: `n=0, isCoherentCluster=false` (vacuous
  -- no UNKNOWN residuals exist to check for a shared signature)

## 8. Conclusion (A/B/C)

**Conclusion A -- Primitive Discovery 종료 가능.**

Directive's own Success Criteria, applied in order:
- C (new independent Family found) does NOT apply -- `newFamilyFound=false`.
- A applies -- `explainableRate=100.0% >= 80%` threshold AND no new Family.

`decision=A_DISCOVERY_CLOSED`. Rationale: every Residual already falls into
a category this research arc's own prior Sprints (Deep Cycle Resolver
Validation, CCR Completeness Validation, Solver Primitive Set Completeness
Validation v1) already named and structurally defined -- Mixed Commutator's
addition to the Primitive Set did not surface any new independent Failure
Family, it simply moved the boundary between explainable classes (shrinking
PURE_CYCLE_ISOLATION/BRIDGE_MISSING sharply, leaving CONFLICT_DEEP_DEPENDENCY
as the dominant remainder).

## 9. Next Sprint Recommendation

Per this Sprint's own framing: research should now move from **Primitive
Discovery** to **completeness verification and engineering optimization**.
Concretely:

1. **CONFLICT_DEEP_DEPENDENCY is now 55.2% of the residual population
   (16/29)**, up from 13/53 (24.5%) under v1's population share -- both in
   absolute share and now the clear majority. No current Primitive's Gate
   targets `conflictEdgeCount>0` structures at all (CCR's Gate explicitly
   requires `conflictEdgeCount===0`; Mixed Commutator's Gate doesn't test
   it either but its underlying mechanism doesn't resolve conflict chains).
   A **Conflict-Dependency-focused Gate/Budget or new Primitive research
   Sprint** targeting this specific, now-dominant, already-named category is
   the most concrete next step -- not a blind new-Family search (this
   Sprint already ruled that out).
2. BRIDGE_MISSING (3 remaining) and PURE_CYCLE_ISOLATION (10 remaining) are
   both far smaller now and likely represent the harder tail within their
   own categories (e.g. cases outside CCR's `cycleLength 5~6` Gate window or
   Mixed Commutator's own reserved-slice budget limits) -- worth a light
   Gate/Budget sensitivity check but not a priority relative to
   CONFLICT_DEEP_DEPENDENCY's now-larger share.
3. Since `solvedByRecoveryCount=0/29` under the REAL current production
   Recovery layer (not just the independent-primitive test), any future
   improvement Sprint should measure against this Sprint's own Primitive
   Coverage baseline (0% produced across all 5 recovery types) to confirm a
   genuine capability gain, not a scheduling artifact.

---

- 코드 변경: 없음 (Validation Sprint) -- `git diff --stat` 확인, 0 diff
- 문서: `src/customCube/docs/PRIMITIVE_SET_COMPLETENESS_VALIDATION_V2.md`
- 데이터: `primitiveSetCompletenessV2/data/primitive-set-completeness-validation-v2-report.txt` / `-result.json`
- 브랜치: `claude/cube-game-dev-afnm5z`
