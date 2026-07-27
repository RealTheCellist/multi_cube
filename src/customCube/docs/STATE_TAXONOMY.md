# State Taxonomy Sprint v1 (Solver Completeness Achievement Program, Phase 2)

Status: **Phase 2 STEP1 complete**. The Directive's example mechanism
taxonomy (Conflict Dominant / Locked Pair / Bridge Missing / Cycle
Isolation / Deferred Trap / Symmetric Trap) was checked against the 142-case
Hole Dataset. 4 of 6 categories are directly confirmable from Phase 1's
structural data; the largest true class in this dataset (39.4% of all
cases) has **no name in the Directive's example list at all**. Full report:
`stateTaxonomy/data/state-taxonomy-v1-report.txt`.

---

## 1. Method

This step deliberately did **not** re-run the expensive Coverage Hole
Discovery pipeline. Phase 1's 20 Dead State Clusters already carry a real,
verified structural composite key (parity presence, longest-cycle-length
bucket, conflict-edge presence, wrongWing-count bucket) computed from the
actual 142 stuck states. Phase 2 STEP1 is a consolidation/naming pass over
that existing data: 20 raw feature-clusters mapped onto named mechanism
classes via `stateTaxonomy/TaxonomyMapper.ts::classifyCluster()`.

## 2. Taxonomy Class summary

| Class | Cases | Share | Clusters | anyPrimitiveApplicable |
|---|---|---|---|---|
| **Parity-Gated Cycle** (not in Directive's list) | 56 | 39.4% | 8 | 20/56 (35.7%) |
| **Cycle Isolation** | 50 | 35.2% | 5 | 3/50 (6.0%) |
| **Conflict Dominant** | 33 | 23.2% | 4 | 4/33 (12.1%) |
| **Locked Pair** | 3 | 2.1% | 3 | 1/3 (33.3%) |

All 142 cases were classified -- 0 fell into "Unclassified." The four
confirmed classes are mutually exclusive and jointly exhaustive over this
dataset.

## 3. Key finding: the Directive's example taxonomy misses the largest class

**Parity-Gated Cycle (39.4% of the entire Hole Dataset) has no name in the
Master Directive's own example list** ("예: Conflict Dominant / Locked Pair
/ Bridge Missing / Cycle Isolation / Deferred Trap / Symmetric Trap").
States where the parity flag is set AND a resolvable wing cycle exists are
the single most common mechanism in this population -- almost 2.5x larger
than the next-biggest confirmed class. This is not a minor edge case to
fold into "Cycle Isolation": its `anyPrimitiveApplicable` rate (35.7%) is
**6x higher** than plain Cycle Isolation's (6.0%), meaning it behaves
structurally differently from parity-free cycles, not just "Cycle Isolation
plus a parity flag." Phase 3 (Primitive Discovery) should treat this as its
own named target, not a subcategory.

## 4. Applicability-rate contrast across classes

| Class | anyPrimitiveApplicable rate | Interpretation |
|---|---|---|
| Parity-Gated Cycle | 35.7% | Where the Reachable-but-Unexploited (scheduling) problem concentrates most |
| Locked Pair | 33.3% | Small sample (n=3), but also disproportionately scheduling-recoverable |
| Conflict Dominant | 12.1% | Mostly a true capability gap |
| **Cycle Isolation** | **6.0%** | **Almost entirely a true capability gap (47/50 cases have zero applicable existing primitive)** |

Cycle Isolation is where new Primitive design (Phase 3) will have the
highest yield -- it is both the 2nd-largest class (50 cases) and the class
where existing primitives are least likely to already work by chance.

## 5. Directive-named categories NOT confirmable from this dataset

| Category | Why not confirmable now |
|---|---|
| **Bridge Missing** | Needs multi-component structural analysis (is there a piece that could bridge two disjoint WANTS-graph components?). `componentCount` was computed per-case in Phase 1 but not persisted at cluster granularity, and the raw per-case states are gone for this specific 142-case run (see Appendix -- fixed for future runs). |
| **Deferred Trap** | Needs observing state evolution across multiple solve() attempts (a trap that only manifests several turns after a prior fix). Phase 1 tested each stuck state as a single isolated snapshot, not a trajectory -- a fundamentally different measurement design. |
| **Symmetric Trap** | Needs checking a state against the cube's symmetry group. No symmetry-detection code exists anywhere in this codebase (verified by search) -- this would be new infrastructure, not a reclassification of existing data. |

These are disclosed as open, not silently dropped. None of the 142
confirmed cases were force-fit into these three categories.

## 6. Recommendation for Phase 3

Prioritize by yield, not by Directive list order:

1. **Cycle Isolation (50 cases, 6% applicable)** -- highest-yield target for
   new Primitive capability; almost no existing primitive already covers
   this mechanism.
2. **Conflict Dominant (33 cases, 12.1% applicable)** -- second-highest
   yield; the genuinely new `ConflictAnalysis.ts` module from Phase 1 gives
   a concrete structural handle (which slots are in one-sided WANTS
   relationships) to design against.
3. **Parity-Gated Cycle (56 cases, largest, 35.7% applicable)** -- the
   *majority* of this class is scheduling-recoverable already; the
   remaining ~64% (36 cases) that are true gaps deserve a dedicated
   Primitive, but a parallel Goal-2 scheduling investigation could recover
   a meaningful share cheaper than new Primitive design.
4. **Locked Pair (3 cases)** -- too small a sample in this 142-case slice to
   prioritize; revisit with the full 717 population in Phase 6.
5. **Bridge Missing / Deferred Trap / Symmetric Trap** -- require new
   measurement infrastructure before they can even be confirmed to exist in
   this dataset, let alone sized. Out of scope until that infrastructure is
   built.

## 7. File Scope Verification

This step read only `coverageAtlas/data/coverage-hole-discovery-v1-result.
json` (Phase 1's own output) and wrote only `stateTaxonomy/` + this
document. Zero interaction with any Solver production file.

---

## Appendix: data-retention bug fixed after Phase 1

Phase 1's driver deleted its STEP1 checkpoint (containing the actual final
stuck `Cubie[]` states) unconditionally on clean completion, discarding
exactly the data needed for deeper Phase 2 analysis (e.g. Bridge Missing's
component-bridging check). This was caught and fixed immediately after
Phase 1 finished: the driver now persists a permanent, gitignored
`raw-dataset-v1-holes.json` (not auto-deleted, unlike checkpoints) so any
future re-run's raw states survive for follow-up phases. This specific
142-case run's raw states are not recoverable without a fresh re-run (~2.5
hours); Phase 2 STEP1 proceeded without them since the persisted cluster
aggregate data was sufficient for the taxonomy mapping performed here.
