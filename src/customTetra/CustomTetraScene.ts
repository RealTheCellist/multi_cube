import * as THREE from "three";
import type { Rng } from "../customCube/cubeState";
import { axisVector, VERTICES, type VertexIndex } from "./tetraMath";
import { applyRawThirdTurn, buildSolvedTetra, isSolved as isSolvedState, randomTetraScramble, stickersForTurn, type Sticker, type TetraState } from "./tetraState";

const PLASTIC_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x141414, side: THREE.DoubleSide });
// Same technique the approved concept render validated: each sticker
// triangle shrinks toward its own centroid, and a same-shaped "backing"
// triangle sits at the same spot pushed slightly toward the tetrahedron's
// interior -- the gap between the two reads as black plastic.
const INSET = 0.86;
const BACKING_OFFSET = 0.01;

const stickerMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
function stickerMaterial(color: string): THREE.MeshLambertMaterial {
  let mat = stickerMaterialCache.get(color);
  if (!mat) {
    // DoubleSide is required, not cosmetic: "up" and "down" grid cells wind
    // in opposite directions (see buildSolvedTetra), so a front-only
    // material backface-culls every axial (down-cell) sticker from the
    // camera's side, leaving only its black backing visible -- exactly the
    // "checkerboard of empty black tiles" bug this fixes.
    mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    stickerMaterialCache.set(color, mat);
  }
  return mat;
}

function centroidOf(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 {
  return corners[0].clone().add(corners[1]).add(corners[2]).divideScalar(3);
}

function trianglePositions(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]): Float32Array {
  return new Float32Array([
    corners[0].x, corners[0].y, corners[0].z,
    corners[1].x, corners[1].y, corners[1].z,
    corners[2].x, corners[2].y, corners[2].z,
  ]);
}

