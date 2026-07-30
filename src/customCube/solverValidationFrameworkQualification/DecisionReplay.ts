// --- DecisionReplay (Solver Validation Framework Qualification Sprint
// v1, STEP4) ---------------------------------------------------------------
// Runs each HistoricalCase's own Gate results through the Framework's own,
// unmodified decideFromGates() and compares the Framework's computed
// Decision against what that Sprint actually decided at the time.
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { HistoricalCase } from "./HistoricalQualificationDataset";
import type { GateReplayRow } from "./GateReplay";

export interface DecisionReplayRow {
  sprintName: string;
  actualDecision: "A" | "B" | "C";
  frameworkDecision: "A" | "B" | "C";
  match: boolean;
  pipelineResult: PipelineResult;
}

export function replayDecisions(cases: readonly HistoricalCase[], gateRows: readonly GateReplayRow[]): DecisionReplayRow[] {
  return cases.map((c, i) => {
    const spec = getCategorySpec(c.assignedCategory);
    const pipelineResult = decideFromGates(spec, c.nUsed, gateRows[i].gates);
    return {
      sprintName: c.sprintName,
      actualDecision: c.actualDecision,
      frameworkDecision: pipelineResult.decision,
      match: pipelineResult.decision === c.actualDecision,
      pipelineResult,
    };
  });
}

export interface DecisionReplaySummary {
  n: number;
  matchCount: number;
  matchRate: number;
  mismatches: { sprintName: string; actual: string; framework: string }[];
}

export function summarizeDecisionReplay(rows: readonly DecisionReplayRow[]): DecisionReplaySummary {
  const matchCount = rows.filter((r) => r.match).length;
  return {
    n: rows.length,
    matchCount,
    matchRate: rows.length ? matchCount / rows.length : 0,
    mismatches: rows.filter((r) => !r.match).map((r) => ({ sprintName: r.sprintName, actual: r.actualDecision, framework: r.frameworkDecision })),
  };
}
