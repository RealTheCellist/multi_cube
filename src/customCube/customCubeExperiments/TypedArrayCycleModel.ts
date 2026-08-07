// Cube Model Experiment Sprint v3 -- Model F: TypedArray-Cycle.
//
// Idea under test: identical algorithm to Slot-Cycle (same precomputed
// permutation-cycle tables, same shuffle), the ONLY difference is what the
// two hot per-turn arrays (slotToPiece, pieceOrientation) are stored in --
// a plain JS number[] (boxed doubles, generic array machinery) versus a
// Uint8Array (piece ids and rotation-group indices both comfortably fit
// under 256 for every gridSize this app supports, so 1 byte per entry is
// enough). Everything else -- precompute, turn tables, output geometry --
// is untouched Slot-Cycle infrastructure, reused directly, so a difference
// here isolates the storage-format question specifically.
import * as THREE from "three";
import { getPrecomputedGrid, turnKey } from "./SlotCycleModel";
import { buildRotationGroup } from "./RotationGroup";
import type { Cubie } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";

export interface TypedArrayCycleState {
  gridSize: number;
  slotToPiece: Uint8Array;
  pieceOrientation: Uint8Array;
}

function applyTurnToTypedArrays(slotToPiece: Uint8Array, pieceOrientation: Uint8Array, cycles: number[][], genIndex: number, multiplyTable: number[][]): void {
  const affectedPieceIds: number[] = [];
  for (const cycle of cycles) {
    for (const slot of cycle) affectedPieceIds.push(slotToPiece[slot]);
  }

  for (const cycle of cycles) {
    if (cycle.length < 2) continue;
    const carry = slotToPiece[cycle[cycle.length - 1]];
    for (let i = cycle.length - 1; i > 0; i--) {
      slotToPiece[cycle[i]] = slotToPiece[cycle[i - 1]];
    }
    slotToPiece[cycle[0]] = carry;
  }

  for (const pieceId of affectedPieceIds) {
    pieceOrientation[pieceId] = multiplyTable[genIndex][pieceOrientation[pieceId]];
  }
}

export const typedArrayCycleModel: CubeModel<TypedArrayCycleState> = {
  name: "TypedArray-Cycle",
  summary: "Slot-Cycle과 알고리즘은 완전히 동일, slotToPiece/pieceOrientation 저장소만 number[] 대신 Uint8Array로 -- 메모리 레이아웃/박싱 차이만 순수 격리해서 측정",

  buildSolved(gridSize: number): TypedArrayCycleState {
    const grid = getPrecomputedGrid(gridSize);
    const rotationGroup = buildRotationGroup();
    const pieceCount = grid.slotPosition.length;
    const slotToPiece = new Uint8Array(pieceCount);
    for (let i = 0; i < pieceCount; i++) slotToPiece[i] = i;
    const pieceOrientation = new Uint8Array(pieceCount).fill(rotationGroup.identityIndex);
    return { gridSize, slotToPiece, pieceOrientation };
  },

  applyTurn(state: TypedArrayCycleState, turn: Turn): void {
    const grid = getPrecomputedGrid(state.gridSize);
    const table = grid.turnTables.get(turnKey(turn.axis, turn.layer, turn.sign));
    if (!table) return;
    const rotationGroup = buildRotationGroup();
    applyTurnToTypedArrays(state.slotToPiece, state.pieceOrientation, table.cycles, table.genIndex, rotationGroup.multiplyTable);
  },

  toCubies(state: TypedArrayCycleState): Cubie[] {
    const grid = getPrecomputedGrid(state.gridSize);
    const rotationGroup = buildRotationGroup();
    const pieceToSlot = new Uint8Array(state.slotToPiece.length);
    for (let slot = 0; slot < state.slotToPiece.length; slot++) pieceToSlot[state.slotToPiece[slot]] = slot;

    return grid.originalPosition.map((originalPosition: THREE.Vector3, pieceId: number) => {
      const slot = pieceToSlot[pieceId];
      return {
        id: pieceId,
        originalPosition,
        position: grid.slotPosition[slot].clone(),
        orientation: rotationGroup.quaternions[state.pieceOrientation[pieceId]].clone(),
        stickers: grid.stickers[pieceId],
      };
    });
  },
};
