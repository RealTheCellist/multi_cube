# CONFLICT_DEEP_DEPENDENCY Structural Mechanism Analysis Sprint v1

Status: **Complete. Decision: Conclusion A -- 단일 지배적 메커니즘 확인
(75.0% >= 60% 기준), 다음 단계 방향 제시 가능.** Read-only Research Sprint
-- `git status --short`/`git diff --stat` confirm 0 diff on every tracked
Production file (Recovery/Planner/Executor/Prototype/Evaluator/
capability-analysis/gateRefinement); only new untracked research modules
under `conflictDeepDependencyMechanismAnalysis/` and this document were
added.

---

## 0. Why this Sprint exists

Primitive Set Completeness Validation Sprint v2 found the current
Production Primitive Set structurally closed (0 UNKNOWN residuals), but
55.2% of the remaining 29 residuals (16 cases) fell into
CONFLICT_DEEP_DEPENDENCY, and the real production Recovery layer produced
0 candidates for any of them under its normal shared budget. This Sprint
asks: is that a single uniform mechanism, or several distinct Subtypes --
and (per the Directive's own explicit framing) is it really a capability
gap, or something else?

## 1. Method

For each of the 16 CONFLICT_DEEP_DEPENDENCY residual cases (identified by
label, matched back to real `Cubie[]` states via `loadRawHoleDataset()`),
this Sprint shadow-instrumented all 5 Recovery primitives -- calling every
underlying function EXACTLY as `generateRecoveryStrategies()` calls it,
read-only, no Production file touched:

- **REPAIR** (`runSuccessV2`/W2_widerHop): Gate = `analyzeMultiCycle`
  non-null AND cycleLength in [2,4].
- **CCR** (`runCCRPrototype`): Gate = `analyzeCcrGate` (`primaryCycleLength`
  in [5,6] AND `conflictEdgeCount===0`).
- **MIXED_COMMUTATOR** (`runMixedCommutatorPrototype`): internal Gate =
  `detectCycle` must find a cycle (its own `cycleLength===null` signal).
- **DISRUPT** (`tryEndgameThroughDisruption`) and **SETUP**
  (`tryEndgameMultiPly`): no structural Gate at all -- classified instead by
  whether candidates exist (`enumerateWingCandidates` proxy) and whether the
  real call ever produces a net-improving result.

Budget: **5000ms per Primitive, independently** (`FAILURE_POINT_BUDGET_MS`),
**N=10 fresh repeats** (this arc's own established convention, since
DISRUPT/SETUP draw from `shuffle()`). This is deliberately decoupled from
production's own tight shared per-slice budget (`slice()` divides one
outer deadline across DISRUPT/SETUP/REPAIR) -- see Section 5 for why this
matters.

## 2. Failure Matrix (Primitive x Failure Reason, Deliverable #1)

| Primitive | GATE_REJECTED | CANDIDATE_GEN_EMPTY | SEARCH_EXHAUSTED | DEADLINE_HIT | SOLVED |
|---|---:|---:|---:|---:|---:|
| DISRUPT | 0 | 0 | 0 | 4 | **12** |
| SETUP | 0 | 0 | 0 | 0 | **16** |
| REPAIR | **16** | 0 | 0 | 0 | 0 |
| CCR | **16** | 0 | 0 | 0 | 0 |
| MIXED_COMMUTATOR | **16** | 0 | 0 | 0 | 0 |

Dominant reason per Primitive: DISRUPT=SOLVED(75.0%), SETUP=SOLVED(100.0%),
REPAIR=GATE_REJECTED(100.0%), CCR=GATE_REJECTED(100.0%),
MIXED_COMMUTATOR=GATE_REJECTED(100.0%).

**"SOLVED" here uses this arc's own established Improved Rate definition
(wrongWingCount net decrease), not full resolution** -- at least 1 of the
10 fresh repeats produced a net-improving result. Per-repeat reliability
varies: SETUP's `solvedCount` ranges 2-9 of 10 repeats (genuinely frequent),
DISRUPT's ranges 0-6 of 10 (much less frequent, but still >=1/10 on 12 of
the 16 cases). DISRUPT's own avg elapsed time is consistently ~5000ms (runs
to the full budget win-or-lose, since its shuffle-driven search explores
until time runs out); SETUP is usually faster (2500-4800ms).

