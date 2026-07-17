// --- ExperimentContext (Algorithm Experiment Framework v1) ------------------
// One Replay's worth of information, handed to every registered Experiment
// unchanged (the Runner clones `cubies` fresh per experiment call -- see
// ExperimentRunner.ts -- so nothing here is ever the live/shared state an
// experiment could corrupt for another experiment).
import type { Cubie } from "../cubeState";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";

export interface ExperimentMetadata {
  hash: string;
  timestamp: number;
}

export interface ExperimentContext {
  failureSnapshot: FailureSnapshot;
  cubies: Cubie[];
  wrongWingCount: number;
  // Disclosed addition beyond the spec's literal example fields (which only
  // named wrongWingCount/parity) -- ExperimentResult requires pairBefore,
  // and every experiment would otherwise have to recompute this itself from
  // `cubies` redundantly. Spec explicitly allows this: "추가 정보가 필요하면
  // Context에만 확장한다."
  pairCount: number;
  parity: boolean;
  metadata: ExperimentMetadata;
}
