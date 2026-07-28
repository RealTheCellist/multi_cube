// --- GateAblation (Mixed Commutator Opportunity Analysis Sprint v1, RQ-3,
// Required Measurement #2 "Gate Ablation") -----------------------------------
// Removes each Gate condition ONE AT A TIME (keeping the other two) and
// measures how many ADDITIONAL cases -- ones the real strict Gate excludes
// but the relaxed Gate would admit -- are actually shadow-solvable (reusing
// ShadowEvaluation's own already-computed per-case result, since that
// measurement bypassed the Gate entirely and is valid for any Gate
// variant). No new Prototype runs needed here; this is pure re-slicing of
// already-measured real data against three counterfactual Gate definitions.
import type { GateFunnelRow } from "./GateFunnel";
import type { ShadowEvaluationRow } from "./ShadowEvaluation";

export type AblatedCondition = "NO_CYCLE_RESTRICTION" | "NO_COMPONENT_RESTRICTION" | "NO_CONFLICT_RESTRICTION";

export interface AblationResult {
  condition: AblatedCondition;
  description: string;
  relaxedGatePassCount: number; // total cases passing the relaxed Gate
  newlyAdmittedCount: number; // relaxedGatePass AND NOT strictGatePass
  newlyAdmittedShadowSolvableCount: number; // of the newly admitted, how many are actually shadow-solvable
}

function relaxedPasses(row: GateFunnelRow, condition: AblatedCondition): boolean {
  switch (condition) {
    case "NO_CYCLE_RESTRICTION":
      return row.passesComponent && row.passesConflict;
    case "NO_COMPONENT_RESTRICTION":
      return row.passesCycle && row.passesConflict;
    case "NO_CONFLICT_RESTRICTION":
      return row.passesCycle && row.passesComponent;
  }
}

export function runGateAblation(gateFunnelRows: readonly GateFunnelRow[], shadowRows: readonly ShadowEvaluationRow[]): AblationResult[] {
  const shadowByLabel = new Map(shadowRows.map((r) => [r.label, r]));
  const conditions: { condition: AblatedCondition; description: string }[] = [
    { condition: "NO_CYCLE_RESTRICTION", description: "cycleCount===1 조건 제거 (componentCount===1 AND conflictCount===0만 유지)" },
    { condition: "NO_COMPONENT_RESTRICTION", description: "componentCount===1 조건 제거 (cycleCount===1 AND conflictCount===0만 유지)" },
    { condition: "NO_CONFLICT_RESTRICTION", description: "conflictCount===0 조건 제거 (cycleCount===1 AND componentCount===1만 유지)" },
  ];

  return conditions.map(({ condition, description }) => {
    const relaxedPass = gateFunnelRows.filter((r) => relaxedPasses(r, condition));
    const newlyAdmitted = relaxedPass.filter((r) => !r.passesFinalGate);
    const newlyAdmittedShadowSolvable = newlyAdmitted.filter((r) => shadowByLabel.get(r.label)?.shadowSolvable);
    return {
      condition,
      description,
      relaxedGatePassCount: relaxedPass.length,
      newlyAdmittedCount: newlyAdmitted.length,
      newlyAdmittedShadowSolvableCount: newlyAdmittedShadowSolvable.length,
    };
  });
}
