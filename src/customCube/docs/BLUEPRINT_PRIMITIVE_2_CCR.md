# Primitive #2 — CCR (Clean-Cycle Resolution) Blueprint

Status: Blueprint stage, per `docs/PRIMITIVE_RESEARCH_PROCESS.md`'s own
6-stage process. **No new Primitive is implemented in this document or
this Sprint** — `solverPrimitiveDiscovery2/` is analysis-only.

**Source Sprint**: Primitive Discovery Sprint #3, 2026-07-21. Continues
`BLUEPRINT_PRIMITIVE_2_CANDIDATE.md` (Primitive Discovery Sprint #2 +
Gate Relaxation Validation Sprint v1 + Integration Sprint v2), which
narrowed CCR's scope to `cycleLength 5-6, conflictEdgeCount=0` after
REPAIR's own Gate relaxation absorbed the `cycleLength 2-4` sub-problem.
This document is the successor Blueprint for that narrowed scope,
produced by actually re-verifying the population and probing the search
mechanism empirically (STEP1-4 below), not just restating the prior
Sprint's numbers.

Full driver report: `solverPrimitiveDiscovery2/data/discovery2-report.txt`
(575.9s real run, 335 real `solve()` replays + profiling + dual-budget
search probes — every number below is read from that file, not
reconstructed).

---

## 1. 목적 (Why this is needed)

Under the CURRENT production solver (REPAIR's Gate relaxed to
`cycleLength 2-4` regardless of `conflictEdgeCount`, shipped in
Integration Sprint v2), STEP1 re-verified all 335 snapshots fresh:

- **0/335** are now stale (a single real `solve()` call resolves none of
  them — the dataset is still a genuine, current residual population).
- **118/335** now fall inside REPAIR's own (relaxed) Gate.
- **217/335** remain a genuine, unaddressed gap: **189** with
  `cycleLength 5-6`, and **28** with no detectable cycle at all.
