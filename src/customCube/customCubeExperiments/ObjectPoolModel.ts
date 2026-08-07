// Cube Model Experiment Sprint v3 -- Model E: Object-Pool.
//
// Idea under test: every model in this experiment so far allocates fresh
// THREE.Vector3/Quaternion instances (and often a fresh Cubie[] array) on
// every single toCubies() call, even though the SHAPE of the output --
// which pieceId needs a position/orientation slot -- never changes, only
// the values do. This model pre-allocates the full output array exactly
// once (in buildSolved, with real owned Vector3/Quaternion instances) and
// every toCubies() call mutates those SAME instances in place via .copy()
// instead of allocating new ones, returning the identical array/object
// references every call. Turn application itself is unchanged from
// Slot-Cycle (applyTurnToArrays) -- only the resolve step's allocation
// behavior is what's under test here.
//
// Important caveat, stated up front rather than left for a caller to
// discover: the returned Cubie[] is NOT an independent snapshot. If code
// holds onto a previous toCubies() result and calls toCubies() again, the
// OLD reference's values change too, because it's the same objects. Every
// other model in this family returns a fresh snapshot each call; this one
// deliberately does not -- whether skipping the allocation is worth losing
// that guarantee is exactly what this experiment measures.
import * as THREE from "three";
import { getPrecomputedGrid, turnKey, applyTurnToArrays } from "./SlotCycleModel";
import { buildRotationGroup } from "./RotationGroup";
import type { Cubie } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";

export interface ObjectPoolState {
  gridSize: number;
  slotToPiece: number[];
  pieceOrientation: number[];
  pool: Cubie[]; // pieceId -> pre-allocated, reused output object
  pieceToSlotScratch: number[]; // reused scratch buffer, avoids allocating this every toCubies() call too
}

export const objectPoolModel: CubeModel<ObjectPoolState> = {
  name: "Object-Pool",
  summary: "출력 Cubie[]를 buildSolved에서 딱 한 번만 만들고, toCubies마다 같은 Vector3/Quaternion 인스턴스를 .copy()로 덮어써서 반환 -- 매 호출 할당 0, 대신 반환값이 스냅샷이 아니라 공유 참조라는 제약이 생김",

  buildSolved(gridSize: number): ObjectPoolState {
    const grid = getPrecomputedGrid(gridSize);
    const rotationGroup = buildRotationGroup();
    const pieceCount = grid.slotPosition.length;

    const pool: Cubie[] = grid.originalPosition.map((originalPosition, pieceId) => ({
      id: pieceId,
      originalPosition,
      position: new THREE.Vector3().copy(grid.slotPosition[pieceId]),
      orientation: new THREE.Quaternion(),
      stickers: grid.stickers[pieceId],
    }));

    return {
      gridSize,
      slotToPiece: Array.from({ length: pieceCount }, (_, i) => i),
      pieceOrientation: Array.from({ length: pieceCount }, () => rotationGroup.identityIndex),
      pool,
      pieceToSlotScratch: new Array<number>(pieceCount),
    };
  },

  applyTurn(state: ObjectPoolState, turn: Turn): void {
    const grid = getPrecomputedGrid(state.gridSize);
    const table = grid.turnTables.get(turnKey(turn.axis, turn.layer, turn.sign));
    if (!table) return;
    applyTurnToArrays(state.slotToPiece, state.pieceOrientation, table, buildRotationGroup());
  },

  toCubies(state: ObjectPoolState): Cubie[] {
    const grid = getPrecomputedGrid(state.gridSize);
    const rotationGroup = buildRotationGroup();

    for (let slot = 0; slot < state.slotToPiece.length; slot++) state.pieceToSlotScratch[state.slotToPiece[slot]] = slot;

    for (let pieceId = 0; pieceId < state.pool.length; pieceId++) {
      const slot = state.pieceToSlotScratch[pieceId];
      const cubie = state.pool[pieceId];
      cubie.position.copy(grid.slotPosition[slot]);
      cubie.orientation.copy(rotationGroup.quaternions[state.pieceOrientation[pieceId]]);
    }

    return state.pool;
  },
};
