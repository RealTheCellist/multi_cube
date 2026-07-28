# Move Representation Prototype Sprint v1

Status: **Complete. Decision: Conclusion C -- Blueprint 수정 필요
(Capability 기준 미달).** This is a research Prototype, never wired into
Recovery/Executor/Planner. It implements Move Representation Blueprint
Sprint v1's "Adaptive Cycle Rotation via Commutator composition" as
faithfully as possible using only existing exported building blocks, and
the honest result is that it does **not** clear the Blueprint's own bar.
Full report:
`moveRepresentationPrototype/data/move-representation-prototype-v1-report.txt`.

---

## 1. Implementation

Three components, all composed from existing, unmodified exports (no new
low-level move-generation algorithm):

- **Adaptive Cycle Detection**: `analyzeMultiCycle()`
  (`solverV2Prototype/MultiCycleAnalyzer.ts`) -- cycle length is never
  hardcoded, used exactly as detected (3, 4, 5, or 6 in this population).
- **Low-Footprint Core Search**: a bounded DFS across the whole detected
  cycle (same shape as BP-1/CCR, same `MAX_LEAVES_EXPLORED` cap), with
  ONE deliberate difference -- at every hop, `enumerateWingCandidates()`
  results are re-ranked by their own immediate `affectedWingCount`
  (ascending) before branching, preferring the least-disruptive options
  first. This is the concrete, new idea this Prototype tests.
- **Setup / Undo-Setup Conjugation**: wraps the Core sequence in
  Setup->Core->Undo-Setup using the exact same building blocks
  `solverV2PrototypeBP2/ParityEntrySelector.ts` already established
  (`buildAtomicFragments()` for 48 fixed candidate setups,
  `invertSequence()` for the exact undo half), including an
  IDENTITY (no-setup) option so a worse-with-setup outcome is never
  forced.

Final gate: Deferred Validation (`validateDeferred`, unmodified) --
only a genuinely net-improving, validated result is ever returned.

## 2. Capability Report

| Population | n | Solved | Baseline | ΔCoverage |
|---|---|---|---|---|
| **PRIMARY** (PURE_CYCLE_ISOLATION) | 28 | **1 (3.6%)** | 0 | **+1** |
| SECONDARY (all 53 residual) | 53 | 1 (1.9%) | 0 | +1 |
| REGRESSION (89 Union Covered) | 89 | 8 (9.0%) | -- | -- |

**The single solved case (`snapshot335:1af658ab`) is the SAME case Move
Representation Prototype's own precondition testing during PURE_CYCLE_ISOLATION
Structural Mechanism Analysis Sprint v1 already found solvable once each
mechanism's own restrictive Gate was bypassed** -- this is not new
capability on a genuinely dead case, it is the one already-easy case in
the population. **0 of the 27 truly dead cases (both BP-1 and CCR
SEARCH_EXHAUSTED) were solved.**

## 3. Side Effect Analysis

| | Value |
|---|---|
| n (solved cases) | 1 |
| avg affectedWingCount | 42.00 |
| avg cycleLength | 3.00 |
| **avg footprintRatio** (affectedWingCount / cycleLength) | **14.00** |
| Blueprint target (footprintRatio<=2.0) achieved | **0/1 (0.0%)** |

The Blueprint's own central prediction -- that a low-footprint-preferring
search plus Setup/Undo-Setup conjugation would keep `affectedWingCount`
close to `cycleLength` -- **did not hold**, even on the one case this
Prototype solved. The chosen conjugation was IDENTITY (no setup helped),
and the Core sequence itself still displaced far more wings than the
cycle's own 3 nodes. This confirms, empirically, the theoretical concern
raised while designing this Sprint: **conjugation (Setup-Core-Undo-Setup)
relocates WHICH pieces a move disturbs, it does not reduce HOW MANY** --
if the Core itself (built from `enumerateWingCandidates()`'s own search
output) is not inherently minimal, no amount of wrapping makes it so.

## 4. Search Cost

Average 14.0 leaves explored, max depth 3.9, average runtime 1339ms per
PRIMARY case -- cheap, consistent with prior Sprints' own finding that
search cost was never the bottleneck.

## 5. Failure Analysis

27/28 (96.4%) PRIMARY cases: `COMMUTATOR_FAILURE` -- a cycle was
correctly detected, but the low-footprint-ranked bounded DFS still never
found any leaf (at any candidate ranking) that both improves
wrongWingCount and survives Deferred Validation. This maps directly onto
the representational gap Move Representation Gap Analysis Sprint v1 found
(0/418 `CYCLE_ROTATION_IMPROVING` candidates) -- reordering the SAME
candidate pool by footprint does not create new capability where none of
the raw candidates offered any improving option in the first place.

## 6. Regression Report

**0/89 regressions** -- the Prototype never made an already-solved case
worse (guaranteed by Deferred Validation, empirically confirmed). 8/89
cases were incidentally also solvable by this new mechanism (harmless,
since Deferred Validation only accepts genuine improvements) and 81/89
were correctly left untouched (returned null).

## 7. Prototype Assessment

**Conclusion C -- Blueprint 수정 필요.** Capability fails (+1, well under
the disclosed +3 meaningful-gain bar) and Side Effect fails (0% achieved
the footprintRatio<=2.0 target) even though Regression passes cleanly
(0 regressions) and Integration is trivially satisfied (same contract as
every existing Primitive, standalone module). Per the Directive's own
Success Criteria (all four conditions required simultaneously for
Conclusion A), this Prototype does not qualify for Production Integration.

**Root cause of the shortfall, disclosed rather than assumed**: the
Blueprint's own Complexity Analysis (Move Representation Blueprint Sprint
v1) already flagged that Cycle Rotation is a "shape," not a "mechanism,"
and that a genuine low-footprint Commutator requires purpose-built short
algorithms, not a reordering of `enumerateWingCandidates()`'s own
search-derived output. This Prototype's honest result confirms that
concern empirically: composing the EXISTING candidate pool -- even with
footprint-aware ranking and Setup/Undo-Setup conjugation -- cannot
manufacture the minimal-footprint property that was never present in the
underlying candidates to begin with. Any future Blueprint revision should
target a genuinely new, purpose-built low-footprint move primitive (not
derived from `enumerateWingCandidates()`'s existing search), rather than
a different composition of the same underlying candidates.

## 8. File Scope Verification

`git diff --stat` against every protected file this Sprint's Directive
lists, plus `solverV2Prototype/`, `solverV2PrototypeBP2/`, and
`primitiveDiscovery/` (read from -- `analyzeMultiCycle`,
`buildAtomicFragments`, `invertSequence`, `validateDeferred`,
`enumerateWingCandidates` all called read-only, never modified) confirms
**0 diff**. This Sprint added only `moveRepresentationPrototype/` (a
standalone research module, never wired into
`fiveByFiveEdgeRecovery.ts`'s `generateRecoveryStrategies()` or any other
production call site) and this document.
