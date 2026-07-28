# Move Representation Blueprint Sprint v1

Status: **Complete. Decision: Conclusion A -- 새 Move Representation이
Residual Failure의 구조적 원인을 설명하며 Prototype 단계로 진행할 준비가
되었다.** This is the first Blueprint (design) Sprint in this whole
research chain to reach a positive, actionable design conclusion -- every
prior Sprint eliminated a candidate root cause (Representation/State,
Dataset, Planner, Recovery, CCR Completeness, Primitive Set sufficiency,
Search Budget, Leaf Cap); this Sprint is the first to define a concrete,
buildable mechanism. No implementation was written -- every quantitative
input is cited from three prior Sprints' own already-measured data, never
re-derived or guessed. Full report:
`moveRepresentationBlueprint/data/move-representation-blueprint-v1-report.txt`.

---

## 1. Representation Design Space

Four candidates were defined: **Pair Move** (fixed unit 2), **Multi-Wing
Move** (fixed unit 3), **Cycle Rotation** (adaptive, sized to each case's
own measured cycle length), and **Commutator Move** (adaptive, a
setup+narrow-algorithm+setup-inverse composition -- standard cubing
theory).

## 2. Expressiveness Comparison (real cycleLength distribution)

The real, measured cycleLength distribution across all 28
PURE_CYCLE_ISOLATION cases (from PURE_CYCLE_ISOLATION Structural
Mechanism Analysis Sprint v1's own result data): **{3: 3, 4: 5, 5: 9, 6:
11}**.

| Representation | One-shot Coverage |
|---|---|
| Pair Move (unit 2) | 0/28 (0.0%) -- no length-2 cycles in this population |
| Multi-Wing Move (unit 3) | 3/28 (10.7%) -- only the length-3 subset |
| **Cycle Rotation** (adaptive) | **28/28 (100%)** |
| **Commutator Move** (adaptive) | **28/28 (100%)** |

Only the two adaptive representations reach full one-shot coverage of
the measured population.

## 3. Complexity Analysis

Grounded in real figures from three prior Sprints: avg per-hop branching
factor ~1.7-2.5 and estimated search-tree sizes 11-232 (Deep Cycle
Resolver Validation Sprint v1); avg leaves explored 5.6 (BP-1) / 16.3
(CCR) (PURE_CYCLE_ISOLATION Mechanism Analysis Sprint v1); avg existing
candidate move length ~104-125 physical quarter-turns and avg
`affectedWingCount` ~30 (Move Representation Gap Analysis Sprint v1).

**Key finding**: Cycle Rotation alone is only a *shape* -- 100% coverage
in principle, but composing today's existing per-wing candidates (each
already averaging ~30 affected wings and 100+ moves) would only
accumulate side effects, not produce a clean cyclic permutation. Search
cost is not the obstacle (both BP-1 and CCR already explore cheaply, 5.6
and 16.3 leaves on average) -- the missing piece is a **low-side-effect
move unit to compose**, which is exactly what a Commutator Move provides
by design (a setup+narrow-algorithm+setup-inverse construction is
specifically built to leave everything outside its target pieces
unchanged). The two are complementary, not competing: the recommended
design is **"Cycle Rotation via Commutator composition"** -- an adaptive-
length cycle resolved through a sequence of low-footprint commutator
steps.

## 4. Integration Architecture

- **Input/Output**: matches every existing Primitive's contract exactly
  (`Cubie[]`, `WingLibrary`, `deadline` in; `Move[] | null` out).
- **Planner**: no change required -- this integrates at the exact point
  Recovery's `generateRecoveryStrategies()` already calls `genCCR()`, as
  one more candidate generator.
- **Recovery relationship**: shares CCR's integration point but not its
  mechanism -- CCR composes today's existing (high-side-effect) wing
  candidates via bounded DFS; this mechanism would instead generate
  purpose-built low-side-effect moves from the start. Recovery's own
  scheduling/selection logic (`attemptRecovery`, `chooseBestRecovery`) is
  untouched.
- **Primitive Layer**: fits the same single-call contract as
  BASE/FLIP/CASE/PARITY; internally more complex (a composed sequence),
  but externally identical.

## 5. Prototype Specification (specification only)

- **Precondition**: PURE_CYCLE_ISOLATION shape (`componentCount===1`,
  `conflictEdgeCount===0`, `cycleCount>=1`) -- identical to CCR's own
  Gate, matching all 28 measured cases.
- **Postcondition**: net-improving (`wrongWingCount5` strictly decreases,
  same bar as `DeferredValidator`), **plus a new, explicitly measurable
  criterion this Sprint adds**: `affectedWingCount` of the result should
  not be meaningfully larger than the cycle's own length -- directly
  targeting the side-effect problem this whole chain of Sprints
  identified.
- **Evaluation method** for the future Prototype Sprint: (1) Capability
  -- how many of the 28 residual cases does it solve (target: a
  meaningful improvement over CCR's 0); (2) Side-effect -- is average
  `affectedWingCount` meaningfully lower than today's ~30 (target: close
  to cycle length); (3) Regression -- zero regressions against the
  existing 89 Union-Covered cases.

## 6. Final Decision

**Conclusion A -- Prototype 단계로 진행할 준비가 되었다.** Chosen
representation: **Cycle Rotation via Commutator composition**. Both the
expressiveness bar (100% one-shot coverage, well above this research
arc's 60% threshold) and a concrete, buildable low-side-effect mechanism
are satisfied simultaneously.

## 7. File Scope Verification

`git diff --stat` against every protected file this Sprint's Directive
lists confirms **0 diff**. This Sprint added only
`moveRepresentationBlueprint/` (design/specification modules -- no
solving logic, no new search, no Primitive implementation) and this
document.
