// --- FinalDecision (Parity-Gated Cycle Prototype Sprint v1, Level1-4 +
// Decision A/B/C) -------------------------------------------------------
// Directive's own explicit success/failure criteria, applied mechanically
// to the real measured numbers -- no manual correction ("성공 여부는
// Solver Validation Framework의 Gate와 통계 기준으로만 판정하며, 수동
// 보정은 하지 않는다").
//   Level1: rescue>0 on the Unknown Population (Prototype FULL_CONFIG pass).
//   Level2: no regression (Prototype's own trueRegressionCount === 0).
//   Level3: Capability Improvement statistically significant -- 95% CI
//     lower bound of the paired improvedCount-diff > 0.
//   Level4: Root Cause -- Ablation confirms the core element (Bridge
//     generation, the one genuinely new mechanism this Sprint built) is
//     causally responsible, not incidental: FULL_CONFIG's rescueRate must
//     exceed the "no bridge" variant's rescueRate.
//   Decision A: Level1-4 all PASS.
//   Decision B: Capability increases (Level1 PASS) but CI includes 0
//     (Level3 FAIL) OR Ablation inconclusive (Level4 FAIL).
//   Decision C: Prototype structure itself has no effect (Level1 FAIL).
import type { EvaluationSummary } from "./CapabilityMeasurement";
import type { AblationResult } from "./AblationAnalysis";
import type { PairedComparison } from "./StatisticalValidation";

export interface LevelVerdict {
  level: 1 | 2 | 3 | 4;
  label: string;
  pass: boolean;
  detail: string;
}

export interface FinalDecisionResult {
  levels: LevelVerdict[];
  decision: "A" | "B" | "C";
  rationale: string;
}

export function decideFinal(prototypeSummary: EvaluationSummary, ablation: readonly AblationResult[], comparison: PairedComparison): FinalDecisionResult {
  const level1Pass = prototypeSummary.improvedCount > 0;
  const level1: LevelVerdict = {
    level: 1,
    label: "실제 Rescue 발생 (rescue>0)",
    pass: level1Pass,
    detail: `Unknown Population(n=${prototypeSummary.n})에서 Prototype improvedCount=${prototypeSummary.improvedCount}, rescueRate=${(prototypeSummary.rescueRate * 100).toFixed(1)}%`,
  };

  const level2Pass = prototypeSummary.trueRegressionCount === 0;
  const level2: LevelVerdict = {
    level: 2,
    label: "Regression 없음",
    pass: level2Pass,
    detail: `Prototype trueRegressionCount=${prototypeSummary.trueRegressionCount}/${prototypeSummary.n}`,
  };

  const ciLower = comparison.improvedCountDiffEvaluation.stats.ciLower;
  const level3Pass = ciLower > 0;
  const level3: LevelVerdict = {
    level: 3,
    label: "Capability Improvement 통계적 유의성 (95% CI lower bound > 0)",
    pass: level3Pass,
    detail: `improvedCount paired-diff 95% CI=[${ciLower.toFixed(4)}, ${comparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], Cohen's dz=${comparison.improvedCountDiffEvaluation.effectSize.cohensD.toFixed(3)}`,
  };

  const full = ablation.find((a) => a.config.label === "full(all steps)")!;
  const noBridge = ablation.find((a) => a.config.label.startsWith("no bridge"))!;
  const level4Pass = full.summary.rescueRate > noBridge.summary.rescueRate;
  const level4: LevelVerdict = {
    level: 4,
    label: "Root Cause -- Ablation이 핵심 요소(Bridge)의 인과성 확인",
    pass: level4Pass,
    detail: `full rescueRate=${(full.summary.rescueRate * 100).toFixed(1)}% (improved=${full.summary.improvedCount}) vs no-bridge rescueRate=${(noBridge.summary.rescueRate * 100).toFixed(1)}% (improved=${noBridge.summary.improvedCount})`,
  };

  const levels = [level1, level2, level3, level4];

  let decision: "A" | "B" | "C";
  let rationale: string;
  if (!level1Pass) {
    decision = "C";
    rationale = "Level1 FAIL: Unknown Population에서 Prototype이 단 하나도 rescue하지 못함 -- Prototype 구조 자체가 무효과. Blueprint 재설계 필요.";
  } else if (level1Pass && level2Pass && level3Pass && level4Pass) {
    decision = "A";
    rationale = "Level1-4 전부 PASS -- Parity-Gated Cycle Production Candidate로 승격, 다음 Sprint는 Production Integration Planning Sprint.";
  } else {
    decision = "B";
    const reasons: string[] = [];
    if (!level2Pass) reasons.push("Regression 발생");
    if (!level3Pass) reasons.push("CI가 0을 포함(통계적으로 유의하지 않음)");
    if (!level4Pass) reasons.push("Ablation이 핵심 요소의 인과성을 확인하지 못함(Bridge 제거해도 rescueRate 유지/증가)");
    rationale = `Capability는 증가했으나 (${reasons.join(", ")}) -- Prototype Refinement Sprint 필요.`;
  }

  return { levels, decision, rationale };
}
