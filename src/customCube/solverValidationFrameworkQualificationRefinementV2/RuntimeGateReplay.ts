// --- RuntimeGateReplay (Solver Validation Framework Qualification
// Refinement Sprint v2, STEP1) -----------------------------------------------
// Instruments exactly how Gate B's own status (PASS/OPEN_QUESTION -- it
// never returns FAIL, see ReleaseGates.ts's evaluateGateB) is consumed by
// decideFromGates() under the CURRENT/default "strict" gateBPolicy, and
// attributes each mismatch to Gate B via a counterfactual: recompute the
// Decision with Gate B's status forced to PASS (holding every other Gate
// and the tiered minN from Refinement Sprint v1 unchanged) and see if
// that alone would have produced the actual historical Decision.
//
// Reuses Refinement Sprint v1's own GateReplayV2 (Gate A/B/C-strict/D/E
// per case, unchanged this Sprint -- only decideFromGates' Gate B
// treatment is new) and QualificationHelper's stage assignments
// (unmodified, read-only reuse per this Sprint's own scope: only
// ReleaseGates.ts/ValidationPipeline.ts may change).
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type GateResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { HistoricalCase } from "../solverValidationFrameworkQualification/HistoricalQualificationDataset";
import { replayAllGatesV2, type GateReplayRowV2 } from "../solverValidationFrameworkQualificationRefinement/GateReplayV2";
import { getStageForSprint } from "../solverValidationFrameworkQualificationRefinement/QualificationHelper";

export interface RuntimeGateReplayRow {
  sprintName: string;
  gateBStatus: GateResult["status"];
  actualDecision: "A" | "B" | "C";
  currentFrameworkDecision: "A" | "B" | "C"; // under strict gateBPolicy (status quo)
  counterfactualDecisionIfGateBWerePass: "A" | "B" | "C"; // Gate B forced to PASS, everything else held fixed
  gateBIsTheCause: boolean; // counterfactual matches actual AND current doesn't
  transition: string; // e.g. "A -> B" if Gate B's OPEN_QUESTION downgraded the Decision
}

function forceGateBToPass(gates: readonly GateResult[]): GateResult[] {
  return gates.map((g) => (g.gate === "B" ? { ...g, status: "PASS" as const } : g));
}

export function replayRuntimeGate(cases: readonly HistoricalCase[]): RuntimeGateReplayRow[] {
  const gateRows: GateReplayRowV2[] = replayAllGatesV2(cases);

  return cases.map((c, i) => {
    const spec = getCategorySpec(c.assignedCategory);
    const stage = getStageForSprint(c.sprintName);
    const gates = gateRows[i].gates;
    const gateB = gates.find((g) => g.gate === "B")!;

    const current = decideFromGates(spec, c.nUsed, gates, stage, "strict");
    const counterfactualGates = forceGateBToPass(gates);
    const counterfactual = decideFromGates(spec, c.nUsed, counterfactualGates, stage, "strict");

    const gateBIsTheCause = counterfactual.decision === c.actualDecision && current.decision !== c.actualDecision;
    const transition = current.decision !== counterfactual.decision ? `${counterfactual.decision} -> ${current.decision} (Gate B로 인한 하향)` : "영향 없음";

    return {
      sprintName: c.sprintName,
      gateBStatus: gateB.status,
      actualDecision: c.actualDecision,
      currentFrameworkDecision: current.decision,
      counterfactualDecisionIfGateBWerePass: counterfactual.decision,
      gateBIsTheCause,
      transition,
    };
  });
}
