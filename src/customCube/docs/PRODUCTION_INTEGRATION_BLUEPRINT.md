# Production Integration Blueprint Sprint v1

Status: **Complete. Decision: Conclusion A -- Production Integration 설계가
완성되었다. 다음 Sprint에서 코드 통합 가능.** Blueprint Sprint -- no
implementation, no Production Solver/Recovery/Planner/Executor
modification. `fiveByFiveEdgeRecovery.ts`/`Planner.ts`/`Executor.ts` were
read-only this Sprint (imported/called to gather real measurements, never
edited). Full report:
`productionIntegrationBlueprint/data/production-integration-blueprint-v1-report.txt`.

---

## 0. Question

Mixed Commutator Prototype Sprint v1 validated the mechanism as an
INDEPENDENT Primitive. Production Recovery is a candidate POOL
(DISRUPT×2/SETUP/REPAIR/CCR sharing time budgets and competing via
`chooseBestRecovery()`'s max-score rule) -- this Sprint designs how Mixed
Commutator would actually integrate into that pool, using REAL
measurements (calling the actual `generateRecoveryStrategies()`/
`chooseBestRecovery()`, never modifying them).

## 1. Integration Sequence (Required Analysis #1, Recovery Architecture)

Read directly from `fiveByFiveEdgeRecovery.ts`'s real, current
production behavior:

| Step | Candidate | Budget source | Gated by genDeadline? |
|---|---|---|---|
| 1 | DISRUPT (narrow) | shared genDeadline (1/4 slice) | yes |
| 2 | DISRUPT (wide) | shared genDeadline (1/4 slice) | yes |
| 3 | SETUP | shared genDeadline (1/4 slice) | yes |
| 4 | REPAIR | reserved slice off outer deadline (75ms) | no |
| 5 | CCR | remaining outer deadline | no |
| **6 (proposed)** | **MixedCommutator** | **reserved slice off outer deadline** | **no** |

Key structural fact (verified by direct read, not assumed):
`chooseBestRecovery()` picks the MAX-score candidate among whatever got
generated -- generation ORDER only determines how much wall-clock TIME
each step gets (shared-deadline consumption), never which candidate wins
once generated. This directly answers RQ-1: ordering (CCR-then-Mixed vs
Mixed-then-CCR vs parallel) is secondary to budget allocation.

## 2. Score Compatibility Finding (key discovery)

Measured across all 142 cases: of 33 cases where Mixed Commutator found
an improving candidate, **28 (84.8%) had a strongly negative raw
`scoreWholeState` score** (avg -673.7) even though `wrongWingCount`
genuinely improved -- because `DEFAULT_EVALUATOR_WEIGHTS.protectedEdges =
-60` heavily penalizes every previously-paired slot the bracket
commutator's footprint disturbs.

**This directly parallels REPAIR's own documented mechanism**
(`shortCircuitRepair`): "A REPAIR candidate's moves are already validated
as net-improving by W2_widerHop's own Deferred Validation... accepted
immediately, skipping retryTask." Mixed Commutator's own
`validateDeferred` gate provides the IDENTICAL guarantee -- **the
recommendation is to reuse REPAIR's short-circuit pattern (accept
directly, bypass raw `scoreWholeState` competition) rather than compete
via `chooseBestRecovery`'s score as-is.**

## 3. Recovery Interaction Matrix (Required Analysis #3, RQ-4)

| Outcome | Count |
|---|---|
| ONLY_EXISTING | 3 |
| **ONLY_MIXED** | **31** |
| BOTH_NONE | 106 |
| MIXED_WINS | 2 |

- **netNewCount = 31**: cases where the existing Recovery Layer
  (DISRUPT/SETUP/REPAIR/CCR) produces NOTHING today, but Mixed Commutator
  would -- genuine new capability.
- **redundantWinCount = 2**: cases where CCR already has a candidate, but
  Mixed Commutator's raw score would be higher (would need the
  short-circuit design above to actually take effect, given Section 2's
  finding).
