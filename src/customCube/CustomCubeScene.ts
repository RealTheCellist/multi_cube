import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { axisVector, type Axis } from "./cubeMath";
import {
  type Cubie,
  type Face,
  FACE_COLORS,
  FACE_TURNS,
  MIDDLE_SLICE_TURNS,
  applyMoveToken,
  applyRawQuarterTurn,
  buildSolvedCube,
  cubiesInLayer,
  faceLetterForAxisSign,
  isSolved,
  middleSliceLetterForAxis,
  randomLayerScramble,
  randomScramble,
} from "./cubeState";

// The whole cube always spans roughly this many world units regardless of
// gridSize, so switching between 2x2/3x3/4x4 doesn't change how big the
// cube looks on screen -- only how many, and how small, its cubies are.
// SPACING/CUBIE_SIZE/CORNER_RADIUS below are this extent's original 3x3x3
// values (spacing 1.06 * 3 cubies ~= 3.2), kept as the ratios each
// instance's actual per-cubie dimensions are derived from.
const CUBE_EXTENT = 3.18;
const SPACING_RATIO = 1; // spacing == CUBE_EXTENT / gridSize
const CUBIE_SIZE_RATIO = 0.96 / 1.06; // cubie size relative to spacing
const CORNER_RADIUS_RATIO = 0.07 / 1.06; // bevel radius relative to spacing

const LOCAL_FACE_SLOTS: { dir: THREE.Vector3 }[] = [
  { dir: new THREE.Vector3(1, 0, 0) },
  { dir: new THREE.Vector3(-1, 0, 0) },
  { dir: new THREE.Vector3(0, 1, 0) },
  { dir: new THREE.Vector3(0, -1, 0) },
  { dir: new THREE.Vector3(0, 0, 1) },
  { dir: new THREE.Vector3(0, 0, -1) },
];

const PLASTIC_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x141414 });
const stickerMaterialCache = new Map<Face, THREE.MeshLambertMaterial>();
function stickerMaterial(face: Face): THREE.MeshLambertMaterial {
  let mat = stickerMaterialCache.get(face);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: FACE_COLORS[face] });
    stickerMaterialCache.set(face, mat);
  }
  return mat;
}

export interface ActiveTurn {
  axis: Axis;
  layer: number;
  group: THREE.Group;
  cubieIds: Set<number>;
}

