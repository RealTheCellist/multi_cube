// --- ExperimentResult (Algorithm Experiment Framework v1) -------------------
export interface ExperimentResult {
  solved: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
  moveCount: number;
  elapsedMs: number;
  notes: string[];
}
