// --- CompletenessMatrix + Termination Classification + Search Funnel
// (CCR Completeness Validation Sprint v1, Required Analysis #1-3) ----------
import type { TerminationReason } from "./CCRShadowInstrumentation";

export interface PerCaseCompletenessRow {
  label: string;
  leavesExplored: number;
  maxDepthReached: number;
  terminationReason: TerminationReason;
  solved: boolean;
}

export interface SearchFunnelSummary {
  gatePassed: number;
  dfsStarted: number; // == gatePassed (gate eligibility always triggers a DFS attempt)
  leafExpansionOccurred: number; // leavesExplored > 0
  terminationRecorded: number; // == gatePassed (every DFS call terminates one way or another)
  solved: number;
}

export function summarizeSearchFunnel(rows: PerCaseCompletenessRow[]): SearchFunnelSummary {
  return {
    gatePassed: rows.length,
    dfsStarted: rows.length,
    leafExpansionOccurred: rows.filter((r) => r.leavesExplored > 0).length,
    terminationRecorded: rows.length,
    solved: rows.filter((r) => r.solved).length,
  };
}

export type TerminationTally = Record<TerminationReason, number>;

export function tallyTerminationReasons(rows: PerCaseCompletenessRow[]): TerminationTally {
  const tally: TerminationTally = { SOLUTION_FOUND: 0, LEAF_CAP_REACHED: 0, BUDGET_EXPIRED: 0, SEARCH_EXHAUSTED: 0 };
  for (const r of rows) tally[r.terminationReason]++;
  return tally;
}

export type CompletenessVerdict = "SEARCH_COMPLETE" | "SEARCH_INCOMPLETE";

export function classifyCompleteness(reason: TerminationReason): CompletenessVerdict {
  // "Complete" here means the DFS reached a definitive end on its own terms
  // (found a solution, or genuinely exhausted every reachable branch) --
  // NOT that the underlying cube state is solvable. "Incomplete" means an
  // artificial cap (leaf count or wall-clock deadline) cut the search short
  // before it could reach either of those definitive ends.
  return reason === "SOLUTION_FOUND" || reason === "SEARCH_EXHAUSTED" ? "SEARCH_COMPLETE" : "SEARCH_INCOMPLETE";
}

export interface CompletenessMatrixSummary {
  gatePassed: number;
  searchComplete: number;
  searchIncomplete: number;
  searchCompleteRate: number;
}

export function summarizeCompletenessMatrix(rows: PerCaseCompletenessRow[]): CompletenessMatrixSummary {
  const complete = rows.filter((r) => classifyCompleteness(r.terminationReason) === "SEARCH_COMPLETE").length;
  return {
    gatePassed: rows.length,
    searchComplete: complete,
    searchIncomplete: rows.length - complete,
    searchCompleteRate: rows.length ? complete / rows.length : 0,
  };
}
