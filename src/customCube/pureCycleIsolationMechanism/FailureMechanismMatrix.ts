// --- FailureMechanismMatrix (PURE_CYCLE_ISOLATION Structural Mechanism
// Analysis Sprint v1, RQ-1/RQ-2/RQ-3, Required Analysis #1/#3) -------------
import type { CycleSearchDiagnostics } from "./CycleSearchShadow";

export interface CaseFailureMechanismRow {
  label: string;
  cycleLength: number;
  wrongWingCount: number;
  bp1: CycleSearchDiagnostics;
  ccr: CycleSearchDiagnostics;
  sameTerminationReason: boolean; // RQ-3
  bothSearchExhausted: boolean; // genuine shared dead-end, not a leaf/budget artifact
  eitherLeafCapReached: boolean;
}

export function buildFailureMechanismRow(label: string, cycleLength: number, wrongWingCount: number, bp1: CycleSearchDiagnostics, ccr: CycleSearchDiagnostics): CaseFailureMechanismRow {
  return {
    label,
    cycleLength,
    wrongWingCount,
    bp1,
    ccr,
    sameTerminationReason: bp1.terminationReason === ccr.terminationReason,
    bothSearchExhausted: bp1.terminationReason === "SEARCH_EXHAUSTED" && ccr.terminationReason === "SEARCH_EXHAUSTED",
    eitherLeafCapReached: bp1.terminationReason === "LEAF_CAP_REACHED" || ccr.terminationReason === "LEAF_CAP_REACHED",
  };
}

export interface SharedFailureSummary {
  totalCases: number;
  sameTerminationReasonCount: number;
  bothSearchExhaustedCount: number;
  eitherLeafCapReachedCount: number;
  bp1TerminationTally: Record<string, number>;
  ccrTerminationTally: Record<string, number>;
  avgBp1LeavesExplored: number;
  avgCcrLeavesExplored: number;
  avgBp1MaxDepth: number;
  avgCcrMaxDepth: number;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function summarizeSharedFailure(rows: CaseFailureMechanismRow[]): SharedFailureSummary {
  const bp1TerminationTally: Record<string, number> = {};
  const ccrTerminationTally: Record<string, number> = {};
  for (const r of rows) {
    bp1TerminationTally[r.bp1.terminationReason] = (bp1TerminationTally[r.bp1.terminationReason] ?? 0) + 1;
    ccrTerminationTally[r.ccr.terminationReason] = (ccrTerminationTally[r.ccr.terminationReason] ?? 0) + 1;
  }
  return {
    totalCases: rows.length,
    sameTerminationReasonCount: rows.filter((r) => r.sameTerminationReason).length,
    bothSearchExhaustedCount: rows.filter((r) => r.bothSearchExhausted).length,
    eitherLeafCapReachedCount: rows.filter((r) => r.eitherLeafCapReached).length,
    bp1TerminationTally,
    ccrTerminationTally,
    avgBp1LeavesExplored: avg(rows.map((r) => r.bp1.leavesExplored)),
    avgCcrLeavesExplored: avg(rows.map((r) => r.ccr.leavesExplored)),
    avgBp1MaxDepth: avg(rows.map((r) => r.bp1.maxDepthReached)),
    avgCcrMaxDepth: avg(rows.map((r) => r.ccr.maxDepthReached)),
  };
}
