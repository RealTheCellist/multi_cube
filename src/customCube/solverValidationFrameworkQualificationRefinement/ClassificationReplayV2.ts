// --- ClassificationReplayV2 (Solver Validation Framework Qualification
// Refinement Sprint v1, STEP3) ----------------------------------------------
// Same consistency check as the original ClassificationReplay.ts, but
// using the new tiered getMinNForStage(category, stage) instead of the
// flat categorySpec.minN -- this is what closes the 3 False FAILs (a
// Prototype-stage case no longer measured against the Production-stage
// bar it was never meant to clear).
import { getCategorySpec, getMinNForStage } from "../solverPostReleaseValidationFramework/ChangeClassification";
import type { HistoricalCase } from "../solverValidationFrameworkQualification/HistoricalQualificationDataset";
import { getStageForSprint } from "./QualificationHelper";

export interface ClassificationReplayRowV2 {
  sprintName: string;
  assignedCategory: string;
  stage: string;
  minNRequired: number;
  nUsed: number;
  meetsMinN: boolean;
  status: "PASS" | "OPEN_QUESTION";
  note: string;
}

export function replayClassificationV2(cases: readonly HistoricalCase[]): ClassificationReplayRowV2[] {
  return cases.map((c) => {
    const spec = getCategorySpec(c.assignedCategory);
    const stage = getStageForSprint(c.sprintName);
    const minNRequired = getMinNForStage(c.assignedCategory, stage);
    const meetsMinN = c.nUsed >= minNRequired;
    return {
      sprintName: c.sprintName,
      assignedCategory: `${spec.category} (${spec.name})`,
      stage,
      minNRequired,
      nUsed: c.nUsed,
      meetsMinN,
      status: meetsMinN ? "PASS" : "OPEN_QUESTION",
      note: meetsMinN
        ? `이 Category의 ${stage}-stage 최소 N 기준(N>=${minNRequired}) 충족.`
        : `이 Category(${spec.category})의 ${stage}-stage 최소 기준 N>=${minNRequired}에 미달(N=${c.nUsed}).`,
    };
  });
}