- **neverDisplacesCount = 3**: cases where existing wins or is the only
  option -- Mixed Commutator changes nothing here, no conflict.

No destructive interaction was found -- Mixed Commutator either adds
NEW capability (31 cases) or is simply absent/loses (108 cases); it never
appeared to actively worsen a case relative to existing candidates.

## 4. Budget Allocation Sweep (RQ-2, Required Analysis #2)

| Budget | Solved/28 | Low-footprint | avg runtime |
|---|---|---|---|
| 75ms | 2 (7.1%) | 1 | 76ms |
| 150ms | 3 (10.7%) | 1 | 151ms |
| 300ms | 5 (17.9%) | 1 | 301ms |
| 5000ms | 18 (64.3%) | 1 | 4524ms |

Clear dose-response: capability keeps climbing with budget, runtime
tracks the budget almost exactly (deadline-bounded search, as expected).
**Recommendation: a reserved slice of ~300ms** (matching
`RECOVERY_GEN_BUDGET_MS`/REPAIR's own reserved-slice precedent) gives a
reasonable capability/cost tradeoff without requiring a new, larger
budget category.

## 5. Gate Specification (RQ-3)

| Feature | avg (solved) | avg (unsolved) |
|---|---|---|
| cycleLength | 5.33 | 4.96 |
| conflictEdgeCount | **0.00** | 0.00 |
| componentCount | **1.00** | 1.00 |
| hasParity | 0.00 | 0.12 |

**Proposed Gate: `cycleCount===1 AND conflictEdgeCount===0 AND
componentCount===1`** -- all 3 measured solved cases satisfy this
(matching CCR's own `conflictEdgeCount===0` Gate condition), though the
sample (3 cases) is small and this is disclosed as a directional finding,
not a strong statistical conclusion.

## 6. Production Diff Estimate (Required Analysis #4)

| File | Est. LOC | Risk |
|---|---|---|
| `fiveByFiveEdgeRecovery.ts` | 10 | LOW |
| `fiveByFiveEdgeSolverTypes.ts` | 1 | LOW |
| `fiveByFiveEdgePlanner.ts` | 0 | LOW |
| `fiveByFiveEdgeExecutor.ts` | 0 | LOW |

All estimates grounded in CCR's own real integration precedent (read
directly from source) -- a `genMixedCommutator()` mirroring `genCCR()`'s
exact shape, one `RecoveryType` union member, zero Planner/Executor
changes (confirmed by direct read-only inspection: Executor already omits
trailing optional params like `includeCCR`, so a new
`includeMixedCommutator=true` default requires no caller change).

## 7. Implementation Checklist (Deliverable #5)

새 RecoveryType 추가(예) / 후보 생성 함수(`genMixedCommutator()`) / 등록
위치(`order` 배열 마지막) / 평가 순서(순서는 승자를 결정하지 않음, 예산
소비만 결정) / Validation 계약(기존 `validateDeferred` 재사용) /
**Selection 메커니즘(신규 발견 -- short-circuit 필요)** / Regression
체크포인트(89건, 0건 재확인 필요) -- 전체 목록은 리포트 본문 참고.

## 8. Release Readiness Assessment (Deliverable #6)

**Conclusion A -- Production Integration 설계가 완성되었다.**
`netNewCount=31` (실질적 신규 capability), 모든 파일 Diff Risk=LOW, Gate
실측 근거 확보, Regression 0건(Mixed Commutator Prototype Sprint v1의
실측 재사용) -- 5개 산출물 모두 실측 데이터로 뒷받침됨.

## 9. File Scope Verification

`git status --short` confirms only `productionIntegrationBlueprint/`
(new, standalone) and this doc were added. `git diff --stat` against
`fiveByFiveEdgeRecovery.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdges.ts`,
`fiveByFiveEdgeSolverTypes.ts`, `primitivePrototype/CycleChasePrototype.ts`,
`mixedCommutatorPrototype/` confirms **0 diff**. The three read-only
files were called (via `generateRecoveryStrategies`/`chooseBestRecovery`)
to gather real interaction data, never edited.