export class CustomCubeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly cubeGroup: THREE.Group;
  readonly controls: OrbitControls;
  readonly gridSize: number;
  private spacing: number;
  private container: HTMLElement;
  private cubies: Cubie[];
  private meshById = new Map<number, THREE.Mesh>();
  private activeTurn: ActiveTurn | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  // Every committed move token in order since the last resetToSolved(),
  // including scramble moves -- 3x3x3 only (see cubeState.ts). This is all
  // the solver hint needs: replaying it onto a fresh cubing/kpuzzle pattern
  // reproduces the exact current state without this renderer having to
  // know anything about cubing.js's own piece/orientation encoding.
  private moveHistory: string[] = [];

  constructor(container: HTMLElement, gridSize = 3) {
    this.container = container;
    this.gridSize = gridSize;
    this.spacing = (CUBE_EXTENT / gridSize) * SPACING_RATIO;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(5.4, 4.5, 6.6);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(3, 6, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.4);
    fill.position.set(-4, -2, -3);
    this.scene.add(fill);

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    this.cubies = buildSolvedCube(this.gridSize);
    for (const cubie of this.cubies) {
      const mesh = this.buildCubieMesh(cubie);
      this.meshById.set(cubie.id, mesh);
      this.cubeGroup.add(mesh);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enabled = false;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private buildCubieMesh(cubie: Cubie): THREE.Mesh {
    const size = this.spacing * CUBIE_SIZE_RATIO;
    const radius = this.spacing * CORNER_RADIUS_RATIO;
    const geometry = new RoundedBoxGeometry(size, size, size, 2, radius);
    const materials = LOCAL_FACE_SLOTS.map((slot) => {
      const sticker = cubie.stickers.find((s) => s.direction.distanceToSquared(slot.dir) < 1e-6);
      return sticker ? stickerMaterial(sticker.color) : PLASTIC_MATERIAL;
    });
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.userData.cubieId = cubie.id;
    this.syncMeshTransform(cubie, mesh);
    return mesh;
  }

  raycastableObjects(): THREE.Object3D[] {
    return [...this.meshById.values()];
  }

  cubieIdForMesh(mesh: THREE.Object3D): number | null {
    return typeof mesh.userData.cubieId === "number" ? mesh.userData.cubieId : null;
  }

  /**
   * Converts one world-space coordinate (e.g. a raycast hit point's x/y/z)
   * into the same grid units cubie.position uses (mesh.position ==
   * cubie.position * spacing, see syncMeshTransform) -- lets a caller work
   * from the exact 3D point a touch landed on rather than snapping straight
   * to whichever cubie's mesh happened to get raycast, which can be the
   * wrong neighbor right at a row/column boundary (rounded-bevel meshes
   * don't end exactly where the flat face they belong to does).
   */
  worldToGrid(worldCoordinate: number): number {
    return worldCoordinate / this.spacing;
  }

  getCubieById(id: number): Cubie | undefined {
    return this.cubies.find((c) => c.id === id);
  }

  private syncMeshTransform(cubie: Cubie, mesh = this.meshById.get(cubie.id)!): void {
    mesh.position.copy(cubie.position).multiplyScalar(this.spacing);
    mesh.quaternion.copy(cubie.orientation);
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  getCubies(): Cubie[] {
    return this.cubies;
  }

  /**
   * Re-syncs every mesh's position/rotation from its cubie's current state.
   * Needed after code mutates `getCubies()`'s array directly (e.g. the 4x4
   * solver phases, which apply raw quarter turns straight to the array
   * rather than going through applyInstantMove) rather than through any of
   * this class's own turn methods, none of which run the mesh sync for you.
   */
  syncAllMeshes(): void {
    for (const cubie of this.cubies) this.syncMeshTransform(cubie);
  }

  isSolved(): boolean {
    return isSolved(this.cubies);
  }

  setOrbitEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  /**
   * Starts a live-scrubbable turn: reparents the layer's meshes under a
   * pivot group. Returns whether it actually started one -- false means
   * someone else (a live drag, a solve-preview animation, ...) already
   * owns the current turn, so this call was a no-op. Callers must check
   * this before assuming a matching endTurn() of theirs will do anything;
   * otherwise a caller can believe it committed a move (and count it as
   * one) when it silently didn't, or worse, end a turn it never owned.
   */
  beginTurn(axis: Axis, layer: number): boolean {
    if (this.activeTurn) return false;
    const layerCubies = cubiesInLayer(this.cubies, axis, layer);
    const group = new THREE.Group();
    this.cubeGroup.add(group);
    for (const cubie of layerCubies) {
      const mesh = this.meshById.get(cubie.id)!;
      group.attach(mesh);
    }
    this.activeTurn = { axis, layer, group, cubieIds: new Set(layerCubies.map((c) => c.id)) };
    return true;
  }

  /**
   * signedProgress is in plain right-hand-rule terms around the turn's axis:
   * +1 == a full +90-degree turn, -1 == a full -90-degree turn. Unlike a
   * face letter's own canonical sign, this is symmetric so a drag can freely
   * scrub either direction from the same beginTurn() call.
   */
  setTurnProgress(signedProgress: number): void {
    if (!this.activeTurn) return;
    this.activeTurn.group.quaternion.setFromAxisAngle(axisVector(this.activeTurn.axis), signedProgress * (Math.PI / 2));
  }

  /** Ends the live turn. Pass +1/-1 to commit that quarter turn, or null to revert. */
  endTurn(commitSign: 1 | -1 | null): void {
    const turn = this.activeTurn;
    if (!turn) return;
    // The reparent/cleanup below must always run, even if committing throws
    // (e.g. an invalid layer) -- otherwise activeTurn is never cleared and
    // every future beginTurn() call silently no-ops forever.
    try {
      if (commitSign !== null) {
        applyRawQuarterTurn(this.cubies, turn.axis, turn.layer, commitSign);
        // Letter-notation move history only makes sense (and is only ever
        // read, by the solver) for sizes with a well-defined scheme -- the
        // 3x3x3 (one middle slice + two outer layers per axis) and the
        // 2x2x2 (every layer is an outer one, so any turn maps to a face
        // letter). A 4x4x4 has two inner layers per axis instead of one
        // named middle slice, so it's skipped -- see cubeState.ts.
        if (this.gridSize === 3 && turn.layer === 0) {
          const letter = middleSliceLetterForAxis(turn.axis);
          this.moveHistory.push(commitSign === MIDDLE_SLICE_TURNS[letter].sign ? letter : `${letter}'`);
        } else if (this.gridSize === 3 || this.gridSize === 2) {
          const face = faceLetterForAxisSign(turn.axis, Math.sign(turn.layer) as 1 | -1);
          this.moveHistory.push(commitSign === FACE_TURNS[face].sign ? face : `${face}'`);
        }
      }
    } finally {
      for (const cubie of this.cubies) {
        if (!turn.cubieIds.has(cubie.id)) continue;
        const mesh = this.meshById.get(cubie.id)!;
        this.cubeGroup.attach(mesh);
        this.syncMeshTransform(cubie, mesh);
      }
      this.cubeGroup.remove(turn.group);
      this.activeTurn = null;
    }
  }

  isTurning(): boolean {
    return this.activeTurn !== null;
  }

  applyInstantMove(token: string): void {
    applyMoveToken(this.cubies, token, this.gridSize);
    for (const cubie of this.cubies) this.syncMeshTransform(cubie);
    this.moveHistory.push(token);
  }

  getMoveHistory(): string[] {
    return [...this.moveHistory];
  }

  resetToSolved(): void {
    this.cubies = buildSolvedCube(this.gridSize);
    for (const cubie of this.cubies) {
      this.syncMeshTransform(cubie);
    }
    this.moveHistory = [];
  }

  scramble(): void {
    this.resetToSolved();
    // Letter-notation scrambling (which also records move history for the
    // solver -- see applyInstantMove) works at any size with a full letter
    // scheme: 3x3x3 and 2x2x2. Other sizes fall back to raw layer turns.
    if (this.gridSize === 3 || this.gridSize === 2) {
      for (const move of randomScramble()) this.applyInstantMove(move);
    } else {
      randomLayerScramble(this.cubies, this.gridSize);
      for (const cubie of this.cubies) this.syncMeshTransform(cubie);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    for (const mesh of this.meshById.values()) mesh.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
