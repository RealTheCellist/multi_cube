// Model Lab -- lets a human directly swipe-test each Cube Model Experiment
// candidate. Reuses CustomCubeScene (rendering, camera, mesh building) and
// attachCustomSwipeTurning (the real axis-decision gesture logic) COMPLETELY
// UNMODIFIED via subclassing -- ExperimentCubeScene only overrides where a
// committed turn's math actually happens, redirecting it from the base
// class's own applyRawQuarterTurn-on-this.cubies to the selected
// experimental model's own applyTurn/toCubies, then writes the result back
// into the base's (public-getter-exposed) cubies array so the base's own
// mesh sync keeps working unchanged. Never touches CustomCubeScene.ts or
// customSwipeControls.ts.
import { CustomCubeScene } from "../customCube/CustomCubeScene";
import type { Axis } from "../customCube/cubeMath";
import type { CubeModel, Turn } from "../customCube/customCubeExperiments/ExperimentTypes";

export class ExperimentCubeScene<S> extends CustomCubeScene {
  private model: CubeModel<S>;
  private modelState: S;
  private pendingAxis: Axis | null = null;
  private pendingLayer: number | null = null;

  constructor(container: HTMLElement, gridSize: number, model: CubeModel<S>) {
    super(container, gridSize);
    this.model = model;
    this.modelState = model.buildSolved(gridSize);
  }

  override beginTurn(axis: Axis, layer: number): boolean {
    const started = super.beginTurn(axis, layer);
    if (started) {
      this.pendingAxis = axis;
      this.pendingLayer = layer;
    }
    return started;
  }

  override endTurn(commitSign: 1 | -1 | null): void {
    const axis = this.pendingAxis;
    const layer = this.pendingLayer;
    this.pendingAxis = null;
    this.pendingLayer = null;
    // Always let the base class revert its own (unaffected) cubies/meshes
    // back to the pre-turn pose first -- committing is applied separately,
    // below, via the selected model instead of the base's own math.
    super.endTurn(null);
    if (commitSign === null || axis === null || layer === null) return;
    const turn: Turn = { axis, layer, sign: commitSign };
    this.model.applyTurn(this.modelState, turn);
    this.syncFromModel();
  }

  override resetToSolved(): void {
    super.resetToSolved();
    this.modelState = this.model.buildSolved(this.gridSize);
  }

  private syncFromModel(): void {
    const resolved = this.model.toCubies(this.modelState);
    const liveCubies = this.getCubies();
    const byId = new Map(resolved.map((c) => [c.id, c]));
    for (const cubie of liveCubies) {
      const match = byId.get(cubie.id);
      if (!match) continue;
      cubie.position.copy(match.position);
      cubie.orientation.copy(match.orientation);
    }
    this.syncAllMeshes();
  }
}
