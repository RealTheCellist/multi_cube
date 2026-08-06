// Cube Model Experiment Sprint v1 -- shared contract every candidate model
// implements, so ExperimentHarness.ts can drive all of them identically.
import type { Axis } from "../cubeMath";
import type { Cubie } from "../cubeState";

export interface Turn {
  axis: Axis;
  layer: number;
  sign: 1 | -1;
}

export interface CubeModel<S> {
  readonly name: string;
  readonly summary: string;
  buildSolved(gridSize: number): S;
  applyTurn(state: S, turn: Turn): void;
  toCubies(state: S): Cubie[];
}
