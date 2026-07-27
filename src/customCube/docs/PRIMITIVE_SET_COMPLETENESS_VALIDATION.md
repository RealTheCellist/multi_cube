# Solver Primitive Set Completeness Validation Sprint v1

Status: **Complete. Decision: Conclusion C -- 현재 Primitive Set으로는
설명 불가능한 독립적인 Failure Class가 존재한다.** This Sprint is the
capstone of a chain that ruled out Representation, Dataset, Planner,
Recovery Necessity, Deep Cycle Resolver-as-new-Primitive, and CCR's own
search completeness as root causes. With every other candidate explanation
exhausted, this Sprint measured directly whether the current 5-Primitive
Set (BASE/FLIP/CASE/PARITY/CCR) structurally covers the Failure
Population. Full report:
`primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-report.txt`.

---

## 1. Method

All 142 Hole Dataset cases were tested against each of the 5 named
primitives **independently** (scratch clone per primitive, uniform 5000ms
extended budget -- this research arc's own established convention).
"CCR" here means exactly what production's own `genCCR` calls --
`runCCRPrototype(cubies, lib, deadline, "singleCycle")` directly, not the
full Recovery generator stack (DISRUPT/SETUP/REPAIR), since Recovery
Necessity Validation Sprint v1 already established those contribute
essentially nothing. "First Successful Primitive" and the Union Capability
stepwise analysis both use production's own pipeline order:
BASE -> FLIP -> CASE -> PARITY -> CCR.

## 2. Primitive Coverage Report

| Primitive | Solved | Share |
|---|---|---|
| BASE | 64/142 | 45.1% |
| FLIP | 0/142 | 0.0% |
| CASE | 0/142 | 0.0% |
| PARITY | 85/142 | 59.9% |
| CCR | 12/142 | 8.5% |
| **Union (any of the 5)** | **89/142** | **62.7%** |
| **Residual (none succeed)** | **53/142** | **37.3%** |

FLIP and CASE contribute **zero** independent coverage on this population
(their targets fully overlap with what BASE/PARITY already solve, or this
population simply contains none of their specific trigger shapes).

## 3. Union Capability Analysis (stepwise)

| Step | Cumulative | Rate | Incremental Gain |
|---|---|---|---|
| BASE | 64/142 | 45.1% | +64 |
| BASE+FLIP | 64/142 | 45.1% | +0 |
| BASE+FLIP+CASE | 64/142 | 45.1% | +0 |
| BASE+FLIP+CASE+PARITY | 86/142 | 60.6% | +22 |
| BASE+FLIP+CASE+PARITY+CCR | 89/142 | 62.7% | +3 |

Each primitive is tested independently, so these overlap: PARITY alone
solves 85 cases, but only 22 of those are cases BASE doesn't already
solve -- the two primitives' capability substantially overlaps.

## 4. Residual Failure Taxonomy (RQ-3: one structure, or several?)

53/142 (37.3%) cases remain unsolved by all 5 primitives even at extended
budget. Classified purely from measured `DeepCycleStructuralProfile`
features (rule disclosed in `ResidualFailureTaxonomy.ts`, no case placed
by inspection):

| Class | n | Share of Residual | avg cycleLength | avg componentCount | avg conflictEdge | avg dependencyDepth |
|---|---|---|---|---|---|---|
| **PURE_CYCLE_ISOLATION** | 28 | **52.8%** | 5.00 | 1.00 | 0.00 | 5.00 |
| CONFLICT_DEEP_DEPENDENCY | 13 | 24.5% | 0.00 | 1.00 | 7.69 | 7.69 |
| BRIDGE_MISSING | 12 | 22.6% | 4.33 | 2.08 | 0.00 | 4.33 |

**No single class reaches this Sprint's 60% dominance threshold** -- the
largest (PURE_CYCLE_ISOLATION) is 52.8%. Three structurally distinct
classes coexist in comparable proportions: single-component isolated
cycles CCR's own bounded DFS cannot resolve even after fully exhausting
its search space (cross-referencing CCR Completeness Validation Sprint
v1's own SEARCH_EXHAUSTED finding -- "search complete" does not mean
"solved"); one-sided conflict-dependency chains with no cycle at all
(avg 7.69 conflict edges, deepest dependency chains of the three classes);
and multi-component states where no primitive's traversal crosses a
component boundary.

## 5. Primitive Set Boundary Specification

- **Representable**: 89/142 (62.7%) -- states the main pipeline
  (BASE/FLIP/CASE/PARITY) resolves directly in one independent pass, plus
  the subset of single-component, conflict-free, 5-6-length cycles CCR's
  bounded DFS actually finds a solution for.
- **Non-representable**: 53/142 (37.3%) -- see taxonomy above.
- **Boundary condition**: drawn by the combination of `componentCount`
  (single vs multi), `conflictEdgeCount` (present or not), and
  `cycleCount` (present or not). The current Set only explicitly targets
  "single component + no conflict + cycle present (length 5-6)" (CCR's own
  Gate) -- every other combination (multi-component, conflict-present, or
  cycle length outside the Gate) has no explicit target in any existing
  primitive's design.

## 6. Research Recommendation

**Conclusion C -- 현재 Primitive Set으로는 설명 불가능한 독립적인 Failure
Class가 존재한다.** The residual population (37.3%, well above this
research arc's 5% meaningful-effect threshold) splits into 3 comparably-
sized, structurally distinct classes (22.6% / 52.8% / 24.5%) rather than
one dominant shape a single extension could plausibly cover -- this rules
out Conclusion B (a single existing-Primitive extension) and confirms
Conclusion C. Any future Primitive research should treat these as
(at least) three separate design targets, not one: a cycle-resolution
mechanism genuinely different from CCR's own bounded DFS (for
PURE_CYCLE_ISOLATION -- CCR already fully explores this shape and still
fails), a conflict-breaking/sacrifice mechanism (for
CONFLICT_DEEP_DEPENDENCY -- matching State Taxonomy v2's own
"Conflict-Breaking Sacrifice"/Primitive-Candidate-C prior art), and a
bridging mechanism (for BRIDGE_MISSING -- matching that same Sprint's
"Bridge Injection"/Primitive-Candidate-B prior art).

## 7. File Scope Verification

`git diff --stat` against every protected file this Sprint's Directive
lists, plus `solverPrimitiveCCRPrototype/` and `solverV2Prototype/` (read
from, never modified), confirms **0 diff**. This Sprint added only
`primitiveSetCompleteness/` (measurement modules) and this document. No
new Primitive, Prototype, or production code was implemented.
