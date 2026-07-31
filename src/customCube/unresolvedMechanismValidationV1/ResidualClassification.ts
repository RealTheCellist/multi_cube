// --- ResidualClassification (Solver Primitive Discovery Sprint #5 --
// Unresolved Mechanism Validation Sprint v1, STEP4) --------------------------
// Directive's own 4-way split, in priority order (each case gets exactly
// one classification, the first that applies):
//   EXISTING_SINGLE_PRIMITIVE -- a DIFFERENT existing Primitive (not the
//     one the case's own source Sprint already exhaustively swept) solves
//     or improves it alone. Reported separately from "COMBINATION" because
//     it needs no combination logic at all -- just running the right
//     already-existing Primitive.
//   EXISTING_COMBINATION -- solved/improved only by chaining two
//     Primitives where the second didn't match the ORIGINAL state at all.
//   EXISTING_ORDERING -- solved/improved by chaining two Primitives where
//     the second already matched the original state alone, but scheduling
//     order determined success.
//   EXISTING_BUDGET -- none of the above at the standard 400ms deadline,
//     but a longer deadline (3000ms) on some existing Primitive helped.
//   TRULY_UNKNOWN -- none of the above, at any budget tried.
import type { CaseAttribution } from "./ExistingPrimitiveAttribution";
import type { CaseCombinationResult } from "./CounterfactualCombination";
import type { BudgetCheckResult } from "./BudgetSensitivityCheck";

export type ResidualCategory = "EXISTING_SINGLE_PRIMITIVE" | "EXISTING_COMBINATION" | "EXISTING_ORDERING" | "EXISTING_BUDGET" | "TRULY_UNKNOWN";

export interface ResidualClassificationResult {
  label: string;
  sourceBlueprint: string;
  category: ResidualCategory;
  evidence: string;
}

export function classifyResidual(attribution: CaseAttribution, combo: CaseCombinationResult, budget: BudgetCheckResult): ResidualClassificationResult {
  if (attribution.anyImprovedAlone) {
    const helper = Object.entries(attribution.attempts).find(([, a]) => a.improvedAlone)?.[0];
    return { label: attribution.label, sourceBlueprint: attribution.sourceBlueprint, category: "EXISTING_SINGLE_PRIMITIVE", evidence: `${helper} alone improves this case (previously untried against this population)` };
  }

  if (combo.bestCombo) {
    const category: ResidualCategory = combo.bestCombo.classification === "COMBINATION" ? "EXISTING_COMBINATION" : "EXISTING_ORDERING";
    const outcome = combo.bestCombo.solvedByCombo ? "solves" : "improves";
    return { label: attribution.label, sourceBlueprint: attribution.sourceBlueprint, category, evidence: `${combo.bestCombo.first} -> ${combo.bestCombo.second} sequence ${outcome} this case (${combo.combosTried} combos tried)` };
  }

  if (budget.improvedAtExtendedBudget) {
    return { label: attribution.label, sourceBlueprint: attribution.sourceBlueprint, category: "EXISTING_BUDGET", evidence: `${budget.primitiveThatHelped} improves this case only at extended deadline (3000ms vs 400ms)` };
  }

  return { label: attribution.label, sourceBlueprint: attribution.sourceBlueprint, category: "TRULY_UNKNOWN", evidence: "no existing Primitive, combination, ordering, or extended budget produced any improvement" };
}

export function classifyAllResiduals(attributions: readonly CaseAttribution[], combos: readonly CaseCombinationResult[], budgetChecks: readonly BudgetCheckResult[]): ResidualClassificationResult[] {
  const comboByLabel = new Map(combos.map((c) => [c.label, c]));
  const budgetByLabel = new Map(budgetChecks.map((b) => [b.label, b]));
  return attributions.map((a) => classifyResidual(a, comboByLabel.get(a.label)!, budgetByLabel.get(a.label) ?? { label: a.label, solvedAtExtendedBudget: false, improvedAtExtendedBudget: false, primitiveThatHelped: null }));
}
