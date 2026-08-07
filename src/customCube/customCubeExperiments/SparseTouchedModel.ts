// Cube Model Experiment Sprint v2 -- Model C: Sparse-Touched.
//
// Idea under test: production's toCubies-equivalent (cloneCubies) always
// walks and allocates for EVERY piece, whether or not that piece has ever
// moved. On a small/shallow scramble on a large grid (e.g. a handful of
// turns on a 5x5, which has 98 pieces), the vast majority of pieces are
// still exactly solved -- resolving them still costs a fresh Vector3 clone
// + Quaternion clone each call, for no reason. This model keeps only a
// sparse Map of pieces that have actually been touched by a turn at least
// once (position override + rotation-group orientation index); every piece
// NOT in that map is still at its baseline solved position/orientation, and
// toCubies() returns the baseline objects by reference (no clone) for those,
// only allocating for the touched minority. Per-turn cost stays the same
// asymptotic shape as production (only pieces in the turned layer are
// touched), and this doesn't help once most pieces have been touched at
// least once (a long, saturating scramble) -- see
// runCubeModelExtendedSprintV1.ts's dedicated shallow-scramble benchmark,
// which specifically exercises the case this model targets.
import * as THREE from "three";
import { rotateGridVector90 } from "../cubeMath";
import { buildSolvedCube, roundedComponent, type Cubie, type Sticker } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";
import { buildRotationGroup } from "./RotationGroup";

interface SparseBaseline {
  id: number[];
  originalPosition: THREE.Vector3[];
  position: THREE.Vector3[]; // == originalPosition, kept separate to mirror Cubie's own field split
  stickers: Sticker[][];
  layerIndex: Map<string, number[]>; // "axis|layer" -> piece ids whose BASELINE position sits in that layer
}

const baselineCache = new Map<number, SparseBaseline>();

function buildSparseBaseline(gridSize: number): SparseBaseline {
  const cubies = buildSolvedCube(gridSize);
  const id = cubies.map((c) => c.id);
  const originalPosition = cubies.map((c) => c.originalPosition.clone());
  const position = cubies.map((c) => c.position.clone());
  const stickers = cubies.map((c) => c.stickers);

  const layerIndex = new Map<string, number[]>();
  for (let i = 0; i < position.length; i++) {
    for (const axis of ["x", "y", "z"] as const) {
      const key = `${axis}|${roundedComponent(position[i], axis)}`;
      let list = layerIndex.get(key);
      if (!list) {
        list = [];
        layerIndex.set(key, list);
      }
      list.push(i);
    }
  }

  return { id, originalPosition, position, stickers, layerIndex };
}

function getSparseBaseline(gridSize: number): SparseBaseline {
  let baseline = baselineCache.get(gridSize);
  if (!baseline) {
    baseline = buildSparseBaseline(gridSize);
    baselineCache.set(gridSize, baseline);
  }
  return baseline;
}

const IDENTITY_QUATERNION = new THREE.Quaternion();

interface TouchedEntry {
  position: THREE.Vector3;
  orientationIndex: number;
}

export interface SparseTouchedState {
  gridSize: number;
  touched: Map<number, TouchedEntry>; // pieceId -> override; absent == still baseline-solved
}

export const sparseTouchedModel: CubeModel<SparseTouchedState> = {
  name: "Sparse-Touched",
  summary: "한 번도 움직이지 않은 피스는 Map에 아예 없음 -- toCubies가 손댄 피스 수에 비례해서만 새 객체를 만들고, 나머지는 캐시된 solved 상태를 그대로 참조 반환",

  buildSolved(gridSize: number): SparseTouchedState {
    return { gridSize, touched: new Map() };
  },

  applyTurn(state: SparseTouchedState, turn: Turn): void {
    const baseline = getSparseBaseline(state.gridSize);
    const rotationGroup = buildRotationGroup();
    const genIndex = turn.sign === 1 ? rotationGroup.generatorIndex[turn.axis].plus : rotationGroup.generatorIndex[turn.axis].minus;

    // Untouched pieces whose BASELINE position is in this layer -- for an
    // untouched piece, baseline position IS current position, so this index
    // is exact. Touched pieces are excluded here and handled below instead,
    // since their current position can differ from baseline.
    const candidates = baseline.layerIndex.get(`${turn.axis}|${turn.layer}`) ?? [];
    const affected = new Set<number>();
    for (const id of candidates) {
      if (!state.touched.has(id)) affected.add(id);
    }
    for (const [id, entry] of state.touched) {
      if (roundedComponent(entry.position, turn.axis) === turn.layer) affected.add(id);
    }

    for (const id of affected) {
      const current = state.touched.get(id);
      const currentPosition = current ? current.position : baseline.position[id];
      const currentOrientation = current ? current.orientationIndex : rotationGroup.identityIndex;
      state.touched.set(id, {
        position: rotateGridVector90(currentPosition, turn.axis, turn.sign),
        orientationIndex: rotationGroup.multiplyTable[genIndex][currentOrientation],
      });
    }
  },

  toCubies(state: SparseTouchedState): Cubie[] {
    const baseline = getSparseBaseline(state.gridSize);
    const rotationGroup = buildRotationGroup();
    const result: Cubie[] = new Array(baseline.id.length);
    for (let i = 0; i < baseline.id.length; i++) {
      const override = state.touched.get(i);
      result[i] = override
        ? {
            id: baseline.id[i],
            originalPosition: baseline.originalPosition[i],
            position: override.position.clone(),
            orientation: rotationGroup.quaternions[override.orientationIndex].clone(),
            stickers: baseline.stickers[i],
          }
        : {
            id: baseline.id[i],
            originalPosition: baseline.originalPosition[i],
            position: baseline.position[i],
            orientation: IDENTITY_QUATERNION,
            stickers: baseline.stickers[i],
          };
    }
    return result;
  },
};
