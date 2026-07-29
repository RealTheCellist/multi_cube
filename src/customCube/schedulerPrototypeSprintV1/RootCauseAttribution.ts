// --- RootCauseAttribution (CONFLICT_DEEP_DEPENDENCY Scheduler Prototype
// Sprint v1, STEP3) -------------------------------------------------------
// For any case that still shows a singlePassFlip (candidate wrongWingAfter
// worse than baseline in at least one repeat) after STEP1's Scheduler
// Ordering change, classifies which candidate TYPE was actually chosen in
// the Candidate arm's flipped repeats -- directly answering the Directive's
// "SETUP/CCR/Budget/Scheduler" root-cause breakdown using data this Sprint's
// own ProductionReplayCollector already captures (candidateChosenType per
// repeat), no new probing needed.
import type { RunRecord, PerCaseRunRecord } from "./ProductionReplayCollector";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export interface FlippedCaseAttribution {
  label: string;
  flipCount: number; // repeats where candidateWrongWingAfter > baselineWrongWingAfter
  chosenTypeOnFlip: Partial<Record<RecoveryType | "none", number>>; // distribution of candidateChosenType among the flipped repeats
}

export function attributeRootCause(runs: readonly RunRecord[]): FlippedCaseAttribution[] {
  const byLabel = new Map<string, PerCaseRunRecord[]>();
  for (const run of runs) {
    for (const r of run) {
      const list = byLabel.get(r.label) ?? [];
      list.push(r);
      byLabel.set(r.label, list);
    }
  }

  const result: FlippedCaseAttribution[] = [];
  for (const [label, records] of byLabel) {
    const flipped = records.filter((r) => r.candidateWrongWingAfter > r.baselineWrongWingAfter);
    if (flipped.length === 0) continue;
    const chosenTypeOnFlip: Partial<Record<RecoveryType | "none", number>> = {};
    for (const r of flipped) chosenTypeOnFlip[r.candidateChosenType] = (chosenTypeOnFlip[r.candidateChosenType] ?? 0) + 1;
    result.push({ label, flipCount: flipped.length, chosenTypeOnFlip });
  }
  return result;
}

export interface RootCauseSummary {
  totalFlippedCases: number;
  attributedToSetup: number; // cases where SETUP was the chosen type in >=1 flipped repeat
  attributedToOther: number; // cases where a non-SETUP/none type was chosen (e.g. CCR/MIXED_COMMUTATOR -- points to Budget/Scheduler timing rather than SETUP itself)
}

export function summarizeRootCause(attributions: readonly FlippedCaseAttribution[]): RootCauseSummary {
  const attributedToSetup = attributions.filter((a) => (a.chosenTypeOnFlip.SETUP ?? 0) > 0).length;
  const attributedToOther = attributions.filter((a) => (a.chosenTypeOnFlip.SETUP ?? 0) === 0).length;
  return { totalFlippedCases: attributions.length, attributedToSetup, attributedToOther };
}
