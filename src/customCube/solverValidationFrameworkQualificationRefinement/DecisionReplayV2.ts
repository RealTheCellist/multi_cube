// --- DecisionReplayV2 (Solver Validation Framework Qualification
// Refinement Sprint v1, STEP3/4) ---------------------------------------------
// Same as the original DecisionReplay.ts, except decideFromGates() is now
// called with the case's own stage (from QualificationHelper's
// STAGE_ASSIGNMENTS), so meetsMinN is judged against the tiered
// getMinNForStage(category, stage) instead of the flat categorySpec.minN.
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { HistoricalCase } from "../solverValidationFrameworkQualification/HistoricalQualificationDataset";
import type { GateReplayRowV2 } from "./GateReplayV2";
import { getStageForSprint } from "./QualificationHelper";

export interface DecisionReplayRowV2 {
  sprintName: string;
  actualDecision: "A" | "B" | "C";
  frameworkDecision: "A" | "B" | "C";
  match: boolean;
  pipelineResult: PipelineResult;
}

export function replayDecisionsV2(cases: readonly HistoricalCase[], gateRows: readonly GateReplayRowV2[]): DecisionReplayRowV2[] {
  return cases.map((c, i) => {
    const spec = getCategorySpec(c.assignedCategory);
    const stage = getStageForSprint(c.sprintName);
    const pipelineResult = decideFromGates(spec, c.nUsed, gateRows[i].gates, stage);
    return {
      sprintName: c.sprintName,
      actualDecision: c.actualDecision,
      frameworkDecision: pipelineResult.decision,
      match: pipelineResult.decision === c.actualDecision,
      pipelineResult,
    };
  });
}

export interface DecisionReplaySummaryV2 {
  n: number;
  matchCount: number;
  matchRate: number;
  mismatches: { sprintName: string; actual: string; framework: string }[];
}

export function summarizeDecisionReplayV2(rows: readonly DecisionReplayRowV2[]): DecisionReplaySummaryV2 {
  const matchCount = rows.filter((r) => r.match).length;
  return {
    n: rows.length,
    matchCount,
    matchRate: rows.length ? matchCount / rows.length : 0,
    mismatches: rows.filter((r) => !r.match).map((r) => ({ sprintName: r.sprintName, actual: r.actualDecision, framework: r.frameworkDecision })),
  };
}
