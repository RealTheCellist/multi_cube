// --- OperatingContract (Parity-Gated Cycle Integration Planning
// Refinement Sprint v1, STEP6 -- Level1-5 + Decision + final Contract)
// -----------------------------------------------------------------------
// Directive's own explicit Level1-5 criteria and Decision A/B/C branches,
// applied mechanically to the real measured numbers -- no manual
// correction.
import type { BudgetResult } from "./BudgetSweep";
import type { DoseResponseSummary } from "./DoseResponse";
import type { ParetoPoint } from "./ParetoAnalysis";
import type { FrameworkValidation } from "./Statistics";

export interface LevelVerdict {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  pass: boolean;
  detail: string;
}

export interface OperatingContractResult {
  levels: LevelVerdict[];
  decision: "A" | "B" | "C";
  rationale: string;
  contract: {
    position: string;
    gate: string;
    budgetMs: number | null;
    fallback: string;
  } | null;
}

export function decideOperatingContract(
  budgetResults: readonly BudgetResult[],
  doseResponse: DoseResponseSummary,
  paretoFrontier: readonly ParetoPoint[],
  candidateFrameworks: readonly FrameworkValidation[] // one per top Pareto candidate tested in STEP5
): OperatingContractResult {
  const level1: LevelVerdict = {
    level: 1,
    label: "Budget Sweep 완료",
    pass: budgetResults.length === 7,
    detail: `실측 완료 Budget 지점 수=${budgetResults.length}/7 (500/750/1000/1250/1500/1750/2000ms, 보간 없음)`,
  };

  const paretoEfficientPoints = paretoFrontier.filter((p) => p.paretoEfficient);
  const level2: LevelVerdict = {
    level: 2,
    label: "Pareto Budget 존재",
    pass: paretoEfficientPoints.length > 0,
    detail: `Pareto-efficient budget 수=${paretoEfficientPoints.length}/${paretoFrontier.length}: ${paretoEfficientPoints.map((p) => `${p.budgetMs}ms(improved=${p.improvedCount},runtime=${p.avgRuntimeMsAmongMatched.toFixed(0)}ms)`).join(", ") || "없음"}`,
  };

  const significantCandidates = candidateFrameworks.filter((f) => {
    const gateC = f.gateResults.find((g) => g.gate === "C");
    return gateC?.status === "PASS";
  });
  const level3: LevelVerdict = {
    level: 3,
    label: "Capability 개선 통계적으로 유의",
    pass: significantCandidates.length > 0,
    detail:
      significantCandidates.length > 0
        ? `유의미한 Pareto 후보 Budget: ${significantCandidates.map((f) => `${f.budgetMs}ms`).join(", ")}`
        : `테스트된 Pareto 후보 ${candidateFrameworks.map((f) => f.budgetMs + "ms").join(", ")} 전부 Gate C(Capability) 미통과`,
  };

  const noRegressionCandidates = candidateFrameworks.filter((f) => {
    const gateA = f.gateResults.find((g) => g.gate === "A");
    return gateA?.status === "PASS";
  });
  const level4: LevelVerdict = {
    level: 4,
    label: "Regression 없음",
    pass: noRegressionCandidates.length === candidateFrameworks.length,
    detail: `Gate A(Regression) PASS 후보 수=${noRegressionCandidates.length}/${candidateFrameworks.length}`,
  };

  const finalCandidate = candidateFrameworks.find((f) => significantCandidates.includes(f) && noRegressionCandidates.includes(f));
  const level5Pass = finalCandidate !== undefined;
  const level5: LevelVerdict = {
    level: 5,
    label: "Operating Contract 확정",
    pass: level5Pass,
    detail: level5Pass ? `확정 Budget=${finalCandidate!.budgetMs}ms` : "Level3/4를 동시에 만족하는 Budget 없음 -- Contract 미확정",
  };

  const levels = [level1, level2, level3, level4, level5];

  let decision: "A" | "B" | "C";
  let rationale: string;
  let contract: OperatingContractResult["contract"] = null;

  if (!doseResponse.anyImprovementAcrossWholeRange) {
    decision = "C";
    rationale = "Budget을 500ms에서 2000ms까지 늘려도 improvedCount가 전혀 증가하지 않음 (전 구간 Improvement 없음) -- Prototype 재설계 필요.";
  } else if (level1.pass && level2.pass && level3.pass && level4.pass && level5.pass) {
    decision = "A";
    rationale = `Level1-5 전부 PASS -- Budget=${finalCandidate!.budgetMs}ms로 Operating Contract 확정. 다음 Sprint는 Parity-Gated Cycle Production Integration Sprint v1.`;
    contract = {
      position: "after_CCR (remainingTime Budget Contract, Integration Planning Sprint v1 확정)",
      gate: "componentCount>1 (G3, Integration Planning Sprint v1 확정)",
      budgetMs: finalCandidate!.budgetMs,
      fallback: "Gate 불일치 또는 Budget 내 미해결 시 SETUP 등 후속 후보로 폴백 -- 기존 스케줄러의 인수 순서를 그대로 따름 (continue Recovery)",
    };
  } else {
    decision = "B";
    const reasons: string[] = [];
    if (!level2.pass) reasons.push("Pareto 후보 없음");
    if (!level3.pass) reasons.push("통계적으로 유의한 후보 없음");
    if (!level4.pass) reasons.push("일부 후보에서 Regression 발생");
    if (!level5.pass && reasons.length === 0) reasons.push("Level3/4를 동시에 만족하는 Budget 없음");
    rationale = `Pareto 후보는 존재하나 (${reasons.join(", ")}) -- Planning Refinement v2 필요.`;
  }

  return { levels, decision, rationale, contract };
}
