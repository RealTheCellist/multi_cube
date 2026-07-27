// --- PrecisionRecallAnalysis (Recovery Necessity Validation Sprint v1,
// RQ-4) -------------------------------------------------------------------
// Does the current production Recovery Trigger condition actually
// correlate with genuine necessity (NecessityGroundTruthRow.requiresRecovery),
// or does it fire independently of whether Recovery is the only path?
import type { FunnelRow } from "./RecoveryFunnel";

export interface PrecisionRecallResult {
  truePositive: number; // requiresRecovery AND triggered
  falsePositive: number; // !requiresRecovery AND triggered
  falseNegative: number; // requiresRecovery AND !triggered
  trueNegative: number; // !requiresRecovery AND !triggered
  precision: number; // TP / (TP+FP) -- of triggers, how many were actually necessary?
  recall: number; // TP / (TP+FN) -- of necessary cases, how many were triggered?
  f1: number;
  opportunityLossCases: string[]; // requiresRecovery AND !triggered -- labels, for direct inspection
}

export function analyzePrecisionRecall(rows: FunnelRow[]): PrecisionRecallResult {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  const opportunityLossCases: string[] = [];
  for (const r of rows) {
    if (r.requiresRecovery && r.triggered) tp++;
    else if (!r.requiresRecovery && r.triggered) fp++;
    else if (r.requiresRecovery && !r.triggered) {
      fn++;
      opportunityLossCases.push(r.label);
    } else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn, precision, recall, f1, opportunityLossCases };
}