## 3. Conflict Structure Report (RQ-4)

All 16 cases measured for: `conflictEdgeCount`, `dependencyDepth`,
`dependencyBranching` (max CONFLICT-only out-degree), `dependencyComponentCount`
(weakly-connected components over CONFLICT-only edges),
`bridgeCount` (cut edges in the CONFLICT-only subgraph), `sharedConflictCount`
(nodes with combined CONFLICT degree >1), `protectedEdgeCount` (co-existing
SWAP/CYCLE edges).

Range across the 16: `conflictEdgeCount`/`dependencyDepth` 7-9,
`wrongWingCount` 7-11. **Every single case measures
`dependencyBranching=1`, `dependencyComponentCount=1`, `bridgeCount=0`,
`protectedEdgeCount=0`** -- a completely uniform structural shape.

## 4. Subtype Classification Report (RQ-1/RQ-5, Deliverable #3)

Disclosed rule (MULTI_COMPONENT_DEPENDENCY if dependencyComponentCount>1,
else BRANCHING_DEPENDENCY if dependencyBranching>1, else LINEAR_CHAIN):

| Subtype | n | avgDependencyDepth | avgConflictEdgeCount | avgWrongWingCount |
|---|---:|---:|---:|---:|
| **LINEAR_CHAIN** | **16/16** | 7.38 | 7.38 | 7.81 |
| BRANCHING_DEPENDENCY | 0 | -- | -- | -- |
| MULTI_COMPONENT_DEPENDENCY | 0 | -- | -- | -- |

**No Subtype split exists -- all 16 cases are the exact same shape**: a
single, simple, unbranched CONFLICT-only dependency chain (a one-directional
"A wants B wants C wants ... " sequence with no cycle, no branch point, no
disconnected second chain, and no co-existing SWAP/CYCLE structure to
protect).

## 5. Mechanism Summary (RQ-1, Deliverable #4)

`totalCases=16, isSingleDominantMechanism=true`.

| Signature (DISRUPT\|SETUP\|REPAIR\|CCR\|MIXED_COMMUTATOR) | n | share |
|---|---:|---:|
| SOLVED \| SOLVED \| GATE_REJECTED \| GATE_REJECTED \| GATE_REJECTED | 12 | **75.0%** |
| DEADLINE_HIT \| SOLVED \| GATE_REJECTED \| GATE_REJECTED \| GATE_REJECTED | 4 | 25.0% |

Both signatures agree on 4 of 5 Primitives (SETUP=SOLVED,
REPAIR/CCR/MIXED_COMMUTATOR=GATE_REJECTED) -- they differ only in whether
DISRUPT's own stochastic search happened to succeed within N=10 repeats.
Structurally this is **one single mechanism, not two**: DISRUPT's variance
is a matter of degree (a coin that lands SOLVED 75% of the time at the
case level), not a different underlying cause.

**The real mechanism, in plain terms:**

1. **REPAIR/CCR/MIXED_COMMUTATOR fail 100% of the time for a structural
   reason that is NOT about search capability at all**: all three Gate on
   the presence of a CYCLE (`analyzeMultiCycle`/`analyzeCcrGate`/
   `detectCycle`), and every one of these 16 states has `cycleCount=0` by
   the taxonomy's own construction (CONFLICT_DEEP_DEPENDENCY = a one-sided
   DAG chain, not a cycle) -- so these 3 Primitives are Gate-rejected before
   any search ever runs, a decision that is completely correct and
   unrelated to whether the underlying search COULD make progress.
2. **DISRUPT and SETUP -- the only 2 Primitives without a structural Gate
   -- actually SUCCEED on this population** (SETUP 100% of cases, DISRUPT
   75%) when given a generous, independent 5000ms budget. This directly
   contradicts a "no Primitive can touch this population" framing: **the
   raw capability to make progress already exists** in the current
   Primitive Set.
