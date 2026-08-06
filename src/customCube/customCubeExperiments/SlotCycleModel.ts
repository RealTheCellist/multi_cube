// Cube Model Experiment Sprint v1 -- Model 3: Slot-Cycle.
//
// Idea under test: cubeState.ts's applyRawQuarterTurn recomputes the
// geometry of a turn (a vector rotation + a quaternion multiply) for every
// affected piece, every single time a layer turns. But for a given
// gridSize, WHICH slots a given (axis, layer, sign) turn permutes, and how
// they permute, never changes -- it's a fixed fact of the cube's geometry.
// This model precomputes that permutation ONCE per gridSize (as cycles of
// integer slot indices, using the exact same rotateGridVector90 geometry
// cubeState.ts uses, just run once instead of every turn) and reduces every
// runtime applyTurn to pure integer array index shuffles + one rotation-
// group table lookup per moved piece -- zero trigonometry/vector math left
// at turn-application time, all of it front-loaded into the one-time
// precompute.
import { rotateGridVector90 } from "../cubeMath";
import { buildSolvedCube, roundedComponent, type Cubie, type Sticker } from "../cubeState";
import type { Axis } from "../cubeMath";
import type { CubeModel, Turn } from "./ExperimentTypes";
import { buildRotationGroup } from "./RotationGroup";
import * as THREE from "three";

interface TurnTable {
  cycles: number[][]; // each entry is a cyclic sequence of slot indices a turn permutes
  genIndex: number; // rotation-group generator index every piece in this turn picks up
}

interface PrecomputedGrid {
  slotPosition: THREE.Vector3[]; // slotIndex -> fixed physical position (never mutated after precompute)
  originalPosition: THREE.Vector3[]; // pieceId -> its solved-state position (== slotPosition[pieceId], kept separate to mirror Cubie's own originalPosition field)
  stickers: Sticker[][]; // pieceId -> fixed sticker set
  turnTables: Map<string, TurnTable>;
}

function turnKey(axis: Axis, layer: number, sign: 1 | -1): string {
  return `${axis}|${layer}|${sign}`;
}

function posKey(v: THREE.Vector3): string {
  return `${v.x}:${v.y}:${v.z}`;
}

const gridCache = new Map<number, PrecomputedGrid>();

function buildPrecomputedGrid(gridSize: number): PrecomputedGrid {
  const solved = buildSolvedCube(gridSize); // pieceId == array index == slotIndex, by construction
  const slotPosition = solved.map((c) => c.position.clone());
  const originalPosition = solved.map((c) => c.originalPosition.clone());
  const stickers = solved.map((c) => c.stickers);

  const slotIndexByPos = new Map<string, number>();
  slotPosition.forEach((p, i) => slotIndexByPos.set(posKey(p), i));

  const offset = (gridSize - 1) / 2;
  const layers: number[] = [];
  for (let i = 0; i < gridSize; i++) layers.push(i - offset);

  const rotationGroup = buildRotationGroup();
  const turnTables = new Map<string, TurnTable>();

  for (const axis of ["x", "y", "z"] as const) {
    for (const layer of layers) {
      for (const sign of [1, -1] as const) {
        const fromSlots: number[] = [];
        for (let i = 0; i < slotPosition.length; i++) {
          if (roundedComponent(slotPosition[i], axis) === layer) fromSlots.push(i);
        }

        const destOf = new Map<number, number>();
        for (const fromSlot of fromSlots) {
          const rotated = rotateGridVector90(slotPosition[fromSlot], axis, sign);
          const toSlot = slotIndexByPos.get(posKey(rotated));
          if (toSlot === undefined) {
            throw new Error(`Slot-Cycle precompute: rotated position has no matching slot (axis=${axis}, layer=${layer}, sign=${sign})`);
          }
          destOf.set(fromSlot, toSlot);
        }

        const visited = new Set<number>();
        const cycles: number[][] = [];
        for (const start of fromSlots) {
          if (visited.has(start)) continue;
          const cycle = [start];
          visited.add(start);
          let cur = destOf.get(start)!;
          while (cur !== start) {
            cycle.push(cur);
            visited.add(cur);
            cur = destOf.get(cur)!;
          }
          cycles.push(cycle);
        }

        const genIndex = sign === 1 ? rotationGroup.generatorIndex[axis].plus : rotationGroup.generatorIndex[axis].minus;
        turnTables.set(turnKey(axis, layer, sign), { cycles, genIndex });
      }
    }
  }

  return { slotPosition, originalPosition, stickers, turnTables };
}

function getPrecomputedGrid(gridSize: number): PrecomputedGrid {
  let grid = gridCache.get(gridSize);
  if (!grid) {
    grid = buildPrecomputedGrid(gridSize);
    gridCache.set(gridSize, grid);
  }
  return grid;
}

export interface SlotCycleState {
  gridSize: number;
  slotToPiece: number[]; // slotIndex -> pieceId currently occupying it
  pieceOrientation: number[]; // pieceId -> rotation-group index
}

export const slotCycleModel: CubeModel<SlotCycleState> = {
  name: "Slot-Cycle",
  summary: "턴마다 기하 계산 대신, gridSize당 1회 미리 계산해 둔 슬롯 순열 사이클을 정수 배열로만 적용",

  buildSolved(gridSize: number): SlotCycleState {
    const grid = getPrecomputedGrid(gridSize);
    const rotationGroup = buildRotationGroup();
    const pieceCount = grid.slotPosition.length;
    return {
      gridSize,
      slotToPiece: Array.from({ length: pieceCount }, (_, i) => i),
      pieceOrientation: Array.from({ length: pieceCount }, () => rotationGroup.identityIndex),
    };
  },

  applyTurn(state: SlotCycleState, turn: Turn): void {
    const grid = getPrecomputedGrid(state.gridSize);
    const table = grid.turnTables.get(turnKey(turn.axis, turn.layer, turn.sign));
    if (!table) return;
    const rotationGroup = buildRotationGroup();

    // Collect affected piece ids before the shuffle overwrites slotToPiece.
    const affectedPieceIds: number[] = [];
    for (const cycle of table.cycles) {
      for (const slot of cycle) affectedPieceIds.push(state.slotToPiece[slot]);
    }

    for (const cycle of table.cycles) {
      if (cycle.length < 2) continue;
      const carry = state.slotToPiece[cycle[cycle.length - 1]];
      for (let i = cycle.length - 1; i > 0; i--) {
        state.slotToPiece[cycle[i]] = state.slotToPiece[cycle[i - 1]];
      }
      state.slotToPiece[cycle[0]] = carry;
    }

    for (const pieceId of affectedPieceIds) {
      state.pieceOrientation[pieceId] = rotationGroup.multiplyTable[table.genIndex][state.pieceOrientation[pieceId]];
    }
  },

  toCubies(state: SlotCycleState): Cubie[] {
    const grid = getPrecomputedGrid(state.gridSize);
    const rotationGroup = buildRotationGroup();
    const pieceToSlot = new Array<number>(state.slotToPiece.length);
    for (let slot = 0; slot < state.slotToPiece.length; slot++) pieceToSlot[state.slotToPiece[slot]] = slot;

    return grid.originalPosition.map((originalPosition, pieceId) => {
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
