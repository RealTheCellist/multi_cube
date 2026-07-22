// --- EvaluationBlueprintRevision (Incremental Recovery Architecture
// Blueprint Revision Sprint v1) --------------------------------------------
// STEP4. Redefines the relationship between whole-cube-solved and
// task-level Capability, and proposes a standard 5-metric evaluation
// framework for every future Incremental Recovery Sprint -- grounded in
// Prototype Sprint v1's own floor-effect finding (0/75 solved, both arms,
// all 30 runs -- paired-diff CI exactly [0.00, 0.00]) and Prototype
// Refinement Sprint v1's own proof that a task-level metric on the SAME
// population/mechanism DOES detect a real, statistically robust
// difference (paired-diff CI [2.51, 3.95], Cohen's d_z=1.607).
export type MetricRole = "Primary" | "Secondary" | "Regression" | "Capability" | "Integration";

export interface MetricSpec {
  role: MetricRole;
  name: string;
  definition: string;
  whyThisRole: string;
  evidence: string;
}

export const EVALUATION_METRICS: MetricSpec[] = [
  {
    role: "Primary",
    name: "Whole-cube-improved count (paired-diff)",
    definition: "Per independent run: count of snapshots where Candidate's finalWrongWingCount is STRICTLY LOWER than Baseline's, compared across N>=30 runs via paired-diff 95% CI (candidate_improved - baseline_improved, reusing computeStats/analyzeEffectSize).",
    whyThisRole:
      "This is the metric that actually detected a real effect on this dataset (Prototype Refinement Sprint v1 STEP6) where the previous Primary metric (whole-cube-solved) was floor-effected and produced degenerate CI [0.00, 0.00] (Prototype Sprint v1 STEP7). It keeps the SAME statistical apparatus (paired-diff, Standard Evaluation Protocol, N>=30) that this whole research program has used throughout -- only the underlying quantity changes, from a binary 'reached zero' to an ordinal 'got closer to zero.'",
    evidence: "Prototype Refinement Sprint v1 STEP6: paired-diff mean +3.23, 95% CI [2.51, 3.95], Cohen's d_z=1.607 (large) -- a real, reproducible signal on the identical 75-snapshot/N=30 setup that produced [0.00, 0.00] under the old Primary metric.",
  },
  {
    role: "Secondary",
    name: "Whole-cube-solved count (binary)",
    definition: "Per run: count of snapshots where Candidate reaches wrongWingCount===0 within the real 1000ms budget. Still reported every Sprint, but no longer the sole/primary Decision criterion.",
    whyThisRole:
      "This remains the ultimate real-world goal (a fully solved cube), and should never be dropped entirely -- but demoting it to Secondary is the direct, disclosed correction for the floor effect this whole Sprint arc discovered. On a DIFFERENT (less pathologically hard) population it may show real signal on its own; keeping it as a reported Secondary metric preserves that possibility for future datasets without letting a floor effect silently mask real Primary-metric improvement, as it did in Prototype Sprint v1.",
    evidence: "Prototype Sprint v1 STEP4/7: Baseline Solved and Candidate Solved both averaged 0.00/75 across all 30 runs -- a floor effect specific to this curated hardest-failure-snapshot dataset, not evidence the mechanism does nothing (as Prototype Refinement Sprint v1's own Primary-metric result later confirmed).",
  },
  {
    role: "Regression",
    name: "Regression count (candidate strictly worse than baseline)",
    definition: "Per run: count of snapshots where Candidate's finalWrongWingCount is STRICTLY HIGHER than Baseline's (the mirror image of the Primary metric). Must be reported alongside every Primary-metric result, never in isolation.",
    whyThisRole:
      "A Primary-metric improvement is only meaningful if it isn't purchased with hidden regressions elsewhere -- this Sprint arc already found a real, non-zero regression count (6, Prototype Refinement Sprint v1 STEP4) from a design choice (the Visited Registry's binary skip) that looked purely beneficial on its OWN metric (100% Duplicate reduction). Any future integration decision needs this reported as its own line, with a hard requirement of 0 (or an explicit, justified tolerance) before Decision A is permitted.",
    evidence: "Prototype Refinement Sprint v1 STEP4: 6 real regressions when the Visited Registry was applied, despite eliminating 100% of measured Duplicate Invocations -- proof that a metric can look purely positive in isolation while a companion Regression metric reveals a real cost.",
  },
  {
    role: "Capability",
    name: "Task-level Coverage / Precision / Recall",
    definition: "Coverage = attempted / totalPairNoProgressRecords; Precision = succeeded / attempted; Recall = succeeded / totalPairNoProgressRecords -- all already implemented in Prototype/Refinement Sprints' own TaskLevelEvaluation.ts / PrototypeBenchmark.ts, reused unmodified as the standard per-attempt Capability report.",
    whyThisRole:
      "Distinct from the Primary metric: Capability describes how OFTEN the mechanism itself succeeds at the individual-attempt level, independent of whether that success ever shows up in the whole-cube outcome. Useful for diagnosing WHY a Primary-metric result looks the way it does (e.g. Prototype Refinement Sprint v1's Refinement arm showed Precision 12.0%/Recall 4.5% in its last run, materially higher than Prototype v1 config's own 2.7%/2.1% -- consistent with, and explaining, the Primary metric's own +3.23 paired-diff result).",
    evidence: "Prototype Refinement Sprint v1 STEP3 (last run): Prototype v1 config Precision 2.7%/Recall 2.1% vs Refinement Precision 12.0%/Recall 4.5% -- the Capability metric's own divergence foreshadows the Primary metric's own statistically significant difference.",
  },
  {
    role: "Integration",
    name: "Runtime delta + Deadline Miss rate delta (BOTH required, neither alone sufficient)",
    definition: "avgCandidateMs - avgBaselineMs (raw runtime cost) AND candidateDeadlineMissRate - baselineDeadlineMissRate (fraction of solves pushed over the real 1000ms budget), reported as a PAIR, never the runtime delta alone.",
    whyThisRole:
      "Prototype Sprint v1's own smoke test showed why a single number misleads: avg runtime delta was -3.7ms (Candidate looked FASTER on average) while Deadline Miss rate rose from 80.0% to 100.0% in the same run -- a modest per-attempt overhead pushed many already-borderline solves just past the real deadline without moving the AVERAGE much. Any future Sprint's Level-3-equivalent Runtime criterion must check both numbers, exactly as Prototype Sprint v1's own corrected driver logic already did after catching this.",
    evidence: "Prototype Sprint v1 (full run): avg runtime delta +2.0ms (looks negligible) alongside Deadline Miss rising 78.7%->100.0% (avg +24.0 percentage points across 30 runs) -- the two numbers tell materially different stories from the same data.",
  },
];

export function metricsByRole(): Record<MetricRole, MetricSpec[]> {
  const roles: MetricRole[] = ["Primary", "Secondary", "Regression", "Capability", "Integration"];
  const result = {} as Record<MetricRole, MetricSpec[]>;
  for (const r of roles) result[r] = EVALUATION_METRICS.filter((m) => m.role === r);
  return result;
}
