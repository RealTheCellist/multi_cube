// --- ConvergenceAnalysis (Mixed Commutator Design Space Validation
// Sprint v1, Deliverable #4, RQ-3) ---------------------------------------
// Tracks the BEST footprintRatio found so far, per case, as the search
// budget grows through 4 disclosed, ordered stages:
//   Stage 1: Same-pattern L1 setups only (== prior Sprint's exact search)
//   Stage 2: + Mixed-pattern L1 setups (this Sprint's RQ-1 addition)
//   Stage 3: + Setup-length-2 probes on the single winning pattern pair
//   Stage 4: + Setup-length-3 probes (sampled) on the winning pattern pair
// If the aggregate best keeps dropping stage-over-stage, the design space
// has NOT saturated (RQ-3: still a search-budget artifact). If it goes
// flat, that is real evidence of a structural floor.
const LOW_FOOTPRINT_TARGET = 2.0;

export interface StagePoint {
  stage: string;
  cumulativeAttempts: number;
  casesWithAnyImprovement: number;
  globalMinFootprintRatio: number | null;
  avgBestFootprintRatioAcrossCases: number | null;
  lowFootprintCaseCount: number; // cases whose best-so-far <= 2.0
}

export interface StageInput {
  stage: string;
  attemptsThisStage: number;
  // label -> footprintRatio of the best candidate contributed AT this stage (only for labels with an improving candidate this stage)
  perCaseBestThisStage: Map<string, number>;
}

export function buildConvergenceCurve(stages: StageInput[]): StagePoint[] {
  const runningBest = new Map<string, number>();
  let cumulativeAttempts = 0;
  const points: StagePoint[] = [];

  for (const s of stages) {
    cumulativeAttempts += s.attemptsThisStage;
    for (const [label, ratio] of s.perCaseBestThisStage) {
      const current = runningBest.get(label);
      if (current === undefined || ratio < current) runningBest.set(label, ratio);
    }
    const values = Array.from(runningBest.values());
    points.push({
      stage: s.stage,
      cumulativeAttempts,
      casesWithAnyImprovement: values.length,
      globalMinFootprintRatio: values.length ? Math.min(...values) : null,
      avgBestFootprintRatioAcrossCases: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      lowFootprintCaseCount: values.filter((v) => v <= LOW_FOOTPRINT_TARGET).length,
    });
  }

  return points;
}

export { LOW_FOOTPRINT_TARGET };
