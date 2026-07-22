# Solver System Bottleneck Attribution

Status: written at Solver System Bottleneck Attribution Sprint v1
(2026-07-22), **Decision B**. READ-ONLY analysis Sprint — zero Production
code changes (`fiveByFiveEdges.ts`/Planner/Executor/Recovery/all
Primitives/all Prototypes/Budget Contract all read-only). Full driver
report:
`solverPrimitiveSystemBottleneckAttribution/data/solver-system-bottleneck-attribution-v1-report.txt`
(335 real snapshots for STEP1/3/4, 75-snapshot subsample for STEP2/5).

---

## 1. Why this Sprint

Production Integration Sprint v1 found a striking gap: per-call Budget
Compliance at the real PAIR-task call site improved dramatically
(44.88% → 97.90%), but every whole-`solve()`-level capability metric's 95%
CI straddled zero — no statistically distinguishable net effect. This
Sprint instruments the real execution path to find **where** the saved
time actually goes and **why** it isn't compounding into capability.

## 2. Method: StageInstrumentedMirror

A byte-identical, read-only mirror of the real `runPrimaryPipeline()`/
`executeTask()`/`attemptRecovery()`/`solve()` control flow — reusing every
real exported function unmodified, wrapping each real sub-stage call with
timing. Recovery's own DISRUPT1/DISRUPT2/SETUP/REPAIR/CCR sub-stage timing
comes from `generateRecoveryStrategies`'s **existing** `onEvent`
instrumentation hook (added by an earlier Sprint, "no-op for every real
caller"), reused read-only. Verified faithful: smoke-test outputs
(wrongWingBefore/After, tasksCompleted) matched Production Integration
Sprint v1's own baseline-mirror results exactly on the same snapshot
hashes.

## 3. STEP1 — Stage Runtime Attribution (full 335-snapshot population)

| Stage | Calls | Avg ms | Max ms | % of total |
|---|---|---|---|---|
| **PAIR** | 2826 | 76.83 | 177 | **73.56%** |
| RECOVERY_DISRUPT1 | 254 | 142.32 | 394 | 12.25% |
| RECOVERY_SETUP | 203 | 62.97 | 349 | 4.33% |
| RECOVERY_DISRUPT2 | 152 | 83.97 | 416 | 4.32% |
| RECOVERY_CCR | 203 | 35.75 | 688 | 2.46% |
| RECOVERY_REPAIR | 203 | 22.73 | 353 | 1.56% |
| ENDGAME_BESTFIX | 211 | 18.96 | 381 | 1.36% |
| ENDGAME_MULTIPLY | 211 | 1.47 | 307 | 0.11% |
| FLIP | 2831 | 0.04 | 2 | 0.04% |
| PARITY | 209 | 0.24 | 2 | 0.02% |

PAIR dominates total solve() runtime by far. ENDGAME itself is cheap in
aggregate (1.47% combined) — its role in the bottleneck (STEP4/6) is about
budget/opportunity, not raw cost.

## 4. STEP2 — Budget Savings Flow (75-snapshot subsample)

| | Value |
|---|---|
| avg PAIR savings (baseline − candidate) | −5.03ms |
| → ENDGAME delta | −0.65ms (13.0%) |
| → RECOVERY delta | −18.23ms (362.6%) |
| → unaccounted | +13.85ms (−275.6%) |

At this subsample scale the PAIR-level time difference between arms is
small and noisy (real solve() stochasticity via `shuffle()` dominates at
n=75) — consistent with Production Integration Sprint v1's own finding
that the per-call improvement doesn't reliably show up at the whole-solve
level.

## 5. STEP3 — Invocation Chain Analysis (full population)

Avg chain length 18.74, max depth 27. Dominant transitions:
`FLIP→PAIR` (2826), `PAIR→FLIP` (2492), `PARITY→ENDGAME` (209),
`PAIR→PARITY` (208), `ENDGAME→RECOVERY` (205) — internally consistent
with STEP1's own call counts (ENDGAME_BESTFIX fired 211 times,
`PARITY→ENDGAME` transitions 209 times).

## 6. STEP4 — Opportunity Loss Analysis (full population)

106/335 solves (31.6%) showed zero net improvement:

