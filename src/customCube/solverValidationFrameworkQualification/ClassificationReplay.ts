// --- ClassificationReplay (Solver Validation Framework Qualification
// Sprint v1, STEP2) --------------------------------------------------------
// IMPORTANT SCOPE NOTE: ChangeClassification.ts does not contain an
// automatic classifier function (there is no `classifyChange(description):
// Category` -- Category assignment is, by the Framework's own design, a
// human judgment call made when a change is proposed, not something
// inferred from code). "Classification Qualification" therefore cannot
// test classifier ACCURACY (no algorithm exists to be wrong) -- instead
// this checks classification CONSISTENCY: does the Category assigned to
// each HistoricalCase (by this Sprint's own human judgment in
// HistoricalQualificationDataset.ts) actually satisfy that Category's own
// declared minimums (minN, populationScope)? A case assigned to a Category
// whose own bar it doesn't clear is a real, useful finding -- distinct
// from a "wrong Decision" (STEP4) or "Gate mismatch" (STEP3).
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import type { HistoricalCase } from "./HistoricalQualificationDataset";

export interface ClassificationReplayRow {
  sprintName: string;
  assignedCategory: string;
  minNRequired: number;
  nUsed: number;
  meetsMinN: boolean;
  status: "PASS" | "OPEN_QUESTION";
  note: string;
}

export function replayClassification(cases: readonly HistoricalCase[]): ClassificationReplayRow[] {
  return cases.map((c) => {
    const spec = getCategorySpec(c.assignedCategory);
    const meetsMinN = c.nUsed >= spec.minN;
    return {
      sprintName: c.sprintName,
      assignedCategory: `${spec.category} (${spec.name})`,
      minNRequired: spec.minN,
      nUsed: c.nUsed,
      meetsMinN,
      status: meetsMinN ? "PASS" : "OPEN_QUESTION",
      note: meetsMinN
        ? "이 Category의 최소 N 기준 충족."
        : `이 Category(${spec.category})가 요구하는 N>=${spec.minN}에 미달(N=${c.nUsed}) -- 분류 자체가 틀린 것이 아니라, 이 historical Sprint가 당시 Framework 기준(사후 확정)보다 낮은 표본으로 진행됐음을 보여준다.`,
    };
  });
}
