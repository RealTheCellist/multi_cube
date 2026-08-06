// Cube Model Experiment Sprint v1 -- Model 2: Discrete-Twist.
//
// Idea under test: a piece's orientation, after any sequence of face turns,
// is always one of exactly 24 possible rotations (the cube's rotation
// group is finite) -- so storing it as a free-floating THREE.Quaternion (4
// floats, composed via quaternion multiplication every turn) is more
// general than the problem actually needs. This model stores one integer
// index (0-23) per piece instead, composed via a single array lookup
// (RotationGroup.ts's precomputed multiplication table) rather than a
// quaternion multiply -- same information, cheaper representation and
// composition. Position is still a plain Vector3 (this model isn't
// targeting position, only orientation storage/composition).
import * as THREE from "three";
import { rotateGridVector90 } from "../cubeMath";
import { buildSolvedCube, roundedComponent, type Cubie, type Sticker } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";
import { buildRotationGroup } from "./RotationGroup";

export interface DiscreteTwistState {
  id: number[];
  originalPosition: THREE.Vector3[];
  position: THREE.Vector3[];
  orientationIndex: number[];
  stickers: Sticker[][];
}

export const discreteTwistModel: CubeModel<DiscreteTwistState> = {
  name: "Discrete-Twist",
  summary: "쿼터니언 대신 24개 회전군 인덱스(정수 1개)로 방향 저장 -- 회전 합성이 배열 조회 1회",

  buildSolved(gridSize: number): DiscreteTwistState {
    const rotationGroup = buildRotationGroup();
    const cubies = buildSolvedCube(gridSize);
    return {
      id: cubies.map((c) => c.id),
      originalPosition: cubies.map((c) => c.originalPosition.clone()),
      position: cubies.map((c) => c.position.clone()),
      orientationIndex: cubies.map(() => rotationGroup.identityIndex),
      stickers: cubies.map((c) => c.stickers),
    };
  },

  applyTurn(state: DiscreteTwistState, turn: Turn): void {
    const rotationGroup = buildRotationGroup();
    const genIndex = turn.sign === 1 ? rotationGroup.generatorIndex[turn.axis].plus : rotationGroup.generatorIndex[turn.axis].minus;
    for (let i = 0; i < state.position.length; i++) {
      if (roundedComponent(state.position[i], turn.axis) !== turn.layer) continue;
      state.position[i] = rotateGridVector90(state.position[i], turn.axis, turn.sign);
      state.orientationIndex[i] = rotationGroup.multiplyTable[genIndex][state.orientationIndex[i]];
    }
  },

  toCubies(state: DiscreteTwistState): Cubie[] {
    const rotationGroup = buildRotationGroup();
    return state.id.map((id, i) => ({
      id,
      originalPosition: state.originalPosition[i],
      position: state.position[i].clone(),
      orientation: rotationGroup.quaternions[state.orientationIndex[i]].clone(),
      stickers: state.stickers[i],
    }));
  },
};
