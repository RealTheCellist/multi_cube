// --- ValidationPipeline (Solver Post-Release Validation Framework Sprint
// v1, STEP5) ---------------------------------------------------------------
// Formalizes the Directive's own 6-stage pipeline (Code Change -> Replay
// -> Metric Collection -> Statistical Validation -> Release Gate ->
// Decision) as a typed contract a future Sprint's own driver implements.
// "Replay" and "Metric Collection" are inherently specific to whatever
// changed (a new Primitive needs different probing than a Budget tweak),
// so those two stages stay caller-supplied functions -- this module only
// standardizes the SHAPE every Sprint's own driver should conform to, plus
// the one truly generic piece: composing Gate results into a final
// Decision (identical logic every Sprint in this arc has hand-rolled).
import type { ChangeCategory, ChangeCategorySpec, ValidationStage } from "./ChangeClassification";
import { getMinNForStage } from "./ChangeClassification";
import type { GateResult } from "./ReleaseGates";

export type PipelineStage = "code_change" | "replay" | "metric_collection" | "statistical_validation" | "release_gate" | "decision";

export interface PipelineInput<TCase> {
  changeCategory: ChangeCategory;
  changeDescription: string;
  population: readonly TCase[];
  n: number; // repeat count actually used -- caller must meet categorySpec.minN
}

// The two stages every future Sprint must supply itself, since they are
// necessarily specific to the change under test.
export interface PipelineHooks<TCase, TRunRecord> {
  replay: (population: readonly TCase[]) => TRunRecord[]; // one full Baseline-vs-Candidate pass
  collectMetrics: (runs: readonly TRunRecord[]) => Record<string, number>; // raw per-repeat numbers, pre-statistics
}

export interface PipelineResult {
  changeCategory: ChangeCategory;
  categorySpec: ChangeCategorySpec;
  nUsed: number;
  meetsMinN: boolean;
  gateResults: GateResult[];
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

// The one generic piece: given a change's own Category spec (which Gates
// it must clear) and the Gate results a Sprint's own driver already
// computed (via ReleaseGates.ts's evaluateGate*), decide.
//
// `stage` (added by Solver Validation Framework Qualification Refinement
// Sprint v1 STEP1) selects which tier of ChangeClassification.ts's
// `minNByStage` applies -- defaults to "production", which is always
// equal to the pre-existing `categorySpec.minN` value, so every caller
// written against the original 3-arg v1 API (e.g. Solver Validation
// Framework Qualification Sprint v1's own DecisionReplay.ts) keeps
// compiling and reproduces the exact same result it originally did.
export function decideFromGates(
  categorySpec: ChangeCategorySpec,
  nUsed: number,
  gateResults: readonly GateResult[],
  stage: ValidationStage = "production"
): PipelineResult {
  const minNRequired = getMinNForStage(categorySpec.category, stage);
  const meetsMinN = nUsed >= minNRequired;
  const requiredResults = gateResults.filter((g) => categorySpec.requiredGates.includes(g.gate));
  const anyFail = requiredResults.some((g) => g.status === "FAIL") || !meetsMinN;
  const allPass = requiredResults.every((g) => g.status === "PASS") && meetsMinN;

  let decision: "A" | "B" | "C" = "A";
  let decisionRationale: string;
  if (anyFail) {
    decision = "C";
    decisionRationale = !meetsMinN
      ? `N=${nUsed}이 이 Category(${categorySpec.category})의 ${stage}-stage 최소 기준 N>=${minNRequired}에 미달 -- 재현성 부족, Release 불가.`
      : `필수 Gate(${categorySpec.requiredGates.join(",")}) 중 하나 이상 FAIL -- Release Blocked.`;
  } else if (allPass) {
    decision = "A";
    decisionRationale = `Category ${categorySpec.category}(${categorySpec.name})의 필수 Gate(${categorySpec.requiredGates.join(",")}) 전부 PASS, N=${nUsed}>=${minNRequired}(${stage}-stage) 충족 -- Release 가능.`;
  } else {
    decision = "B";
    decisionRationale = `필수 Gate는 FAIL 없음이나 일부 OPEN_QUESTION -- 조건부 승인, 후속 확인 권장.`;
  }

  return { changeCategory: categorySpec.category, categorySpec, nUsed, meetsMinN, gateResults: [...gateResults], decision, decisionRationale };
}

export const PIPELINE_STAGES: readonly PipelineStage[] = ["code_change", "replay", "metric_collection", "statistical_validation", "release_gate", "decision"];
