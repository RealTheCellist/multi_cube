// Cube Model Experiment Sprint v3 -- Model D: Compose-Batched.
//
// Idea under test: Delta-Log already made applyTurn free (just push to a
// list) so that a long run of turns applied with no resolve in between --
// e.g. randomLayerScramble's 20-25 back-to-back turns before the scene ever
// renders -- costs nothing until someone actually asks for the cube. But
// Delta-Log pays for that later, replaying its whole log through
// production's real per-piece vector+quaternion geometry
// (applyRawQuarterTurn) every single time toCubies() is called. This model
// keeps the same "log now, resolve later" shape, but replays through
// Slot-Cycle's already-precomputed integer permutation tables
// (applyTurnToArrays from SlotCycleModel.ts) instead -- same number of
// replay steps, each one an array shuffle instead of a
// vector-rotate-plus-quaternion-multiply.
import { getPrecomputedGrid, turnKey, applyTurnToArrays } from "./SlotCycleModel";
import { buildRotationGroup } from "./RotationGroup";
import type { CubeModel, Turn } from "./ExperimentTypes";

export interface ComposeBatchedState {
  gridSize: number;
  log: Turn[];
}

export const composeBatchedModel: CubeModel<ComposeBatchedState> = {
  name: "Compose-Batched",
  summary: "Delta-Log처럼 turn을 즉시 적용하지 않고 로그만 쌓지만(적용 비용 0), 해석 시점엔 프로덕션 기하 계산 대신 Slot-Cycle의 정수 순열 테이블로 재생 -- 같은 '나중에 몰아서 해석' 전략을 훨씬 싼 재생 비용으로 수행",

  buildSolved(gridSize: number): ComposeBatchedState {
    return { gridSize, log: [] };
  },

  applyTurn(state: ComposeBatchedState, turn: Turn): void {
    state.log.push(turn);
  },

  toCubies(state: ComposeBatchedState) {
    const grid = getPrecomputedGrid(state.gridSize);
    const rotationGroup = buildRotationGroup();
    const pieceCount = grid.slotPosition.length;
    const slotToPiece = Array.from({ length: pieceCount }, (_, i) => i);
    const pieceOrientation = Array.from({ length: pieceCount }, () => rotationGroup.identityIndex);

    for (const turn of state.log) {
      const table = grid.turnTables.get(turnKey(turn.axis, turn.layer, turn.sign));
      if (!table) continue;
      applyTurnToArrays(slotToPiece, pieceOrientation, table, rotationGroup);
    }

    const pieceToSlot = new Array<number>(pieceCount);
    for (let slot = 0; slot < pieceCount; slot++) pieceToSlot[slotToPiece[slot]] = slot;

    return grid.originalPosition.map((originalPosition, pieceId) => {
      const slot = pieceToSlot[pieceId];
      return {
        id: pieceId,
        originalPosition,
        position: grid.slotPosition[slot].clone(),
        orientation: rotationGroup.quaternions[pieceOrientation[pieceId]].clone(),
        stickers: grid.stickers[pieceId],
      };
    });
  },
};
