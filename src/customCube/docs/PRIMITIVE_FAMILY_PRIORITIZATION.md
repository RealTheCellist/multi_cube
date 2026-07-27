# Primitive Family Prioritization Sprint v1

Status: **Complete. Final Recommendation: A -- PURE_CYCLE_ISOLATION부터
연구.** This Sprint scored the 3 independent residual Failure Classes
Solver Primitive Set Completeness Validation Sprint v1 identified
(PURE_CYCLE_ISOLATION 28, CONFLICT_DEEP_DEPENDENCY 13, BRIDGE_MISSING 12)
against a disclosed, uniform rubric fixed before any score was computed.
No new Primitive or Prototype was designed. Full report:
`primitiveFamilyPrioritization/data/primitive-family-prioritization-v1-report.txt`.

---

## 1. Existing Prior Art -- Tested Directly, Not Assumed

Rather than treat "prior art exists" as a checkbox, this Sprint called
three existing, already-committed, never-production-integrated
prototypes **read-only** against the real residual cases:

| Family | Prior Art (verified by direct code reading) | n | Real Success Rate |
|---|---|---|---|
| PURE_CYCLE_ISOLATION | BoundedResolver / BP-1 (`MIN_CYCLE_LENGTH=4`) | 28 | **0.0%** |
| CONFLICT_DEEP_DEPENDENCY | Conflict-Dominant Sacrifice | 13 | **38.5%** (5/13) |
| BRIDGE_MISSING | Multi-Hop Bridge Prototype | 12 | **0.0%** |

**A disclosed correction**: `MultiHopBridgePrototype.ts`'s own source
comment reveals it does **not** target disconnected multi-component states
at all -- despite its name, it resolves short (length 2-3) single-component
cycles (the band below BP-1's own gate). It has no logic that crosses a
component boundary. State Taxonomy Sprint v2's citation of this file as
"Bridge Missing" prior art was based on the file's name, not its verified
mechanism -- there is, in fact, **no existing prototype in this codebase**
that targets cross-component bridging.

BP-1 (whose gate, `cycleLength>=4`, structurally matches
PURE_CYCLE_ISOLATION's own avg cycle length of 5.00) also scores 0% --
consistent with CCR Completeness Validation Sprint v1's own finding that
this exact shape is a genuine structural dead-end for existing bounded-DFS
mechanisms, not merely a CCR-specific limitation.

## 2. Overlap Matrix (RQ-2)

| | BRIDGE_MISSING | PURE_CYCLE_ISOLATION | CONFLICT_DEEP_DEPENDENCY |
|---|---|---|---|
| BRIDGE_MISSING | 12 | 12 | 0 |
| PURE_CYCLE_ISOLATION | 12 | 40 | 0 |
| CONFLICT_DEEP_DEPENDENCY | 0 | 0 | 13 |

**A significant finding**: all 12 BRIDGE_MISSING cases *also* satisfy
PURE_CYCLE_ISOLATION's own raw condition (a cycle exists, no conflict
edges) -- structural independence for BRIDGE_MISSING is **0%**.
CONFLICT_DEEP_DEPENDENCY is perfectly independent (100%) -- no overlap
with either other family. PURE_CYCLE_ISOLATION is 70% independent (28 of
its 40 condition-satisfying cases belong to no other family). This means
BRIDGE_MISSING may not need a wholly separate mechanism from whatever
eventually resolves PURE_CYCLE_ISOLATION -- every bridge-missing case
already has a resolvable-shaped cycle within it, just split across
components.

## 3. Priority Matrix (5 criteria, disclosed, equal 20% weight each)

Rubric fixed before scoring: Population Size, Structural Independence,
Existing Prior Art (real measured rate), Expected Impact (coverage-gain
share of the full 142), Research Complexity (inverse of avg
dependencyDepth).

| Family | Population | Independence | Prior Art | Impact | Complexity | **Total** |
|---|---|---|---|---|---|---|
| **PURE_CYCLE_ISOLATION** | 1.000 | 0.700 | 0.000 | 1.000 | 0.350 | **0.610** |
| CONFLICT_DEEP_DEPENDENCY | 0.464 | 1.000 | 1.000 | 0.464 | 0.000 | 0.586 |
| BRIDGE_MISSING | 0.429 | 0.000 | 0.000 | 0.429 | 0.437 | 0.259 |

**A close race at the top** (margin of 0.024 between #1 and #2, not a
landslide): PURE_CYCLE_ISOLATION wins on population size and expected
impact (both maxed at 1.0) despite scoring zero on prior art (BP-1
doesn't solve any of its 28 cases) and having the deepest research
complexity penalty of the top two. CONFLICT_DEEP_DEPENDENCY is a strong
second with perfect independence and a real, already-working (38.5%)
prototype, but its smaller population caps its impact score. BRIDGE_MISSING
clearly ranks last, driven by its 0% structural independence and 0% prior
art.

## 4. Research Roadmap

1. **PURE_CYCLE_ISOLATION** (score 0.610)
2. **CONFLICT_DEEP_DEPENDENCY** (score 0.586)
3. **BRIDGE_MISSING** (score 0.259)

## 5. Final Recommendation

**A -- PURE_CYCLE_ISOLATION부터 연구.** Given the close margin with
CONFLICT_DEEP_DEPENDENCY, and that CONFLICT_DEEP_DEPENDENCY already has a
partially-working prototype (38.5% real success) while PURE_CYCLE_ISOLATION
has zero prior art success against BP-1, a future Sprint researching
PURE_CYCLE_ISOLATION should treat "why does BP-1 (and CCR) both fail on
this exact shape" as its own first research question, rather than
assuming a variant of the existing bounded-DFS approach will succeed
where two independent implementations of essentially the same mechanism
family have not.

## 6. File Scope Verification

`git diff --stat` against every protected file this Sprint's Directive
lists, plus `solverPrimitivePrototype/`, `solverV2Prototype/`, and
`solverPrimitiveCCRPrototype/` (read from extensively -- BoundedResolver,
Conflict-Dominant Sacrifice, and Multi-Hop Bridge were all called
read-only, never modified) confirms **0 diff**. This Sprint added only
`primitiveFamilyPrioritization/` (measurement/scoring modules) and this
document. No new Primitive or Prototype was designed or implemented.
