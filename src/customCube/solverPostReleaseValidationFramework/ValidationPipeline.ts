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

// Gate B policy (added by Solver Validation Framework Qualification
// Refinement Sprint v2 STEP2) -- controls how an OPEN_QUESTION status
// specifically on Gate B (Runtime) is treated when computing `allPass`.
// Gate B's own evaluateGateB() never returns FAIL (see ReleaseGates.ts --
// it is PASS or OPEN_QUESTION only, i.e. designed as an advisory,
// disclosed-tradeoff Gate, not a hard blocker). The original `allPass`
// definition ("every required Gate is literal PASS") did not honor that
// distinction, so a Sprint with a strong, significant Capability gain
// (Gate C PASS) but a disclosed Runtime tradeoff (Gate B OPEN_QUESTION)
// could never reach Decision A -- masked in Refinement Sprint v1 by the
// old flat minN check failing first for the two cases that hit this, and
// only exposed once minN was fixed to be tiered.
//
//   "strict"                  -- status quo: Gate B (like every other
//                                 required Gate) must be literal PASS.
//                                 DEFAULT, for exact backward
//                                 compatibility with every existing
//                                 caller (Qualification Sprint v1's
//                                 DecisionReplay.ts, Refinement Sprint
//                                 v1's DecisionReplayV2.ts) -- neither
//                                 passes this param, so neither's
//                                 reproduced result changes.
//   "treatAllOpenQuestionAsPass" -- Option A: ANY required Gate's
//                                 OPEN_QUESTION (not just Gate B's) is
//                                 treated as equivalent to PASS.
//   "gateBExemptIfOthersPass"  -- Option B: ONLY Gate B's OPEN_QUESTION
//                                 is tolerated, and only when every OTHER
//                                 required Gate (including Gate E, which
//                                 can also be OPEN_QUESTION) is literal
//                                 PASS. Narrower than Option A -- matches
//                                 this Sprint's own scope ("Gate B의
//                                 OPEN_QUESTION 처리 방식만 해결").
//
// RECOMMENDED_GATE_B_POLICY names the value this Framework adopts going
// forward per Qualification Refinement Sprint v2's own Decision (see
// docs/SOLVER_VALIDATION_FRAMEWORK_QUALIFICATION_REFINEMENT_V2.md) --
// exported as an explicit opt-in constant rather than changed as the
// parameter default, so old reproductions stay byte-identical and only
// callers that explicitly ask for the new standard get it.
export type GateBPolicy = "strict" | "treatAllOpenQuestionAsPass" | "gateBExemptIfOthersPass";
export const RECOMMENDED_GATE_B_POLICY: GateBPolicy = "gateBExemptIfOthersPass";

function computeAllPass(requiredResults: readonly GateResult[], meetsMinN: boolean, gateBPolicy: GateBPolicy): boolean {
  if (!meetsMinN) return false;
  if (gateBPolicy === "strict") {
    return requiredResults.every((g) => g.status === "PASS");
  }
  if (gateBPolicy === "treatAllOpenQuestionAsPass") {
    return requiredResults.every((g) => g.status === "PASS" || g.status === "OPEN_QUESTION");
  }
  // gateBExemptIfOthersPass: every non-B required Gate must be literal
  // PASS; Gate B itself may be PASS or OPEN_QUESTION.
  return requiredResults.every((g) => (g.gate === "B" ? g.status === "PASS" || g.status === "OPEN_QUESTION" : g.status === "PASS"));
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
//
// `gateBPolicy` (added by Qualification Refinement Sprint v2 STEP2)
// defaults to "strict" for the same backward-compatibility reason.
export function decideFromGates(
  categorySpec: ChangeCategorySpec,
  nUsed: number,
  gateResults: readonly GateResult[],
  stage: ValidationStage = "production",
  gateBPolicy: GateBPolicy = "strict"
): PipelineResult {
  const minNRequired = getMinNForStage(categorySpec.category, stage);
  const meetsMinN = nUsed >= minNRequired;
  const requiredResults = gateResults.filter((g) => categorySpec.requiredGates.includes(g.gate));
  const anyFail = requiredResults.some((g) => g.status === "FAIL") || !meetsMinN;
  const allPass = computeAllPass(requiredResults, meetsMinN, gateBPolicy);

  let decision: "A" | "B" | "C" = "A";
  let decisionRationale: string;
  if (anyFail) {
    decision = "C";
    decisionRationale = !meetsMinN
      ? `N=${nUsed}이 이 Category(${categorySpec.category})의 ${stage}-stage 최소 기준 N>=${minNRequired}에 미달 -- 재현성 부족, Release 불가.`
      : `필수 Gate(${categorySpec.requiredGates.join(",")}) 중 하나 이상 FAIL -- Release Blocked.`;
  } else if (allPass) {
    decision = "A";
    const gateBNote = gateBPolicy !== "strict" ? ` (gateBPolicy=${gateBPolicy})` : "";
    decisionRationale = `Category ${categorySpec.category}(${categorySpec.name})의 필수 Gate(${categorySpec.requiredGates.join(",")}) 전부 PASS${gateBNote}, N=${nUsed}>=${minNRequired}(${stage}-stage) 충족 -- Release 가능.`;
  } else {
    decision = "B";
    decisionRationale = `필수 Gate는 FAIL 없음이나 일부 OPEN_QUESTION -- 조건부 승인, 후속 확인 권장.`;
  }

  return { changeCategory: categorySpec.category, categorySpec, nUsed, meetsMinN, gateResults: [...gateResults], decision, decisionRationale };
}

export const PIPELINE_STAGES: readonly PipelineStage[] = ["code_change", "replay", "metric_collection", "statistical_validation", "release_gate", "decision"];
