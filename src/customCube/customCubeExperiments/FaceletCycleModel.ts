// Cube Model Experiment Sprint v2 -- Model A: Facelet-Cycle.
//
// Idea under test: every other model in this experiment tracks PIECES
// (position + orientation per cubie, stickers riding along) because that's
// what production's Cubie needs. But FaceletSnapshot.ts's own correctness
// contract only cares about individual facelets (one sticker's color at one
// physical slot) -- it never requires real multi-sticker piece grouping.
// So this model skips piece identity entirely: it tracks one fixed slot per
// STICKER (not per cubie), where a slot is a physical (position, outward
// direction) pair that never moves. A turn permutes which slot holds which
// color, exactly like Slot-Cycle permutes which slot holds which piece --
// but because a facelet's position and direction always rotate together
// (they're rigidly attached to the same physical corner of the same
// physical piece), no separate orientation state is needed at all: a
// facelet slot's identity already encodes its "orientation" as baked-in
// geometry. That eliminates Slot-Cycle's rotation-group lookup entirely,
// at the cost of one array entry per sticker instead of per piece (3x more
// entries for corners, but each entry only ever needs a color swap).
import * as THREE from "three";
import { rotateGridVector90, type Axis } from "../cubeMath";
import { buildSolvedCube, roundedComponent, type Cubie, type Face } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";

interface TurnTable {
  cycles: number[][]; // cyclic sequences of facelet-slot indices a turn permutes
}

interface FaceletGrid {
  slotPosition: THREE.Vector3[]; // slotIndex -> fixed physical position of the piece carrying this facelet
  slotDirection: THREE.Vector3[]; // slotIndex -> fixed outward direction this facelet faces
  initialColor: Face[]; // slotIndex -> color at the solved state
  turnTables: Map<string, TurnTable>;
}

function turnKey(axis: Axis, layer: number, sign: 1 | -1): string {
  return `${axis}|${layer}|${sign}`;
}

function posKey(v: THREE.Vector3): string {
  return `${v.x}:${v.y}:${v.z}`;
}

const gridCache = new Map<number, FaceletGrid>();

function buildFaceletGrid(gridSize: number): FaceletGrid {
  const solved = buildSolvedCube(gridSize);
  const slotPosition: THREE.Vector3[] = [];
  const slotDirection: THREE.Vector3[] = [];
  const initialColor: Face[] = [];
  for (const cubie of solved) {
    for (const sticker of cubie.stickers) {
      slotPosition.push(cubie.position.clone());
      slotDirection.push(sticker.direction.clone());
      initialColor.push(sticker.color);
    }
  }

  const indexByKey = new Map<string, number>();
  for (let i = 0; i < slotPosition.length; i++) {
    indexByKey.set(`${posKey(slotPosition[i])}|${posKey(slotDirection[i])}`, i);
  }

  const offset = (gridSize - 1) / 2;
  const layers: number[] = [];
  for (let i = 0; i < gridSize; i++) layers.push(i - offset);

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
          const newPos = rotateGridVector90(slotPosition[fromSlot], axis, sign);
          const newDir = rotateGridVector90(slotDirection[fromSlot], axis, sign);
          const toSlot = indexByKey.get(`${posKey(newPos)}|${posKey(newDir)}`);
          if (toSlot === undefined) {
            throw new Error(`Facelet-Cycle precompute: rotated facelet has no matching slot (axis=${axis}, layer=${layer}, sign=${sign})`);
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
        turnTables.set(turnKey(axis, layer, sign), { cycles });
      }
    }
  }

  return { slotPosition, slotDirection, initialColor, turnTables };
}

function getFaceletGrid(gridSize: number): FaceletGrid {
  let grid = gridCache.get(gridSize);
  if (!grid) {
    grid = buildFaceletGrid(gridSize);
    gridCache.set(gridSize, grid);
  }
  return grid;
}

const IDENTITY_QUATERNION = new THREE.Quaternion();

export interface FaceletCycleState {
  gridSize: number;
  colorAtSlot: Face[]; // slotIndex -> color currently occupying that facelet slot
}

export const faceletCycleModel: CubeModel<FaceletCycleState> = {
  name: "Facelet-Cycle",
  summary: "피스가 아니라 스티커(면) 하나하나를 고정 슬롯으로 취급 -- 위치+방향이 슬롯 정체성에 이미 포함돼 있어 방향 상태 자체가 아예 필요없다",

  buildSolved(gridSize: number): FaceletCycleState {
    const grid = getFaceletGrid(gridSize);
    return { gridSize, colorAtSlot: [...grid.initialColor] };
  },

  applyTurn(state: FaceletCycleState, turn: Turn): void {
    const grid = getFaceletGrid(state.gridSize);
    const table = grid.turnTables.get(turnKey(turn.axis, turn.layer, turn.sign));
    if (!table) return;
    for (const cycle of table.cycles) {
      if (cycle.length < 2) continue;
      const carry = state.colorAtSlot[cycle[cycle.length - 1]];
      for (let i = cycle.length - 1; i > 0; i--) {
        state.colorAtSlot[cycle[i]] = state.colorAtSlot[cycle[i - 1]];
      }
      state.colorAtSlot[cycle[0]] = carry;
    }
  },

  toCubies(state: FaceletCycleState): Cubie[] {
    const grid = getFaceletGrid(state.gridSize);
    return state.colorAtSlot.map((color, i) => ({
      id: i,
      originalPosition: grid.slotPosition[i],
      position: grid.slotPosition[i].clone(),
      orientation: IDENTITY_QUATERNION,
      stickers: [{ direction: grid.slotDirection[i], color }],
    }));
  },
};
