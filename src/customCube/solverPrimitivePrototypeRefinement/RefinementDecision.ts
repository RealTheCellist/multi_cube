// --- RefinementDecision (Solver Primitive Prototype Refinement Sprint v1)
// STEP4: applies this Sprint's own Level 1~3 criteria to the STEP1~3
// comparison data (plus an optional STEP4 combined-strategy variant, if
// the driver built one) and reaches the required A/B/C conclusion.
//   Level 1: Mechanism이 유지된다 -- checked directly against A2
//     (noConflictGate, the loosest honest boundary case): if dropping the
//     conflictEdgeCount requirement does NOT reduce Precision below
//     baseline, the conflict-edge distinction Blueprint/Prototype Sprint
//     v2~v3 established would be contradicted by this Sprint's own data,
//     not just "insufficiently improved."
//   Level 2: Gap Rescue가 3건 이상으로 증가한다 -- checked against every
//     non-baseline variant (Gate, Success, and combined if present).
//   Level 3: Regression 증가 없이 Coverage 증가 OR Gate 내부 Success
//     Rate(Precision) 증가 중 하나 이상 -- checked the same way.
import type { VariantMetrics } from "./VariantEvaluation";

const LEVEL2_MIN_GAP_RESCUE = 3;

export type FinalDecision = "A" | "B" | "C";

export interface RefinementOutcome {
  decision: FinalDecision;
  rationale: string;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
  bestVariant: VariantMetrics | null;
}

