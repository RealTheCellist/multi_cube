// --- CostBenefitMatrix (Parity-Gated Cycle Alternative Primitive
// Blueprint Sprint v1, STEP5) --------------------------------------------------
// Derives numeric Capability/Complexity/Risk/Production Impact scores
// FROM STEP3(StructuralFeasibility)/STEP4(CounterfactualCapabilityAnalysis)'s
// own data (not separately hand-picked), then computes a real Pareto
// dominance check over the 4 candidates -- no mechanism is implemented
// here, this is pure comparison of the STEP1-4 analysis.
import type { MechanismId } from "./AlternativeMechanisms";
import type { FeasibilityEntry } from "./StructuralFeasibility";
import type { TheoreticalCapabilityEstimate } from "./CounterfactualCapabilityAnalysis";

function layerImpactWeight(impact: "none" | "low" | "medium" | "high"): number {
  return impact === "none" ? 0 : impact === "low" ? 1 : impact === "medium" ? 2 : 3;
}

function confidenceRiskWeight(level: "grounded" | "qualitative" | "speculative"): number {
  return level === "grounded" ? 1 : level === "qualitative" ? 2 : 3;
}

export interface CostBenefitRow {
  mechanismId: MechanismId;
  capabilityScore: number; // midpoint of STEP4's estimatedResolutionPercentRange
  complexityScore: number; // sum of STEP3 layerImpact weights (none=0/low=1/medium=2/high=3) across 4 layers
  riskScore: number; // STEP4 confidenceLevel weight + loop/divergence-risk flag
  productionImpactScore: number; // count of distinct real Production files cited in STEP3's productionModificationScope that are NOT purely new Prototype-directory files
  loopOrDivergenceRisk: boolean;
}

const LOOP_OR_DIVERGENCE_RISK: Record<MechanismId, boolean> = {
  DUAL_WING_BRIDGE: false,
  BRIDGE_CHAIN: true, // STEP2's own rationale: repeated application with no guaranteed convergence direction
  TEMPORARY_EXPANSION: true, // STEP2's own rationale: no defined stopping criterion until a "distance" metric is designed
  MULTI_COMPONENT_MERGE: false,
};

function productionImpactFromScope(scope: readonly string[]): number {
  // Faithful to STEP3's own conclusion per entry, not a crude keyword
  // fallback: a scope entry counts as HIGH impact(2) only if it names a
  // real protected production file WITHOUT the "Production 자체는
  // 무변경 가능" disclaimer; MEDIUM(1) if it flags that no concrete
  // production file can even be named yet (design not mature enough to
  // scope); ZERO if it explicitly disclaims Production impact.
  let score = 0;
  for (const s of scope) {
    const namesRealProductionFile = /fiveByFiveEdgeRecovery\.ts|fiveByFiveEdgePlanner\.ts|fiveByFiveEdgeExecutor\.ts|fiveByFiveEdgeSolverEngine\.ts|fiveByFiveEdges\.ts/.test(s);
    const disclaimsProductionImpact = s.includes("Production 자체는 무변경");
    if (namesRealProductionFile && !disclaimsProductionImpact) score += 2;
    else if (s.includes("Production 파일 특정 불가")) score += 1;
  }
  return score;
}

export function buildCostBenefitMatrix(feasibility: readonly FeasibilityEntry[], capability: readonly TheoreticalCapabilityEstimate[]): CostBenefitRow[] {
  return feasibility.map((f) => {
    const cap = capability.find((c) => c.mechanismId === f.mechanismId)!;
    const capabilityScore = (cap.estimatedResolutionPercentRange[0] + cap.estimatedResolutionPercentRange[1]) / 2;
    const complexityScore = f.layerImpacts.reduce((s, l) => s + layerImpactWeight(l.impact), 0);
    const loopOrDivergenceRisk = LOOP_OR_DIVERGENCE_RISK[f.mechanismId];
    const riskScore = confidenceRiskWeight(cap.confidenceLevel) + (loopOrDivergenceRisk ? 1 : 0);
    const productionImpactScore = productionImpactFromScope(f.productionModificationScope);
    return { mechanismId: f.mechanismId, capabilityScore, complexityScore, riskScore, productionImpactScore, loopOrDivergenceRisk };
  });
}

// Pareto dominance: A dominates B iff A is at-least-as-good on every axis
// (capability higher-or-equal is good; complexity/risk/productionImpact
// lower-or-equal is good) AND strictly better on at least one axis.
function dominates(a: CostBenefitRow, b: CostBenefitRow): boolean {
  const atLeastAsGood = a.capabilityScore >= b.capabilityScore && a.complexityScore <= b.complexityScore && a.riskScore <= b.riskScore && a.productionImpactScore <= b.productionImpactScore;
  const strictlyBetter = a.capabilityScore > b.capabilityScore || a.complexityScore < b.complexityScore || a.riskScore < b.riskScore || a.productionImpactScore < b.productionImpactScore;
  return atLeastAsGood && strictlyBetter;
}

export interface ParetoResult {
  frontier: MechanismId[]; // non-dominated mechanisms
  dominatedBy: Partial<Record<MechanismId, MechanismId[]>>; // which mechanisms dominate a given (dominated) one
}

export function computeParetoFrontier(rows: readonly CostBenefitRow[]): ParetoResult {
  const dominatedBy: Partial<Record<MechanismId, MechanismId[]>> = {};
  for (const candidate of rows) {
    const dominators = rows.filter((other) => other.mechanismId !== candidate.mechanismId && dominates(other, candidate)).map((o) => o.mechanismId);
    if (dominators.length > 0) dominatedBy[candidate.mechanismId] = dominators;
  }
  const frontier = rows.filter((r) => !dominatedBy[r.mechanismId]).map((r) => r.mechanismId);
  return { frontier, dominatedBy };
}
