# Incremental Recovery — Architecture Blueprint Revision

Status: written at Incremental Recovery Architecture Blueprint Revision
Sprint v1 (2026-07-22), **Decision A**. Analysis and design only — no new
Prototype implementation, no Production/Planner/Executor/Recovery/
`enumerateWingCandidates`/existing Primitive/existing Prototype changes.
Every measurement cited below is a real, already-committed number from
Prototype Sprint v1 and Prototype Refinement Sprint v1's own report files;
this Sprint's only new empirical work was direct, read-only inspection of
`fiveByFiveEdges.ts`'s actual source to ground the Production analysis.
Full driver report:
`solverPrimitiveIncrementalRecoveryArchitectureRevision/data/incremental-recovery-architecture-revision-v1-report.txt`.

---

## 1. Bottleneck Attribution (STEP1)

Every real bottleneck the last two Sprints measured, assigned to the layer
that must change to actually fix it:

| Bottleneck | Layer | Real evidence |
|---|---|---|
| Primitive's own coarse per-hop deadline check (checks between hops, never inside one `enumerateWingCandidates()` call) | **Primitive** | `CCRPrototype.ts`/`SuccessOptimizationV2.ts` source, read directly |
| `enumerateWingCandidates`/`bfsMoveWingToPosition` have **no time check at all** (only an 8000-node bound) | **Production** | Refinement Sprint v1 STEP2: max single-hop 1003ms; Blueprint Sprint v1 STEP3: avg 140.7ms vs 31.3ms target |
| Wrapper Budget policies cap out at 31.9% overrun reduction | **Wrapper** | Refinement Sprint v1 STEP1: 80.0%→54.5% |
| Visited Registry's binary skip causes 6 real regressions | **Wrapper** | Refinement Sprint v1 STEP4: 129→0 duplicates, 6 regressions |
| Whole-cube-solved floor effect (0/75, all 30 runs) | **Wrapper** (evaluation framework, not the solver) | Prototype Sprint v1 STEP4/7: CI exactly [0.00, 0.00] |

## 2. Budget Architecture Review (STEP2)

All 5 named models map onto policies already measured across both prior
Sprints — no new benchmarking needed:

| Model | Ceiling | Real avg | Success | Production change? |
|---|---|---|---|---|
| Reserved Slice | 40ms | 140.7ms | 2.8% | No |
| Remaining Time | unbounded | 335.8ms | **15.7%** | No |
| Adaptive Budget | 35.3ms | 155.7ms | 2.3% | No |
| Average Budget | 140ms | 196.6ms | 5.5% | No |
| Deadline-aware Traversal | 32.1ms | 96.6ms | 4.0% | No |

**Conclusion**: no Wrapper-only model achieves both a safe bounded cost
and a success rate near Remaining Time's 15.7% ceiling — every safe policy
tops out around 4–5.5%. Full resolution requires a Production change.

## 3. Registry Policy Blueprint (STEP3)

Candidates to replace the binary `Visited → Skip` rule (all estimates,
disclosed as projections against the real 129-duplicate/6-regression
baseline, not new measurements):

| Policy | Est. Duplicate reduction | Est. Regression risk | Difficulty |
|---|---|---|---|
| Retry Budget | 40–60% (of wasted time) | Lower than binary | medium |
| **Max Attempt = N** | 60–80% (N=2) | ~0 at N=2 | **low** |
| Confidence Score | 50–70%, threshold-dependent | Could be lowest or highest | high |
| Aging Registry | 30–50% | Converges to binary's risk | medium |

**Recommended: `maxAttemptN`** — lowest implementation risk, most directly
falsifiable against the real baseline in a future Prototype Sprint.

## 4. Evaluation Blueprint Revision (STEP4)

Standard 5-metric framework for every future Incremental Recovery Sprint:

- **Primary**: whole-cube-improved count (paired-diff, N≥30) — the metric
  that actually detected a real effect (Refinement Sprint v1: CI [2.51, 3.95]).
- **Secondary**: whole-cube-solved count (binary) — demoted, not dropped.
- **Regression**: candidate-strictly-worse count — must be reported beside
  every Primary result, never in isolation (this is exactly what caught
  the Visited Registry's 6 regressions).
- **Capability**: task-level Coverage/Precision/Recall — diagnostic, explains
  *why* a Primary result looks the way it does.
- **Integration**: Runtime delta **and** Deadline Miss rate delta together
  — Prototype Sprint v1's own smoke test showed a −3.7ms runtime delta
  (looks fine) beside an 80.0%→100.0% Deadline Miss jump (real problem) in
  the same run.

## 5. Architecture Impact Analysis (STEP5)

Grounded in direct inspection of `fiveByFiveEdges.ts`'s real source:

| Priority | Candidate | Risk | Impact scope |
|---|---|---|---|
| **1** | `bfsMoveWingToPosition` Traversal Interruptibility (add a periodic deadline check to the 8000-node BFS) | medium | 1 function, 6 internal call sites incl. `tryFixWing` (real production PAIR-task path) and `enumerateWingCandidates` (22 project-wide callers) |
| 2 | `enumerateWingCandidates`/`tryFixWing` Deadline Granularity (check between candidates, not just entries) | low | 2 functions, no signature change |
| 3 | Search Yield Point (resumable state machine) | high | Rewrites 4+ functions across Production and every Primitive — no real data shows a need for true async yielding |
| 4 | Budget Callback (`shouldAbort()` pattern) | medium | Signature refactor across the whole call graph; no effect without pairing with #1 |

## 6. Decision Matrix & Wrapper/Production Split (STEP6)

**Wrapper-only fixable** (no Production risk):
- Registry policy replacement (`maxAttemptN`)
- Evaluation framework revision (5-metric standard)
- Budget policy selection among the 5 already-measured models

**Production change required**:
- Full resolution of Budget Overrun (54.5% best-case overrun even with the
  best Wrapper policy) needs `bfsMoveWingToPosition`'s own deadline check
  (priority 1) and/or the `enumerateWingCandidates`/`tryFixWing` inner-loop
  granularity fix (priority 2).

## 7. Success Criteria

| Level | Result |
|---|---|
| 1 (bottlenecks classified by layer) | **PASS** |
| 2 (Wrapper vs. Production split is concrete, not vague) | **PASS** |
| 3 (next-Sprint-actionable Blueprint confirmed) | **PASS** |

## 8. Decision: A

Architecture Blueprint confirmed → **Incremental Recovery Architecture
Prototype Sprint v1**, which — for the first time in this whole research
arc — should include a scoped Production change: adding a periodic
`Date.now()` check inside `bfsMoveWingToPosition`'s existing node-bounded
BFS loop (priority 1 candidate), validated against the real, already-known
4.02× overrun factor and the 6-regression Visited Registry baseline this
Sprint's own analysis is built on.
