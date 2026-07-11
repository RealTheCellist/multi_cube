import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { axisVector, type Axis } from "./cubeMath";
import {
  type Cubie,
  type Face,
  FACE_COLORS,
  FACE_TURNS,
  applyMoveToken,
  applyRawQuarterTurn,
  buildSolvedCube,
  cubiesInLayer,
  faceLetterForAxisSign,
  isSolved,
  randomScramble,
} from "./cubeState";

// Spacing between cubie centers and each cubie's own size -- the gap between
// them (SPACING - CUBIE_SIZE) is deliberate: real cubes have a visible seam
// between pieces at rest, so the same seam opening up further mid-turn reads
// as pieces separating (like a real cube) rather than as a rendering glitch,
// which is the whole point of this custom renderer over the edge-to-edge
// PG3D one.
const SPACING = 1.06;
const CUBIE_SIZE = 0.96;
const CORNER_RADIUS = 0.07;

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
  layer: 1 | -1;
  group: THREE.Group;
  cubieIds: Set<number>;
}

export class CustomCubeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly cubeGroup: THREE.Group;
  readonly controls: OrbitControls;
  private container: HTMLElement;
  private cubies: Cubie[];
  private meshById = new Map<number, THREE.Mesh>();
  private activeTurn: ActiveTurn | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  // Every committed move token in order since the last resetToSolved(),
  // including scramble moves. This is the only thing the solver hint needs:
  // replaying it onto a fresh cubing/kpuzzle pattern reproduces the exact
  // current state without this renderer having to know anything about
  // cubing.js's own piece/orientation encoding.
  private moveHistory: string[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
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

    this.cubies = buildSolvedCube();
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
    const geometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 2, CORNER_RADIUS);
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

  getCubieById(id: number): Cubie | undefined {
    return this.cubies.find((c) => c.id === id);
  }

  private syncMeshTransform(cubie: Cubie, mesh = this.meshById.get(cubie.id)!): void {
    mesh.position.copy(cubie.position).multiplyScalar(SPACING);
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

  isSolved(): boolean {
    return isSolved(this.cubies);
  }

  setOrbitEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  /** Starts a live-scrubbable turn: reparents the layer's meshes under a pivot group. */
  beginTurn(axis: Axis, layer: 1 | -1): void {
    if (this.activeTurn) return;
    const layerCubies = cubiesInLayer(this.cubies, axis, layer);
    const group = new THREE.Group();
    this.cubeGroup.add(group);
    for (const cubie of layerCubies) {
      const mesh = this.meshById.get(cubie.id)!;
      group.attach(mesh);
    }
    this.activeTurn = { axis, layer, group, cubieIds: new Set(layerCubies.map((c) => c.id)) };
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
    if (commitSign !== null) {
      applyRawQuarterTurn(this.cubies, turn.axis, turn.layer, commitSign);
      const face = faceLetterForAxisSign(turn.axis, turn.layer);
      this.moveHistory.push(commitSign === FACE_TURNS[face].sign ? face : `${face}'`);
    }
    for (const cubie of this.cubies) {
      if (!turn.cubieIds.has(cubie.id)) continue;
      const mesh = this.meshById.get(cubie.id)!;
      this.cubeGroup.attach(mesh);
      this.syncMeshTransform(cubie, mesh);
    }
    this.cubeGroup.remove(turn.group);
    this.activeTurn = null;
  }

  isTurning(): boolean {
    return this.activeTurn !== null;
  }

  applyInstantMove(token: string): void {
    applyMoveToken(this.cubies, token);
    for (const cubie of this.cubies) this.syncMeshTransform(cubie);
    this.moveHistory.push(token);
  }

  getMoveHistory(): string[] {
    return [...this.moveHistory];
  }

  resetToSolved(): void {
    this.cubies = buildSolvedCube();
    for (const cubie of this.cubies) {
      this.syncMeshTransform(cubie);
    }
    this.moveHistory = [];
  }

  scramble(): string[] {
    this.resetToSolved();
    const moves = randomScramble();
    for (const move of moves) this.applyInstantMove(move);
    return moves;
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
