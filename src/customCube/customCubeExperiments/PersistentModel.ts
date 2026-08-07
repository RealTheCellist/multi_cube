// Cube Model Experiment Sprint v3 -- Model G: Persistent.
//
// Idea under test: every model so far mutates its own state arrays in
// place (cheapest per-turn cost), which means "undo" isn't a built-in
// capability -- some OTHER layer has to have separately kept a snapshot
// after every turn to make undo possible at all (this app's actual Undo
// feature does exactly that kind of bookkeeping today). This model instead
// keeps every state a turn ever produced as its own independent snapshot,
// chained in state.history, so "jump back N turns" is a single array-index
// read (O(1), no replay, no external bookkeeping) at the cost of one extra
// array copy per turn (to keep prior snapshots from being aliased and
// mutated out from under you).
//
// Honesty note: this is NOT a true persistent/trie data structure with
// partial structural sharing below the array level (that would need a
// proper HAMT/path-copying vector implementation, real engineering scope
// beyond this experiment) -- it's "one full snapshot object per turn,
// referenced by history". The array clone is still O(pieceCount) per turn,
// same order as a naive "clone and store" baseline would cost; what this
// model actually buys is that undo itself needs zero replay/re-cloning
// work, since every past state already exists as a live object.
import { getPrecomputedGrid, turnKey, applyTurnToArrays } from "./SlotCycleModel";
import { buildRotationGroup } from "./RotationGroup";
import type { Cubie } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";

export interface PersistentSnapshot {
  slotToPiece: number[];
  pieceOrientation: number[];
}

export interface PersistentState {
  gridSize: number;
  current: PersistentSnapshot;
  history: PersistentSnapshot[]; // history[0] = solved, history[i] = state after i turns (current === history[history.length - 1])
}

function cloneSnapshot(s: PersistentSnapshot): PersistentSnapshot {
  return { slotToPiece: s.slotToPiece.slice(), pieceOrientation: s.pieceOrientation.slice() };
}

export const persistentModel: CubeModel<PersistentState> = {
  name: "Persistent",
  summary: "턴마다 배열을 통째로 복사한 새 스냅샷을 만들어 history에 쌓는다 -- 되돌리기(undo)가 재생/재클론 없이 배열 인덱스 참조 1회로 끝남",

  buildSolved(gridSize: number): PersistentState {
    const grid = getPrecomputedGrid(gridSize);
    const rotationGroup = buildRotationGroup();
    const pieceCount = grid.slotPosition.length;
    const initial: PersistentSnapshot = {
      slotToPiece: Array.from({ length: pieceCount }, (_, i) => i),
      pieceOrientation: Array.from({ length: pieceCount }, () => rotationGroup.identityIndex),
    };
    return { gridSize, current: initial, history: [initial] };
  },

  applyTurn(state: PersistentState, turn: Turn): void {
    const grid = getPrecomputedGrid(state.gridSize);
    const table = grid.turnTables.get(turnKey(turn.axis, turn.layer, turn.sign));
    if (!table) return;
    const next = cloneSnapshot(state.current);
    applyTurnToArrays(next.slotToPiece, next.pieceOrientation, table, buildRotationGroup());
    state.current = next;
    state.history.push(next);
  },

  toCubies(state: PersistentState): Cubie[] {
    const grid = getPrecomputedGrid(state.gridSize);
    const rotationGroup = buildRotationGroup();
    const snapshot = state.current;
    const pieceToSlot = new Array<number>(snapshot.slotToPiece.length);
    for (let slot = 0; slot < snapshot.slotToPiece.length; slot++) pieceToSlot[snapshot.slotToPiece[slot]] = slot;

    return grid.originalPosition.map((originalPosition, pieceId) => {
      const slot = pieceToSlot[pieceId];
      return {
        id: pieceId,
        originalPosition,
        position: grid.slotPosition[slot].clone(),
        orientation: rotationGroup.quaternions[snapshot.pieceOrientation[pieceId]].clone(),
        stickers: grid.stickers[pieceId],
      };
    });
  },
};