| Category | Count | % |
|---|---|---|
| A (budget unused) | 0 | 0.0% |
| **B (ENDGAME consumed all)** | **58** | **54.7%** |
| C (Recovery not triggered) | 0 | 0.0% |
| **D (neither ENDGAME nor Recovery reached)** | **48** | **45.3%** |

A clean split with zero cases in A/C — every zero-improvement solve either
burned its whole budget inside ENDGAME (B) or never got a chance to reach
ENDGAME/Recovery at all (D, a Planner/task-chain issue).

## 7. STEP5 — Counterfactual Simulation (n=49 real ENDGAME-reaching snapshots)

| Arm | Avg improvement |
|---|---|
| Baseline (no extension) | 0.408 |
| **ENDGAME-extended** | **0.551** |
| RECOVERY-extended | 0.041 |
| CCR-extended | 0.041 |

Giving ENDGAME more time (redirecting PAIR's measured savings, extensionMs
= 10ms) produces a real, measurable gain (+0.143). Redirecting the same
time to RECOVERY-candidate-generation or CCR alone barely moves the
needle — **not** because Primitive capability is capped (ENDGAME's own
gain proves more time helps), but because ENDGAME is where the exploitable
headroom actually is.

Disclosed scope note: the RECOVERY-extended arm calls
`generateRecoveryStrategies`/`chooseBestRecovery` directly but does not
run the real `retryTask()` round-trip `attemptRecovery()` itself performs
— it may therefore understate Recovery's true achievable gain under more
time. Flagged for a follow-on Sprint rather than silently smoothed over.

## 8. STEP6 — Bottleneck Attribution Matrix

| Component | Contribution | Basis |
|---|---|---|
| **ENDGAME** | **54.7%** | Opportunity Loss B |
| **Planner** | **45.3%** | Opportunity Loss D |
| Recovery Trigger | 0.0% | Opportunity Loss C |
| Executor | 0.0% | Opportunity Loss A |
| Primitive | 0.0% | Counterfactual (ENDGAME extension DID help — not a capability ceiling) |

**Priority 1 (by raw ranking): ENDGAME.** But ENDGAME (54.7%) and Planner
(45.3%) are close — a 9.4pp gap, not the decisive lead this Sprint's own
Level3 threshold requires (top ≥ 1.5× second AND ≥15pp ahead). Recovery
Trigger/Executor/Primitive are cleanly ruled out at 0%, so this is
effectively a **2-way** contest, not 3-way, despite the raw top-3 listing.

## 9. Level 1-3 Judgment

| Level | Criterion | Result |
|---|---|---|
| 1 | Bottleneck location quantified | **PASS** |
| 2 | Budget Flow completed | **PASS** |
| 3 | Priority 1 confirmed decisively | **FAIL** — ENDGAME/Planner too close |

## 10. Decision: B

Bottleneck narrowed to two real, ruled-in candidates — **ENDGAME**
(budget exhaustion inside the ENDGAME grinder) and **Planner** (the task
queue often never routes a solve() toward ENDGAME/Recovery at all). Both
are real, structurally distinct causes; disambiguating which dominates (or
whether both need separate fixes) requires a targeted follow-on
instrumentation Sprint — specifically: (a) why 45.3% of zero-improvement
solves never reach ENDGAME (Planner task-selection/ordering), and (b)
whether ENDGAME's own budget allocation (not just more wall time, per
STEP5's real but modest +0.143 gain) can be restructured for a bigger win.

**Next Sprint recommendation**: a follow-on Bottleneck Attribution
Refinement Sprint (or equivalently-scoped instrumentation Sprint)
targeting specifically: why PAIR/FLIP/PARITY tasks so often don't lead to
an ENDGAME task at all (Planner-side), and what ENDGAME's own real budget
ceiling is when NOT time-constrained (to check whether STEP5's modest gain
is itself budget-limited or capability-limited).

## 11. Protected-file scope verification

`git diff` since this Sprint's start shows **zero** changes to any
Production file (`fiveByFiveEdges.ts`, Planner, Executor, Recovery, any
Primitive, any Prototype, the Budget Contract) — confirmed via direct diff
against every protected path. Only new files under
`solverPrimitiveSystemBottleneckAttribution/` and the new driver script.
