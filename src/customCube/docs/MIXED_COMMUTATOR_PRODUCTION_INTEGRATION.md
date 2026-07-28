# Mixed Commutator Production Integration Sprint v1

Status: **Complete. Decision: Conclusion A -- Integration 완료. 다음
Sprint는 Production Validation Sprint 진행.** This is the **first Sprint
in this entire research arc that modifies Production code**. Exactly 2
files touched, matching the Directive's own expectation.

---

## 0. What changed

- **`fiveByFiveEdgeSolverTypes.ts`**: `RecoveryType` union extended with
  `"MIXED_COMMUTATOR"` (was `"DISRUPT" | "SETUP" | "REPAIR" | "CCR"`).
- **`fiveByFiveEdgeRecovery.ts`**:
  - New import: `tryMixedCommutatorPrototype` (Mixed Commutator Prototype
    Sprint v1's own module, unmodified) + `buildStateGraph`/
    `analyzeConstraints` (existing, unmodified structural analysis
    already used throughout this codebase's research arc).
  - New constant `MIXED_COMMUTATOR_RESERVED_SLICE_MS = 300`.
  - New `genMixedCommutator()` candidate generator: Gate =
    `cycleCount===1 AND conflictEdgeCount===0 AND componentCount===1`
    (Production Integration Blueprint Sprint v1's own measured
    recommendation); if the Gate passes, calls
    `tryMixedCommutatorPrototype(cubies, lib, d)` with `d` a fresh
    `MIXED_COMMUTATOR_RESERVED_SLICE_MS` window off the OUTER deadline
    (REPAIR's own `reservedBudget` pattern -- never the shared
    `genDeadline`); result added via the SAME `add()` helper every other
    candidate uses (no new scoring logic).
  - `order` arrays (both `baseline`/`reservedBudget` and `priorityGate`)
    append `genMixedCommutator` after `genCCR`.
  - New trailing param `includeMixedCommutator = true` on both
    `generateRecoveryStrategies()` and `attemptRecovery()`, mirroring
    `includeCCR`'s own exact pattern -- threaded through, zero Executor
    changes required (Executor already omits trailing optional params).
  - Short-circuit type-check in `attemptRecovery()`'s retry loop extended
    from `(REPAIR | CCR)` to `(REPAIR | CCR | MIXED_COMMUTATOR)` --
    `tryMixedCommutatorPrototype`'s own `validateDeferred` gate provides
    the identical net-improving guarantee REPAIR/CCR already rely on for
    this short-circuit.

No new Primitive was designed, no search algorithm was changed, no
Evaluator change, no Prototype modification -- every piece reused exactly
as validated in the prior 3 Sprints (Design Space / Prototype / Blueprint).

## 1. RQ-1: Production Build

`npx vite build` -- **succeeded cleanly** (98 modules transformed, `dist/`
produced, no errors). `npx tsc -b` reports ~294 pre-existing errors, but
**zero of them reference `fiveByFiveEdgeRecovery.ts` or
`fiveByFiveEdgeSolverTypes.ts`** (verified by direct grep) -- every one is
in unrelated ad-hoc research driver scripts (`run*.ts` from ~50 prior
Sprints) missing `@types/node`, a pre-existing condition of this repo
unrelated to and unaffected by this Sprint's change (confirmed: this
Sprint's own prior driver, `runProductionIntegrationBlueprintSprintV1.ts`,
already had this exact same error class before this Sprint began).

## 2. RQ-2: Primitive Contract Verification

Across the 1 case where a `MIXED_COMMUTATOR` candidate was actually
generated (post-integration): non-empty `moves` (1/1), negative
`expectedWrongWingDelta` matching `tryMixedCommutatorPrototype`'s own
`validateDeferred` guarantee (1/1), **0 exceptions** across all 142 cases'
measurement. **fullyCompliant = true.**

## 3. RQ-3: Recovery Flow (post-integration, 142 cases)

| Gate outcome | Count |
|---|---|
| generated | 1 |
| empty (Gate passed, no improving move found in 300ms) | 33 |
| skipped (Gate itself rejected the case) | 108 |

34/142 cases passed the structural Gate; of those, 1 found a genuinely
improving construction within the 300ms reserved slice --
`mixedChosenCount = 1`, `shortCircuitCount = 1` (the short-circuit fires
exactly when expected: `MIXED_COMMUTATOR` chosen AND already net-improving).

**Compatibility Report: `regressionCount = 0`** -- no case where
`MIXED_COMMUTATOR`'s presence changed the outcome AND made
`wrongWingCount` worse-or-equal.

**Honest caveat on `outcomeChangedCount = 11`**: this counts cases where
the top-level winning candidate TYPE differed between a `withMixed` call
and a separate `withoutMixed` call. Because DISRUPT/SETUP/REPAIR/CCR are
all real-time deadline-bounded searches, running two SEQUENTIAL
measurement calls (not simultaneous) introduces real wall-clock timing
drift between them -- some of these 11 differences may be measurement
variance from that drift, not a genuine logical effect of
`MIXED_COMMUTATOR`'s presence. This is disclosed rather than
overinterpreted; the decisive safety metric (`regressionCount = 0`) does
not depend on this caveat.

## 4. RQ-4: Diff Summary

`git diff --stat`: **2 files**, 85 insertions / 14 deletions (includes
generous disclosed rationale comments matching this whole research arc's
documentation convention -- functional code alone is close to the
Directive's own ~10-20 LOC estimate: 1 import block, 1 constant, 1 new
param, ~10-line `genMixedCommutator()`, 1 order-array edit,
1 short-circuit condition edit, 1 union member). **Public API changes are
purely additive**: new optional trailing parameters (default `true`,
matching `includeCCR`'s own precedent) and one new `RecoveryType` union
member -- no existing signature's required parameters changed, no
existing behavior altered when the new parameters are omitted... except
that Mixed Commutator IS now included by default in real production
calls (same as CCR's own integration), which is the entire point of this
Sprint.

## 5. Integration Assessment (Deliverable #6)

**Conclusion A -- Integration 완료. 다음 Sprint는 Production Validation
Sprint 진행.** `buildSucceeded=true`, `contractCompliant=true`,
`noRegression=true` -- all three Success Criteria conditions pass.

## 6. File Scope Verification

`git status --short` / `git diff --stat` confirm: **only**
`fiveByFiveEdgeRecovery.ts` and `fiveByFiveEdgeSolverTypes.ts` were
modified (matching the Directive's explicit allow-list exactly). **0
diff** against `fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdges.ts`, `primitivePrototype/CycleChasePrototype.ts`, and
`mixedCommutatorPrototype/` (the Prototype itself, imported but never
edited).