export function decideOutcome(baseline: VariantMetrics, nonBaselineVariants: readonly VariantMetrics[]): RefinementOutcome {
  const noConflictVariant = nonBaselineVariants.find((v) => v.variantName.includes("noConflictGate"));
  const level1Pass = !noConflictVariant || noConflictVariant.precision < baseline.precision;

  // Coarsening-flagged variants (A2: drops the Blueprint's own validated
  // conflictEdgeCount>0 precondition entirely) are reported like any other
  // variant but are NOT eligible to satisfy Level2/Level3/"best" -- a
  // strict-superset widening trivially gains Coverage/GapRescue by
  // definition, which is not the same as a genuinely new capability. This
  // mirrors the isOldBlueprint/isBareGate exclusion pattern this project's
  // methodology has used since the Blueprint Reanalysis Sprint.
  const eligible = nonBaselineVariants.filter((v) => !v.isCoarseningBoundary);

  const bestByRescue = eligible.reduce<VariantMetrics | null>((best, v) => (!best || v.gapRescueCount > best.gapRescueCount ? v : best), null);
  const level2Pass = !!bestByRescue && bestByRescue.gapRescueCount >= LEVEL2_MIN_GAP_RESCUE;

  const level3Candidates = eligible.filter((v) => v.regressionCount === 0 && (v.coverage > baseline.coverage || v.precision > baseline.precision));
  const level3Pass = level3Candidates.length > 0;

  const bestOverall = eligible.reduce<VariantMetrics | null>((best, v) => {
    if (v.regressionCount > 0) return best;
    if (!best) return v;
    if (v.gapRescueCount !== best.gapRescueCount) return v.gapRescueCount > best.gapRescueCount ? v : best;
    return v.precision > best.precision ? v : best;
  }, null);

  const coarseningVariant = nonBaselineVariants.find((v) => v.isCoarseningBoundary);
  const coarseningNote = coarseningVariant
    ? ` (참고: "${coarseningVariant.variantName}"는 GapRescue ${coarseningVariant.gapRescueCount}건/Coverage ${(coarseningVariant.coverage * 100).toFixed(1)}%로 수치상으로는 더 높지만, Blueprint가 검증한 conflictEdgeCount>0 조건 자체를 제거한 변형이라 Precision이 ${(coarseningVariant.precision * 100).toFixed(1)}%로 baseline보다 낮다 -- 정당한 개선이 아닌 단순 확장(coarsening)으로 판단해 승자 후보에서 제외했다.)`
    : "";

  if (!level1Pass) {
    return {
      decision: "C",
      rationale: `Gate에서 conflictEdgeCount 조건을 제거한 변형(${noConflictVariant?.variantName})의 Precision(${((noConflictVariant?.precision ?? 0) * 100).toFixed(1)}%)이 baseline(${(baseline.precision * 100).toFixed(1)}%)보다 낮지 않았다 -- Conflict Edge 유무에 따른 메커니즘 구분이 이번 확장 실험에서는 유지되지 않는다. Gate 확장 방향의 Capability 확대는 이 형태로는 성립하지 않는다.`,
      level1Pass,
      level2Pass,
      level3Pass,
      bestVariant: bestOverall,
    };
  }

  if (!level2Pass) {
    // A legitimate (non-coarsening) variant showing SOME real improvement
    // (Level3-style: Precision or Coverage up, zero Regression) even
    // though it doesn't cross the Gap Rescue bar is a meaningfully
    // different finding from "nothing worked at all" -- the former still
    // has real headroom worth another Refinement pass (B), the latter
    // supports the stronger "confirmed impossible" claim (C) Sprint exit
    // condition C's wording actually requires.
    const anyLegitimateImprovement = level3Candidates.length > 0;
    if (anyLegitimateImprovement) {
      return {
        decision: "B",
        rationale: `메커니즘 구분은 유지되었으나(Level1 PASS), 정당한(coarsening 아닌) 변형 중 Gap Rescue를 ${LEVEL2_MIN_GAP_RESCUE}건 이상으로 끌어올린 것은 없다(최고 ${bestByRescue?.gapRescueCount ?? 0}건, ${bestByRescue?.variantName ?? "N/A"}). 다만 "${level3Candidates[0].variantName}"가 Regression 없이 baseline 대비 Coverage(${(baseline.coverage * 100).toFixed(1)}%→${(level3Candidates[0].coverage * 100).toFixed(1)}%)/Precision(${(baseline.precision * 100).toFixed(1)}%→${(level3Candidates[0].precision * 100).toFixed(1)}%)을 개선하는 실질적 신호를 보였다 -- 아직 기준 미달이지만 이 방향에 더 시도할 여지가 있어 추가 Prototype 보완이 필요하다.${coarseningNote}`,
        level1Pass,
        level2Pass,
        level3Pass,
        bestVariant: bestOverall,
      };
    }
    return {
      decision: "C",
      rationale: `메커니즘 구분은 유지되었으나(Level1 PASS), Strategy A/B의 정당한(coarsening 아닌) 변형 중 Gap Rescue를 ${LEVEL2_MIN_GAP_RESCUE}건 이상으로 끌어올린 것도, Regression 없이 Coverage/Precision을 baseline보다 높인 것도 없었다 -- 메커니즘은 맞지만 이 두 방향(Gate 확장/탐색 최적화)으로는 Capability 확장이 불가능함을 확인했다.${coarseningNote}`,
      level1Pass,
      level2Pass,
      level3Pass,
      bestVariant: bestOverall,
    };
  }

  if (!level3Pass) {
    return {
      decision: "B",
      rationale: `Gap Rescue 기준은 충족했으나(Level2 PASS, ${bestByRescue?.variantName} ${bestByRescue?.gapRescueCount}건), 정당한(coarsening 아닌) 변형 중 Regression 증가 없이 Coverage 또는 Gate 내부 Success Rate를 baseline보다 높인 것이 없다 -- 추가 Prototype 보완이 필요하다.${coarseningNote}`,
      level1Pass,
      level2Pass,
      level3Pass,
      bestVariant: bestOverall,
    };
  }

  const improvedAxis = bestOverall && bestOverall.coverage > baseline.coverage ? "Coverage" : "Gate 내부 Success Rate(Precision)";
  return {
    decision: "A",
    rationale: `"${bestOverall?.variantName}"(coarsening 아닌 정당한 변형)가 Regression 없이 Gap Rescue ${bestOverall?.gapRescueCount}건(기준 ${LEVEL2_MIN_GAP_RESCUE}건 이상)을 달성했고, baseline 대비 ${improvedAxis}를 높였다(Coverage ${(baseline.coverage * 100).toFixed(1)}%→${((bestOverall?.coverage ?? 0) * 100).toFixed(1)}%, Precision ${(baseline.precision * 100).toFixed(1)}%→${((bestOverall?.precision ?? 0) * 100).toFixed(1)}%) -- Integration 가능한 Prototype을 확보했다.${coarseningNote}`,
    level1Pass,
    level2Pass,
    level3Pass,
    bestVariant: bestOverall,
  };
}

