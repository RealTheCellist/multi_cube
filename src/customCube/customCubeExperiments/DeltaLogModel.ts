// Cube Model Experiment Sprint v1 -- Model 1: Delta-Log (event-sourced).
//
// Idea under test: don't store a resolved piece state at all -- store the
// solved checkpoint plus the ordered list of turns applied since it, and
// only resolve to real positions/orientations on demand (or when the log
// gets long enough that resolving is cheaper amortized than replaying).
// This makes every commit an O(1) array push instead of an O(piecesInLayer)
// position/orientation rewrite, and gets a full, free move history/replay
// log as a side effect (relevant to this project's own Undo/solve-hint
// machinery, which currently maintains a parallel moveHistory list by hand
// -- see CustomCubeScene.ts). The turn math itself is intentionally reused
// unmodified from cubeState.ts (read-only import) since this model's own
// idea is about WHEN state gets resolved, not the geometry of a turn.
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, type Cubie } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";

const CHECKPOINT_INTERVAL = 30;

export interface DeltaLogState {
  checkpoint: Cubie[];
  log: Turn[];
}

function compact(state: DeltaLogState): void {
  for (const turn of state.log) applyRawQuarterTurn(state.checkpoint, turn.axis, turn.layer, turn.sign);
  state.log = [];
}

export const deltaLogModel: CubeModel<DeltaLogState> = {
  name: "Delta-Log",
  summary: "체크포인트 스냅샷 + 그 이후 턴 목록만 저장, 필요할 때만 재생해서 해석",

  buildSolved(gridSize: number): DeltaLogState {
    return { checkpoint: buildSolvedCube(gridSize), log: [] };
  },

  applyTurn(state: DeltaLogState, turn: Turn): void {
    state.log.push(turn);
    if (state.log.length >= CHECKPOINT_INTERVAL) compact(state);
  },

  toCubies(state: DeltaLogState): Cubie[] {
    if (state.log.length === 0) return cloneCubies(state.checkpoint);
    const resolved = cloneCubies(state.checkpoint);
    for (const turn of state.log) applyRawQuarterTurn(resolved, turn.axis, turn.layer, turn.sign);
    return resolved;
  },
};
