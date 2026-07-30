// --- DecisionRuleComparison (Solver Validation Framework Qualification
// Refinement Sprint v2, STEP2/3) ---------------------------------------------
// Evaluates the 3 candidate Gate B policies (Directive's Option A/B/C,
// named here to match ValidationPipeline.ts's GateBPolicy union) against
// the SAME 5 Historical Cases, SAME published metrics -- no re-measurement.
// Reuses Refinement Sprint v1's own GateReplayV2 (Gate statuses, including
// strict Gate C -- unchanged this Sprint) and FrameworkRobustnessAnalysis
// (unchanged since Qualification Sprint v1 -- DecisionReplayRowV3 below is
// structurally identical to the DecisionReplayRow type it expects).
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type GateBPolicy, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import { HISTORICAL_QUALIFICATION_DATASET } from "../solverValidationFrameworkQualification/HistoricalQualificationDataset";
import { analyzeRobustness, summarizeRobustness, type RobustnessSummary } from "../solverValidationFrameworkQualification/FrameworkRobustnessAnalysis";
import { replayAllGatesV2 } from "../solverValidationFrameworkQualificationRefinement/GateReplayV2";
import { getStageForSprint } from "../solverValidationFrameworkQualificationRefinement/QualificationHelper";

export interface DecisionReplayRowV3 {
  sprintName: string;
  actualDecision: "A" | "B" | "C";
  frameworkDecision: "A" | "B" | "C";
  match: boolean;
  pipelineResult: PipelineResult;
}

export interface RuleEvaluation {
  policy: GateBPolicy;
  label: string;
  rows: DecisionReplayRowV3[];
  matchCount: number;
  matchRate: number;
  robustness: RobustnessSummary;
}

const POLICY_LABELS: Record<GateBPolicy, string> = {
  strict: "Option C -- 현재 방식 유지(모든 Mandatory Gate PASS 필요)",
  treatAllOpenQuestionAsPass: "Option A -- OPEN_QUESTION을 PASS와 동일 취급(전체 Gate 대상)",
  gateBExemptIfOthersPass: "Option B -- Gate B만 예외, 다른 Mandatory Gate 전부 PASS이면 Decision A 허용",
};

function evaluatePolicy(policy: GateBPolicy): RuleEvaluation {
  const cases = HISTORICAL_QUALIFICATION_DATASET;
  const gateRows = replayAllGatesV2(cases);

  const rows: DecisionReplayRowV3[] = cases.map((c, i) => {
    const spec = getCategorySpec(c.assignedCategory);
    const stage = getStageForSprint(c.sprintName);
    const pipelineResult = decideFromGates(spec, c.nUsed, gateRows[i].gates, stage, policy);
    return {
      sprintName: c.sprintName,
      actualDecision: c.actualDecision,
      frameworkDecision: pipelineResult.decision,
      match: pipelineResult.decision === c.actualDecision,
      pipelineResult,
    };
  });

  const matchCount = rows.filter((r) => r.match).length;
  const robustnessFindings = analyzeRobustness(cases, rows);
  const robustness = summarizeRobustness(robustnessFindings);

  return { policy, label: POLICY_LABELS[policy], rows, matchCount, matchRate: matchCount / rows.length, robustness };
}

export function compareAllPolicies(): RuleEvaluation[] {
  const policies: GateBPolicy[] = ["strict", "treatAllOpenQuestionAsPass", "gateBExemptIfOthersPass"];
  return policies.map(evaluatePolicy);
}