export interface MultiRunOutcome extends RefinementOutcome {
  perRunDecisions: FinalDecision[];
}

// existingPrimitivesAllFail (VariantEvaluation.ts's Gap ground truth)
// calls BASE, which is disclosed Math.random()-seeded -- so even with the
// within-run sharing fix (computeGapClassification called once per run),
// the Gap classification itself can still differ BETWEEN independent
// Sprint runs. With GapRescue counts hovering right at the Level2 bar (2
// vs 3), a single run is not enough to trust -- this mirrors Blueprint
// Sprint v2's own dominatesOldBlueprintEveryRun discipline: only accept
// decision A if it is reached independently, every time, across multiple
// full re-runs of the whole comparison.
export function decideOutcomeAcrossRuns(perRunOutcomes: readonly RefinementOutcome[]): MultiRunOutcome {
  const perRunDecisions = perRunOutcomes.map((o) => o.decision);
  const allLevel1Pass = perRunOutcomes.every((o) => o.level1Pass);
  const allA = perRunOutcomes.every((o) => o.decision === "A");
  const anyA = perRunOutcomes.some((o) => o.decision === "A");
  const anyLevel3Signal = perRunOutcomes.some((o) => o.level3Pass);
  const lastBestVariant = [...perRunOutcomes].reverse().find((o) => o.bestVariant)?.bestVariant ?? null;

  if (allA) {
    return {
      decision: "A",
      rationale: `${perRunOutcomes.length}회 독립 재실행 전부에서 decision A로 일관되게 도달했다(${perRunDecisions.join(", ")}). ${perRunOutcomes[perRunOutcomes.length - 1].rationale}`,
      level1Pass: allLevel1Pass,
      level2Pass: true,
      level3Pass: true,
      bestVariant: lastBestVariant,
      perRunDecisions,
    };
  }

  if (anyA || anyLevel3Signal) {
    return {
      decision: "B",
      rationale: `${perRunOutcomes.length}회 독립 재실행 결과가 일관되지 않았다(${perRunDecisions.join(", ")}) -- Gap 분류 자체에 쓰이는 BASE의 Math.random() 변동성 때문으로 보인다. 일부 실행에서는 decision A 또는 Level3 개선 신호가 나타났지만, 매 실행마다 재현되지는 않아 아직 Integration을 확정할 만큼 안정적이지 않다 -- 추가 Prototype 보완이 필요하다.`,
      level1Pass: allLevel1Pass,
      level2Pass: perRunOutcomes.some((o) => o.level2Pass),
      level3Pass: perRunOutcomes.some((o) => o.level3Pass),
      bestVariant: lastBestVariant,
      perRunDecisions,
    };
  }

  return {
    decision: "C",
    rationale: `${perRunOutcomes.length}회 독립 재실행 전부에서 Level2/Level3를 충족하는 정당한 변형을 찾지 못했다(${perRunDecisions.join(", ")}) -- 메커니즘은 유지되지만(Level1 PASS) 이 두 방향(Gate 확장/탐색 최적화)으로는 Capability 확장이 불가능함을 확인했다.`,
    level1Pass: allLevel1Pass,
    level2Pass: false,
    level3Pass: false,
    bestVariant: null,
    perRunDecisions,
  };
}
