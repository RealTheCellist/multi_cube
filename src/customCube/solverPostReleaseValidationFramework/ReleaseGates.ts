// --- ReleaseGates (Solver Post-Release Validation Framework Sprint v1,
// STEP4) -------------------------------------------------------------------
// The five Gates the Directive names (A-E), as typed predicate functions
// over a KpiSnapshot pair + its MetricEvaluation. Any future Solver change
// (see ChangeClassification.ts for which Gates a given change Category
// must clear) is judged by running its own KpiSnapshot pairs through
// these Gates -- not by inventing new ad hoc thresholds per Sprint, the
// same standardization goal as KpiDefinitions.ts's evaluatePairedDiff.
import { isNonRegressive, isSignificantImprovement, type KpiSnapshot, type MetricEvaluation } from "./KpiDefinitions";

export type GateId = "A" | "B" | "C" | "D" | "E";

export interface GateResult {
  gate: GateId;
  name: string;
  status: "PASS" | "FAIL" | "OPEN_QUESTION";
  evidence: string;
}

// Gate A: Regression 증가 없음
export function evaluateGateA(trueRegressionDiff: MetricEvaluation, falseRegressionDiff: MetricEvaluation): GateResult {
  const ok = isNonRegressive(trueRegressionDiff) && isNonRegressive(falseRegressionDiff);
  return {
    gate: "A",
    name: "Regression 증가 없음",
    status: ok ? "PASS" : "FAIL",
    evidence: `True Regression diff mean=${trueRegressionDiff.stats.mean.toFixed(3)}, CI=[${trueRegressionDiff.stats.ciLower.toFixed(3)}, ${trueRegressionDiff.stats.ciUpper.toFixed(
      3
    )}]; False Regression diff mean=${falseRegressionDiff.stats.mean.toFixed(3)}, CI=[${falseRegressionDiff.stats.ciLower.toFixed(3)}, ${falseRegressionDiff.stats.ciUpper.toFixed(3)}].`,
  };
}

// Gate B: Runtime 허용 범위 (disclosed default tolerance: p95 diff must not
// exceed +15% of the current Baseline p95 -- matches the tolerance band
// this arc's own Scheduler Sprints already used; callers may pass a
// tighter one).
export function evaluateGateB(runtimeDiffMsEvaluation: MetricEvaluation, baselineP95Ms: number, toleranceFactor = 1.15): GateResult {
  const thresholdMs = baselineP95Ms * (toleranceFactor - 1);
  const ok = runtimeDiffMsEvaluation.stats.mean <= thresholdMs || runtimeDiffMsEvaluation.stats.ciUpper <= thresholdMs;
  return {
    gate: "B",
    name: "Runtime 허용 범위",
    status: ok ? "PASS" : "OPEN_QUESTION",
    evidence: `Runtime diff mean=${runtimeDiffMsEvaluation.stats.mean.toFixed(1)}ms, 95% CI=[${runtimeDiffMsEvaluation.stats.ciLower.toFixed(1)}, ${runtimeDiffMsEvaluation.stats.ciUpper.toFixed(
      1
    )}] (허용 기준: Baseline p95=${baselineP95Ms}ms 대비 +${((toleranceFactor - 1) * 100).toFixed(0)}%=${thresholdMs.toFixed(0)}ms 이내).`,
  };
}

// Gate C: Capability 감소 없음 (default, strict=false: does NOT require
// significant improvement -- only that the diff isn't significantly
// negative). Strict mode (strict=true, added by Solver Validation
// Framework Qualification Refinement Sprint v1 STEP2) additionally
// requires isSignificantImprovement() to reach PASS -- a "not worse but
// not significantly better" result becomes OPEN_QUESTION rather than a
// free PASS, closing the False PASS the Qualification Sprint found
// (Incremental Recovery Production Integration Sprint v1: notWorse held
// but isSignificantImprovement was false, and the real Sprint's own
// Decision was B, not A). Reuses isSignificantImprovement() as instructed
// -- no new statistical function.
export function evaluateGateC(improvedCountDiffEvaluation: MetricEvaluation, strict = false): GateResult {
  const notWorse = improvedCountDiffEvaluation.stats.ciUpper >= 0 || improvedCountDiffEvaluation.stats.mean >= 0;
  const significant = isSignificantImprovement(improvedCountDiffEvaluation);
  const status: GateResult["status"] = strict ? (significant ? "PASS" : notWorse ? "OPEN_QUESTION" : "FAIL") : notWorse ? "PASS" : "FAIL";
  return {
    gate: "C",
    name: "Capability 감소 없음",
    status,
    evidence: `성공 케이스 diff mean=${improvedCountDiffEvaluation.stats.mean.toFixed(2)}, 95% CI=[${improvedCountDiffEvaluation.stats.ciLower.toFixed(
      2
    )}, ${improvedCountDiffEvaluation.stats.ciUpper.toFixed(2)}], Cohen's d_z=${improvedCountDiffEvaluation.effectSize.cohensD.toFixed(2)}(${
      improvedCountDiffEvaluation.effectSize.magnitude
    }). 유의미한 개선(${significant ? "YES" : "no -- 감소 없음만 확인, 개선 유의성은 별도 판단 필요"})${
      strict ? ` [strict mode: ${status}]` : ""
    }.`,
  };
}

// Gate D: Operating Contract 유지 -- caller supplies the ContractAudit-style
// pass/fail rows (see solverReleaseReadiness/ContractAudit.ts's own
// pattern) and this just aggregates them; the actual per-contract checks
// are necessarily specific to what changed, so they aren't hardcoded here.
export function evaluateGateD(contractChecks: readonly { contract: string; status: "PASS" | "FAIL" }[]): GateResult {
  const failing = contractChecks.filter((c) => c.status === "FAIL");
  return {
    gate: "D",
    name: "Operating Contract 유지",
    status: failing.length === 0 ? "PASS" : "FAIL",
    evidence:
      failing.length === 0
        ? `${contractChecks.length}개 Contract 전부 PASS.`
        : `FAIL: ${failing.map((c) => c.contract).join(", ")}.`,
  };
}

// Gate E: Primitive Interaction 이상 없음 -- Duplicate/Starvation counts,
// same fields solverReleaseReadiness/PrimitiveInteractionMatrix.ts already
// computes per snapshot.
export function evaluateGateE(snapshot: Pick<KpiSnapshot, "duplicateCount" | "starvedTypeCount">): GateResult {
  const ok = snapshot.duplicateCount === 0 && snapshot.starvedTypeCount === 0;
  return {
    gate: "E",
    name: "Primitive Interaction 이상 없음",
    status: ok ? "PASS" : "OPEN_QUESTION",
    evidence: `Duplicate=${snapshot.duplicateCount}건, Starved Type=${snapshot.starvedTypeCount}개.`,
  };
}

export function allGatesPass(results: readonly GateResult[]): boolean {
  return results.every((r) => r.status === "PASS");
}

export function anyGateFails(results: readonly GateResult[]): boolean {
  return results.some((r) => r.status === "FAIL");
}
