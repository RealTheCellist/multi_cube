// --- ComparativeConsistency (Multi-Component Merge Production
// Integration Refinement Sprint v2, STEP4) -------------------------------------
// Compares Arm C's real production-path result (outer deadline=2000ms,
// full Recovery pipeline: DISRUPT/REPAIR/CCR/MCM/PARITY_GATED_CYCLE/
// MIXED_COMMUTATOR all still compete for that SAME 2000ms, unlike
// Comparative Prototype Sprint v1's own isolated MCM-only test) against
// that Sprint's own real per-case result JSON (multiImproved flags,
// componentCountBefore>=3 subset) -- disclosed methodology gap: Arm C
// tests "what if the OUTER deadline matched MCM's own nominal budget",
// not "MCM running alone with no competition" (STEP2's own Arm A already
// showed 100% Budget Starvation persists at outer=1000ms even without
// counting other Primitives' own share, so competition from other
// Primitives is a real, disclosed confound this STEP does not remove).
import type { DeadlineReplayRow } from "./DeadlineReplay";

export interface ConsistencyRow {
  label: string;
  componentCountBefore: number;
  comparativeIsolatedSuccess: boolean; // Comparative Prototype Sprint v1's own real multiImproved flag (isolated 2000ms budget, no competition)
  productionArmCSuccess: boolean; // this Sprint's own real armC.improved (2000ms OUTER deadline, full pipeline competition)
  match: boolean;
}

export function buildConsistencyRows(comparativeResultPath: string, readFile: (path: string) => string, replayRows: readonly DeadlineReplayRow[]): ConsistencyRow[] {
  const comparative = JSON.parse(readFile(comparativeResultPath));
  const componentCount3Plus: { label: string; componentCountBefore: number; multiImproved: boolean }[] = comparative.perCase
    .filter((c: any) => c.multi.componentCountBefore >= 3)
    .map((c: any) => ({ label: c.label, componentCountBefore: c.multi.componentCountBefore, multiImproved: c.multiImproved }));

  const replayByLabel = new Map(replayRows.map((r) => [r.label, r]));
  return componentCount3Plus.map((c) => {
    const replay = replayByLabel.get(c.label);
    const productionArmCSuccess = replay?.armC.improved ?? false;
    return {
      label: c.label,
      componentCountBefore: c.componentCountBefore,
      comparativeIsolatedSuccess: c.multiImproved,
      productionArmCSuccess,
      match: c.multiImproved === productionArmCSuccess,
    };
  });
}

export interface ConsistencySummary {
  n: number;
  matchCount: number;
  matchRate: number;
  successMatchCount: number; // both succeeded
  successMismatchCount: number; // isolated succeeded, production Arm C did not
  failureMatchCount: number; // both failed
  failureMismatchCount: number; // isolated failed, production Arm C succeeded (rare -- would suggest something ELSE in the pipeline helped)
}

export function summarizeConsistency(rows: readonly ConsistencyRow[]): ConsistencySummary {
  const successMatch = rows.filter((r) => r.comparativeIsolatedSuccess && r.productionArmCSuccess);
  const successMismatch = rows.filter((r) => r.comparativeIsolatedSuccess && !r.productionArmCSuccess);
  const failureMatch = rows.filter((r) => !r.comparativeIsolatedSuccess && !r.productionArmCSuccess);
  const failureMismatch = rows.filter((r) => !r.comparativeIsolatedSuccess && r.productionArmCSuccess);
  return {
    n: rows.length,
    matchCount: rows.filter((r) => r.match).length,
    matchRate: rows.length ? rows.filter((r) => r.match).length / rows.length : 0,
    successMatchCount: successMatch.length,
    successMismatchCount: successMismatch.length,
    failureMatchCount: failureMatch.length,
    failureMismatchCount: failureMismatch.length,
  };
}