- Of the 189, **173** have `conflictEdgeCount=0` — this is CCR's own
  target population, confirmed fresh (matches the prior Sprint's own 173
  figure exactly, since REPAIR's Gate change never touched `cycleLength
  5-6`).

No existing Primitive (BASE/FLIP/CASE/PARITY/RECOVERY, including REPAIR's
own relaxed Gate) reaches this population by construction — REPAIR's own
Gate caps at `cycleLength 4`.

## 2. 담당 영역 (Precondition / Gate)

**Precondition**: `conflictEdgeCount(cubies) === 0 AND cycleLength(cubies)
in [5, 6]` (via the same `analyzeMultiCycle`/`countConflictEdges` reused
unmodified throughout this whole research arc). This is a strict
narrowing of the original `BLUEPRINT_PRIMITIVE_2_CANDIDATE.md` contract
(which spanned 2-6) down to exactly the sub-range REPAIR's own Gate
relaxation didn't absorb.

**Target population size (STEP1, re-verified)**: 173/335 (51.6% of all
current failures) — the single largest unaddressed structural bucket.

## 3. 입력 (Representation) — STEP2 Target Profiling

Profiled the 173-snapshot target population with features one level
richer than the prior Sprint's `StructuralFeatures` (all derived from
existing, unmodified `buildStateGraph`/`analyzeEdgeSlots`/
`detectEdgeSlotPattern`/`wrongWingCount5`):

| Feature | Value |
|---|---|
| 평균 wrongWingCount | 12.24 (REPAIR's own cycleLength 2-4 population is considerably sparser — this population is a genuinely harder/denser residual state) |
| parity 있는 비율 | 87.3% |
| 평균 cycle 개수 | 4.10 |
| 다중 cycle(cycleCount>1) 비율 | **91.9%** — the overwhelming majority are NOT a single clean cycle, but several disjoint cycles coexisting |
| 평균 wrongWing 밀도 (wrongWingCount / (주cycle길이×2)) | 1.10 — close to 1, meaning the primary cycle's own wings account for roughly all wrong wings on average, but with real variance given the 91.9% multi-cycle share |
| Edge Orbit 분포 (주 cycle 노드 기준) | `{xz: 321, yz: 306, xy: 334}` — roughly uniform across the 3 standard edge orbits, no structural skew toward a particular axis pair |
| Wing Pairing 상태 분포 (주 cycle 노드 기준) | `{unpaired: 361, half-paired: 600}` — the majority of a primary cycle's own slots are half-paired, not fully unpaired; **zero** `flipped-pair` observed in this population |

**Key implication for design**: the "clean cycle" framing from the
original Blueprint (`docs/BLUEPRINT_PRIMITIVE_2_CANDIDATE.md`) undersold
the structure — 91.9% of this population has MULTIPLE disjoint cycles
coexisting, not one isolated N-cycle. Any CCR design that assumes and
resolves only the single longest cycle (as REPAIR's own `analyzeMultiCycle`
+ `pickLongestCycle` does) will, by construction, ignore the other
disjoint cycles in the same state — those may or may not get picked up by
a later Recovery attempt in the same `solve()` call.

## 4. Structural Pattern Mining (STEP3) — Top 10 cycle shapes

Clustering by the FULL cycle-shape signature (all disjoint cycle lengths
in the WANTS graph, not just the longest):

| Shape | Count | Share |
|---|---|---|
| 5+3 | 11 | 6.4% |
| 5+3+2 | 8 | 4.6% |
| 6 (single clean 6-cycle) | 8 | 4.6% |
| 5+2 | 7 | 4.0% |
| 6+2 | 7 | 4.0% |
| 5 (single clean 5-cycle) | 6 | 3.5% |
| 6+4+2 | 5 | 2.9% |
| 6+3 | 5 | 2.9% |
| 5+3+2+2 | 3 | 1.7% |
| 6+5+4+3+2 | 3 | 1.7% |

No single shape dominates (top shape is only 6.4%) — the population is
structurally fragmented across many disjoint multi-cycle combinations,
consistent with the 91.9% multi-cycle share above. This rules out a
narrow "hardcode the top pattern" approach; a genuinely general N-cycle
resolver is needed, or CCR must accept it will only close the
single-primary-cycle share of this population per attempt.

## 5. Existing Primitive Reuse Analysis (STEP4) — the central finding

Before designing new search logic, this Sprint tested whether REPAIR's
own existing bounded-DFS search core (`enumerateWingCandidates`/
`applySeq`/`wrongWingCount5`/`pairCountOf`/`validateDeferred`, all
EXISTING exports, unmodified) already generalizes if only its
`cycleLength` band is widened from 2-4 to 2-6 — the identical question
Gate Relaxation Validation Sprint v1 already asked (and answered "yes")
about the `conflictEdgeCount` axis.

**First pass (REPAIR's real 75ms `reservedBudget` window, W2_widerHop's
own options)**: match rate **11.0%** (19/173), average leavesExplored
only 1.1, nodesVisited only 2.2, yet **Deadline hit 91.9%** of the time
while **Leaf Cap hit 0.0%**.

This combination (almost no DFS branching happening, yet almost always
timing out) contradicted the initial hypothesis — that the theoretical
`3^5`/`3^6` branching (243/729) blowing past the 64-leaf cap was the
bottleneck. **Self-correction, verified two ways before finalizing**:

1. **Direct latency measurement**: a single, isolated first-hop
   `enumerateWingCandidates()` call (generous 500ms sub-budget so the
   measurement itself is never truncated) costs, on this population,
   avg **186.2ms**, p50 **73ms**, p95 **611ms**, max 1219ms. The median
   ALONE is already at REPAIR's own 75ms budget — the tail is far
   beyond it. **This is denser/harder-search cost inherent to this
   population (avg wrongWingCount 12.2), not DFS branching.**
2. **Re-running the identical probe with the real whole-plan budget**
   (`PLAN_TIME_BUDGET_MS=1000ms` instead of REPAIR's own 75ms
   `reservedBudget` slice): match rate recovers to **52.6%** (91/173,
   +72 over the 75ms pass), leavesExplored/nodesVisited rise to
   13.9/27.5 (real exploration now happening), Leaf Cap still 0.0%,
   Deadline still hit 80.9% of the time (more budget helps a lot, but
   doesn't fully close the gap — the true ceiling is unknown from this
   probe alone).

**Conclusion**: the bounded-DFS + Deferred Validation mechanism itself
**is** reusable and does generalize to `cycleLength 5-6` — the numbers
above prove the algorithm works given enough time. The actual
constraint is **budget, not mechanism**: REPAIR's own 75ms
`reservedBudget` slice was sized for REPAIR's own (sparser) population
and starves candidate generation almost immediately on this denser one.
This is the same category of bug this research arc already found once
before (Integration Refinement Sprint v1's "Recovery candidate-generation
budget starvation"), recurring at a different point in the pipeline (a
single hop's own cost, not turn-scheduling among Recovery candidates).

## 6. Search 방식 (recommended, for CCR Prototype Sprint v1)

- **Reuse, don't reinvent**: the same bounded DFS body (candidates per
  hop, Deferred Validation, `MAX_LEAVES_EXPLORED` cap) demonstrably
  works on this population given adequate time — Prototype Sprint v1
  should start from an independent reimplementation of this exact shape
  (matching this whole arc's own established "one axis changed, disclosed"
  pattern), not a from-scratch algorithm.
- **CCR needs its own budget/scheduling contract, distinct from
  REPAIR's**. Simply widening REPAIR's own Gate in-place (as this
  Sprint's probe did, for measurement purposes only — never wired into
  production) and leaving the 75ms `reservedBudget` unchanged would ship
  a Primitive that fires but rarely succeeds (11.0%). The actual
  achievable rate (52.6%+) requires either a materially larger dedicated
  time slice, a cheaper candidate-generation approach for this
  population, or both — this sizing/tradeoff decision belongs to CCR
  Prototype Sprint v1 and its own Integration stage, mirroring how
  REPAIR's own `reservedBudget` question was resolved in a dedicated
  Integration Refinement Sprint rather than the original Prototype.
- **Multi-cycle handling is an open design question**: `analyzeMultiCycle`
  + `pickLongestCycle` only resolves ONE cycle per attempt. Given 91.9%
  of this population has multiple disjoint cycles, CCR Prototype Sprint
  v1 should explicitly decide whether to (a) resolve only the primary
  (longest) cycle per attempt and rely on repeated Recovery attempts /
  short-circuit retries to eventually clear the rest, or (b) extend the
  search to address multiple disjoint cycles within one bounded search —
  a materially larger scope than REPAIR's own single-cycle contract.

## 7. REPAIR와의 관계 (non-overlap)

CCR's Gate (`conflictEdgeCount=0`) and REPAIR's Gate (`cycleLength 2-4`,
any `conflictEdgeCount`) do not overlap on the `cycleLength` axis — CCR
only fires at `cycleLength 5-6`, strictly above REPAIR's own range. No
double-counting or Gate collision is possible by construction.

## 8. 예상 Risk

- **Runtime**: the core open risk. Even at the full 1000ms whole-plan
  budget, 80.9% of attempts still hit the deadline — CCR's real
  achievable coverage/runtime tradeoff is unmeasured beyond this probe
  and needs dedicated tuning in Prototype Sprint v1.
- **Regression**: none expected from the Gate itself (no overlap with
  REPAIR, see §7) — but a new Recovery candidate competing for the same
  shared `genDeadline`/scheduling budget as DISRUPT/SETUP/REPAIR
  reintroduces exactly the budget-starvation risk Integration Refinement
  Sprint v1 already solved once for REPAIR; CCR's own Integration stage
  must address this explicitly, not assume it inherits REPAIR's fix for
  free.
- **Budget**: directly measured above — this is the dominant, already-
  quantified risk, not a hypothetical one.
- **Coarsening**: not applicable here in the same form as Gate Relaxation
  Validation Sprint v1's own finding (CCR's Gate doesn't widen an
  existing Gate — it targets a disjoint population), but a future
  temptation to widen CCR's own Gate later should apply the same
  per-population precision-splitting discipline established there.

## 9. Feasibility Check (STEP6) — Decision

**Level 1 (CCR 대상 구조를 명확히 정의)**: PASS — 173건, re-verified fresh,
Top shape 5+3 only 6.4% (fragmented, no dominant pattern).

**Level 2 (기존 Primitive 재사용 가능성 판단)**: PASS — the search
algorithm itself (bounded DFS + Deferred Validation) is reusable and
demonstrably works (52.6% match at adequate budget); REPAIR's own
scheduling contract (75ms `reservedBudget`) is NOT directly reusable
as-is (11.0% match) and must be redesigned for CCR specifically.

**Level 3 (Prototype 구현 가능한 Blueprint 완성)**: PASS — this document.

**최종 결정: A** — proceed to **CCR Prototype Sprint v1**, built on the
existing bounded-DFS search core with its own, newly-designed budget/
scheduling contract (not REPAIR's 75ms `reservedBudget` inherited
as-is), and an explicit decision on single-vs-multi-cycle handling scope.