function buildStickerGeometry(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.BufferGeometry {
  const centroid = centroidOf(corners);
  const inset = corners.map((c) => c.clone().sub(centroid).multiplyScalar(INSET).add(centroid)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(trianglePositions(inset), 3));
  geo.computeVertexNormals();
  return geo;
}

// Centroid-direction-from-origin normal, NOT a cross-product of the
// triangle's own edges -- half this tetrahedron's faces wind the other way
// (confirmed the hard way in the concept render: cross-product normals
// pushed some backing panels in FRONT of their own stickers, blacking them
// out). "Away from the origin" is reliable for every face here because the
// whole shape is centered on the origin.
function buildBackingGeometry(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.BufferGeometry {
  const centroid = centroidOf(corners);
  const outward = centroid.clone().normalize();
  const off = outward.multiplyScalar(-BACKING_OFFSET);
  const offset = corners.map((c) => c.clone().add(off)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(trianglePositions(offset), 3));
  geo.computeVertexNormals();
  return geo;
}

interface StickerMeshes {
  sticker: THREE.Mesh;
  backing: THREE.Mesh;
}

export interface ActiveTetraTurn {
  vertexIndex: VertexIndex;
  depth: number;
  group: THREE.Group;
  stickerIds: Set<number>;
}

export class CustomTetraScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly tetraGroup: THREE.Group;
  readonly layerCount: number;
  private container: HTMLElement;
  private state: TetraState;
  private meshesById = new Map<number, StickerMeshes>();
  private activeTurn: ActiveTetraTurn | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private undoStack: { vertexIndex: VertexIndex; depth: number; sign: 1 | -1 }[] = [];

  constructor(container: HTMLElement, layerCount = 3) {
    this.container = container;
    this.layerCount = layerCount;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    // Values carried over verbatim from the validated concept render
    // (dot-product camera sweep confirming all 3 apex-adjacent faces are in
    // frame at once, not just guessed) -- see the plan doc for the sweep.
    this.camera.position.set(0.378, 3.156, 0.378);
    this.camera.up.set(-0.25, 1, 0);
    this.camera.lookAt(0, 0.05, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Same intensities as CustomCubeScene, reused for visual-family
    // consistency between the cube and tetrahedron puzzle types.
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.4);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);

    this.tetraGroup = new THREE.Group();
    this.scene.add(this.tetraGroup);

    this.tetraGroup.add(this.buildCoreMesh());

    this.state = buildSolvedTetra(this.layerCount);
    for (const sticker of this.state.stickers) {
      const meshes = this.buildStickerMeshes(sticker);
      this.meshesById.set(sticker.id, meshes);
      this.tetraGroup.add(meshes.sticker, meshes.backing);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });
  }

  // A small, permanently-static solid at the origin -- the camera never
  // sees the interior, so this is only insurance against a live drag
  // exposing empty space through the gaps between stickers (see the plan
  // doc's "surface stickers only, no solid piece bodies" decision).
  private buildCoreMesh(): THREE.Mesh {
    const scale = 0.22;
    const positions: number[] = [];
    const faceIndexTriples = [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 1],
      [1, 3, 2],
    ];
    for (const [a, b, c] of faceIndexTriples) {
      for (const idx of [a, b, c]) {
        const v = VERTICES[idx];
        positions.push(v.x * scale, v.y * scale, v.z * scale);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, PLASTIC_MATERIAL);
  }

  private buildStickerMeshes(sticker: Sticker): StickerMeshes {
    const stickerMesh = new THREE.Mesh(buildStickerGeometry(sticker.corners), stickerMaterial(sticker.color));
    const backingMesh = new THREE.Mesh(buildBackingGeometry(sticker.corners), PLASTIC_MATERIAL);
    stickerMesh.userData.stickerId = sticker.id;
    backingMesh.userData.stickerId = sticker.id;
    return { sticker: stickerMesh, backing: backingMesh };
  }

  // Rebuilds a sticker's mesh geometry from its CURRENT state.corners and
  // resets its transform to identity -- since geometry is always built
  // directly in world coordinates (see buildStickerGeometry) and every turn
  // rotates about the origin, a mesh at identity transform always renders
  // in the right place with no separate position/orientation bookkeeping
  // needed, unlike CustomCubeScene's box cubies (which reuse one fixed
  // local geometry and move it via position+quaternion instead).
  private refreshStickerMesh(sticker: Sticker): void {
    const meshes = this.meshesById.get(sticker.id)!;
    meshes.sticker.geometry.dispose();
    meshes.sticker.geometry = buildStickerGeometry(sticker.corners);
    meshes.backing.geometry.dispose();
    meshes.backing.geometry = buildBackingGeometry(sticker.corners);
    meshes.sticker.position.set(0, 0, 0);
    meshes.sticker.quaternion.identity();
    meshes.backing.position.set(0, 0, 0);
    meshes.backing.quaternion.identity();
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  getStickers(): Sticker[] {
    return this.state.stickers;
  }

  isSolved(): boolean {
    return isSolvedState(this.state);
  }

  isTurning(): boolean {
    return this.activeTurn !== null;
  }

  /**
   * Starts a live-scrubbable turn about `vertexIndex`'s axis at cutoff
   * `depth` (1..layerCount-1). Returns whether it actually started one --
   * false means a turn is already in progress. Same contract shape as
   * CustomCubeScene.beginTurn, so a future swipe controller can plug in
   * without a scene rewrite.
   */
  beginTurn(vertexIndex: VertexIndex, depth: number): boolean {
    if (this.activeTurn) return false;
    const members = stickersForTurn(this.state, vertexIndex, depth);
    const group = new THREE.Group();
    this.tetraGroup.add(group);
    for (const sticker of members) {
      const meshes = this.meshesById.get(sticker.id)!;
      group.attach(meshes.sticker);
      group.attach(meshes.backing);
    }
    this.activeTurn = { vertexIndex, depth, group, stickerIds: new Set(members.map((s) => s.id)) };
    return true;
  }

  /** signedProgress: +1 == a full +120-degree turn, -1 == a full -120-degree turn. */
  setTurnProgress(signedProgress: number): void {
    if (!this.activeTurn) return;
    this.activeTurn.group.quaternion.setFromAxisAngle(axisVector(this.activeTurn.vertexIndex), signedProgress * ((2 * Math.PI) / 3));
  }

  /** Ends the live turn. Pass +1/-1 to commit that third-turn, or null to revert. */
  endTurn(commitSign: 1 | -1 | null): void {
    const turn = this.activeTurn;
    if (!turn) return;
    try {
      if (commitSign !== null) {
        applyRawThirdTurn(this.state, turn.vertexIndex, turn.depth, commitSign);
        this.undoStack.push({ vertexIndex: turn.vertexIndex, depth: turn.depth, sign: commitSign });
      }
    } finally {
      for (const sticker of this.state.stickers) {
        if (!turn.stickerIds.has(sticker.id)) continue;
        this.refreshStickerMesh(sticker);
        const meshes = this.meshesById.get(sticker.id)!;
        this.tetraGroup.attach(meshes.sticker);
        this.tetraGroup.attach(meshes.backing);
      }
      this.tetraGroup.remove(turn.group);
      this.activeTurn = null;
    }
  }

  private refreshAllMeshes(): void {
    for (const sticker of this.state.stickers) this.refreshStickerMesh(sticker);
  }

  resetToSolved(): void {
    this.state = buildSolvedTetra(this.layerCount);
    this.refreshAllMeshes();
    this.undoStack = [];
  }

  /** `rng` defaults to Math.random; pass a seeded one (cubeState's mulberry32) for a reproducible scramble. */
  scramble(rng: Rng = Math.random): void {
    this.resetToSolved();
    randomTetraScramble(this.state, 20, rng);
    this.refreshAllMeshes();
  }

  /** Reverts the last committed turn. Returns false as a safe no-op when there's nothing to undo or a turn is live. */
  undoLastMove(): boolean {
    if (this.activeTurn) return false;
    const last = this.undoStack.pop();
    if (!last) return false;
    applyRawThirdTurn(this.state, last.vertexIndex, last.depth, last.sign === 1 ? -1 : 1);
    this.refreshAllMeshes();
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    for (const meshes of this.meshesById.values()) {
      meshes.sticker.geometry.dispose();
      meshes.backing.geometry.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
