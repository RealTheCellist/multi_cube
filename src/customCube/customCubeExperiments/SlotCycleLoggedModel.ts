// Cube Model Experiment Sprint v1 -- Hybrid: Slot-Cycle + free move log.
//
// Idea under test: combine Slot-Cycle's runtime cost (integer array
// shuffles only, zero trigonometry/vector math at turn-application time --
// see SlotCycleModel.ts) with Delta-Log's one genuinely separate strength
// (a complete move-history log, useful for Undo/solve-hint/replay --
// CustomCubeScene.ts currently maintains that by hand as a parallel
// moveHistory list). Discrete-Twist's own idea (integer rotation-group
// index instead of a quaternion) doesn't need combining in -- Slot-Cycle
// already uses it internally for orientation.
//
// This does NOT inherit Delta-Log's weakness: Delta-Log is slow because
// resolving current state means replaying its whole log. Here, current
// state is always kept fully resolved by delegating straight to
// slotCycleModel -- the log is a pure, unread-from byproduct, appended
// alongside, never consulted to answer "what does the cube look like now".
import { slotCycleModel, type SlotCycleState } from "./SlotCycleModel";
import type { CubeModel, Turn } from "./ExperimentTypes";

export interface SlotCycleLoggedState {
  inner: SlotCycleState;
  log: Turn[];
}

export const slotCycleLoggedModel: CubeModel<SlotCycleLoggedState> = {
  name: "Slot-Cycle+Log",
  summary: "Slot-Cycle 그대로(런타임 기하 연산 0) + 매 턴 로그 append만 추가 -- 현재 상태 해석엔 로그를 전혀 쓰지 않으므로 Delta-Log의 재생 비용 없이 무브 히스토리를 공짜로 얻는다",

  buildSolved(gridSize) {
    return { inner: slotCycleModel.buildSolved(gridSize), log: [] };
  },

  applyTurn(state, turn: Turn) {
    slotCycleModel.applyTurn(state.inner, turn);
    state.log.push(turn);
  },

  toCubies(state) {
    return slotCycleModel.toCubies(state.inner);
  },
};
