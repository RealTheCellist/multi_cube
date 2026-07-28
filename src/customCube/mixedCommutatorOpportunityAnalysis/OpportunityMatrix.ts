// --- OpportunityMatrix (Mixed Commutator Opportunity Analysis Sprint v1,
// Required Measurement #4, RQ-5) ---------------------------------------------
import type { GateFunnelRow, PopulationTag } from "./GateFunnel";
import type { ShadowEvaluationRow } from "./ShadowEvaluation";

export interface OpportunityMatrixRow {
  population: PopulationTag | "ALL";
  eligible: number; // passesFinalGate -- actually attempted by the real Gate
  improved: number; // eligible AND generated AND improved -- actually succeeded
  potentiallySolvable: number; // shadowSolvable (Gate entirely bypassed)
  lost: number; // shadowSolvable AND NOT eligible -- excluded by the Gate despite being solvable
}

function buildRow(population: PopulationTag | "ALL", gateRows: readonly GateFunnelRow[], shadowByLabel: Map<string, ShadowEvaluationRow>): OpportunityMatrixRow {
  const eligible = gateRows.filter((r) => r.passesFinalGate).length;
  const improved = gateRows.filter((r) => r.passesFinalGate && r.improved).length;
  const potentiallySolvable = gateRows.filter((r) => shadowByLabel.get(r.label)?.shadowSolvable).length;
  const lost = gateRows.filter((r) => !r.passesFinalGate && shadowByLabel.get(r.label)?.shadowSolvable).length;
  return { population, eligible, improved, potentiallySolvable, lost };
}

export function buildOpportunityMatrix(gateFunnelRows: readonly GateFunnelRow[], shadowRows: readonly ShadowEvaluationRow[]): OpportunityMatrixRow[] {
  const shadowByLabel = new Map(shadowRows.map((r) => [r.label, r]));
  const populations: PopulationTag[] = ["PRIMARY", "SECONDARY_ONLY", "REGRESSION"];
  const rows = populations.map((p) => buildRow(p, gateFunnelRows.filter((r) => r.populationTag === p), shadowByLabel));
  rows.push(buildRow("ALL", gateFunnelRows, shadowByLabel));
  return rows;
}

/** RQ-5: Opportunity Loss = Potentially Solvable - Actually Attempted
 * (== Eligible, since every Gate-passing case is actually attempted by
 * genMixedCommutator). */
export interface OpportunityLossSummary {
  potentiallySolvable: number;
  actuallyAttempted: number;
  opportunityLoss: number;
}

export function computeOpportunityLoss(allRow: OpportunityMatrixRow): OpportunityLossSummary {
  return {
    potentiallySolvable: allRow.potentiallySolvable,
    actuallyAttempted: allRow.eligible,
    opportunityLoss: allRow.potentiallySolvable - allRow.eligible,
  };
}