3. Primitive Set Completeness Validation Sprint v2's own finding of
   `solvedByRecoveryCount=0/29` for this whole residual population was
   measured through the REAL production Recovery layer, whose
   `generateRecoveryStrategies()` divides ONE shared outer deadline across
   DISRUPT/SETUP/REPAIR (`slice() = (genDeadline-Date.now())/4`) -- a much
   smaller budget than this Sprint's independent 5000ms per Primitive.
   **This Sprint's own measurement strongly suggests that result was a
   budget/scheduling artifact of production's shared-slice scheduling, not
   a genuine capability ceiling for DISRUPT/SETUP.**

## 6. Recommendation (Deliverable #5)

**Conclusion A -- 단일 지배적 메커니즘 확인 (dominantGroup.share=75.0%
>= 60% 기준), 다음 단계 방향 제시 가능.**

The auto-generated Recommendation module's canned rationale text describes
DISRUPT/SETUP as failing from "탐색 능력 부족" (insufficient search
capability) -- **this Sprint's own measured Failure Matrix shows the
opposite**: DISRUPT/SETUP mostly succeed given adequate budget. The
corrected, data-supported next-step direction is therefore NOT "design a
new Primitive that directly traverses a CONFLICT-only DAG" (the generic
Blueprint direction a naive read of the Gate-rejection pattern alone would
suggest) but:

**A Budget/Scheduling-focused follow-up Sprint measuring whether SETUP
(and, more variably, DISRUPT) can be given a larger or reserved-slice
budget specifically for this population, the same way REPAIR/CCR/Mixed
Commutator's own reserved-slice scheduling was validated and integrated in
prior Sprints of this research arc.** No new Primitive research is
motivated by this Sprint's own data -- the capability already exists in
SETUP/DISRUPT; what appears to be missing is budget allocation.

---

## 핵심 발견 요약

1. **CONFLICT_DEEP_DEPENDENCY is a single uniform mechanism, not multiple
   Subtypes** -- all 16 cases are the exact same structural shape (a
   simple, unbranched, single-component CONFLICT-only dependency chain,
   dependencyBranching=1, dependencyComponentCount=1, bridgeCount=0,
   protectedEdgeCount=0 for every case).
2. **REPAIR/CCR/MIXED_COMMUTATOR fail 100% of the time purely because their
   own Gate requires a cycle**, which this population structurally never
   has -- a correct Gate decision, not a search failure.
3. **DISRUPT and SETUP -- the two Primitives without a structural Gate --
   already succeed on most or all of this population given a generous,
   independent budget** (SETUP 100%, DISRUPT 75%), directly contradicting
   the premise that no existing Primitive can make progress here.
4. **The likely real bottleneck is production's shared-slice budget
   scheduling, not missing capability** -- this reframes the natural next
   Sprint from "design a new Primitive" to "measure and potentially widen
   DISRUPT/SETUP's budget allocation for this specific population."

## 결론

이 Sprint는 CONFLICT_DEEP_DEPENDENCY가 **단일하고 일관된 구조적 메커니즘**
(모든 사례가 동일한 단순 선형 dependency chain 형태)임을 확인했습니다.
REPAIR/CCR/Mixed Commutator는 구조적으로 cycle을 요구하는 자신의 Gate 때문에
100% 실패하며, 이는 실측으로 확인된 정상적인 Gate 판단입니다. 반면 Gate가
없는 DISRUPT와 SETUP은 충분한 독립 예산이 주어지면 대부분(SETUP 100%,
DISRUPT 75%) 실제로 개선에 성공합니다. 따라서 다음 연구는 새로운 Primitive
설계보다, 기존 Primitive Set Completeness Validation Sprint v2가 측정한
"Recovery 성공률 0%"이 예산/스케줄링 문제였는지를 검증하는 Budget 중심
Sprint가 더 근거 있는 다음 단계입니다.

---

- 코드 변경: 없음 (Research Sprint) -- `git diff --stat` 확인, 0 diff
- 문서: `src/customCube/docs/CONFLICT_DEEP_DEPENDENCY_MECHANISM_ANALYSIS.md`
- 데이터: `conflictDeepDependencyMechanismAnalysis/data/conflict-deep-dependency-mechanism-analysis-v1-report.txt` / `-result.json`
- 브랜치: `claude/cube-game-dev-afnm5z`
