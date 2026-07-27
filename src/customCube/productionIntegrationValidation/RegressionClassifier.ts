// --- RegressionClassifier (Production Integration Validation Sprint v1)
// -------------------------------------------------------------------------
// A single-pass "trueRegression" flag (from RegressionAudit.ts, reused
// unmodified) conflates two different situations, because solve() is
// genuinely stochastic (shuffle()-driven, established across this whole
// research arc): a single paired draw where Integrated does worse could be
// (a) a GENUINE, repeatable capability loss on that state, or (b) pure
// single-draw noise on a state where neither arm reliably wins. This
// module distinguishes them by re-running BOTH arms N=10 times on just the
// flip-case snapshots (reusing endToEndSolveProbe unmodified) and comparing
// each arm's own repeat-distribution.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { endToEndSolveProbe, PRE_FINALIZATION_RECOVERY_RESERVE_MS, type EndToEndSolveResult } from "../productionIntegrationFinalization/EndToEndSolveProbe";
import { auditRegressions } from "../productionIntegrationFinalization/RegressionAudit";

export const REGRESSION_REPEAT_TRIALS = 10; // matches this research arc's own N=10 repeatability convention
const TRUE_REGRESSION_MARGIN = 0.5; // half a wrong-wing -- disclosed threshold, not a formal significance test given small per-case n

export interface FlipCaseClassification {
  hash: string;
  singlePassBaselineWrongWingAfter: number;
  singlePassIntegratedWrongWingAfter: number;
  repeatBaselineMeanWrongWingAfter: number;
  repeatIntegratedMeanWrongWingAfter: number;
  meanDiff: number; // integrated - baseline, across repeats (positive = integrated worse)
  verdict: "TRUE_REGRESSION" | "FALSE_REGRESSION";
}

export function classifyFlipCase(snapshot: FailureSnapshot, singlePassBaseline: EndToEndSolveResult, singlePassIntegrated: EndToEndSolveResult): FlipCaseClassification {
  const baselineRepeats: EndToEndSolveResult[] = [];
  const integratedRepeats: EndToEndSolveResult[] = [];
  for (let i = 0; i < REGRESSION_REPEAT_TRIALS; i++) {
    baselineRepeats.push(endToEndSolveProbe(deserializeCube(snapshot.cubeState), snapshot.hash, PRE_FINALIZATION_RECOVERY_RESERVE_MS));
    integratedRepeats.push(endToEndSolveProbe(deserializeCube(snapshot.cubeState), snapshot.hash, undefined));
  }
  const mean = (rs: EndToEndSolveResult[]) => rs.reduce((a, r) => a + r.wrongWingAfter, 0) / rs.length;
  const repeatBaselineMeanWrongWingAfter = mean(baselineRepeats);
  const repeatIntegratedMeanWrongWingAfter = mean(integratedRepeats);
  const meanDiff = repeatIntegratedMeanWrongWingAfter - repeatBaselineMeanWrongWingAfter;
  return {
    hash: snapshot.hash,
    singlePassBaselineWrongWingAfter: singlePassBaseline.wrongWingAfter,
    singlePassIntegratedWrongWingAfter: singlePassIntegrated.wrongWingAfter,
    repeatBaselineMeanWrongWingAfter,
    repeatIntegratedMeanWrongWingAfter,
    meanDiff,
    verdict: meanDiff > TRUE_REGRESSION_MARGIN ? "TRUE_REGRESSION" : "FALSE_REGRESSION",
  };
}

export interface RegressionClassificationSummary {
  singlePassFlipCount: number;
  trueRegressionCount: number;
  falseRegressionCount: number;
  classifications: FlipCaseClassification[];
}

export function classifyAllFlipCases(
  snapshots: readonly FailureSnapshot[],
  baseline: readonly EndToEndSolveResult[],
  integrated: readonly EndToEndSolveResult[]
): RegressionClassificationSummary {
  const audit = auditRegressions(baseline, integrated);
  const flipRows = audit.rows.filter((r) => r.trueRegression);
  const classifications: FlipCaseClassification[] = [];
  for (const row of flipRows) {
    const idx = baseline.findIndex((b) => b.hash === row.hash);
    const snap = snapshots.find((s) => s.hash === row.hash);
    if (idx < 0 || !snap) continue;
    classifications.push(classifyFlipCase(snap, baseline[idx], integrated[idx]));
  }
  return {
    singlePassFlipCount: flipRows.length,
    trueRegressionCount: classifications.filter((c) => c.verdict === "TRUE_REGRESSION").length,
    falseRegressionCount: classifications.filter((c) => c.verdict === "FALSE_REGRESSION").length,
    classifications,
  };
}
