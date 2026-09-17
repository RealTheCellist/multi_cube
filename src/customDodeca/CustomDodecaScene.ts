import * as THREE from "three";
import type { Rng } from "../customCube/cubeState";
import { faceAxis, FACE_VERTEX_INDICES, VERTICES, type FaceIndex } from "./dodecaMath";
import { applyRawFifthTurn, buildSolvedDodeca, generateRandomFifthTurns, isSolved as isSolvedState, stickersForTurn, type DodecaState, type Sticker } from "./dodecaState";

const PLASTIC_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x141414, side: THREE.DoubleSide });
// Same inset-sticker + black-backing technique as CustomTetraScene.
const INSET = 0.86;
const BACKING_OFFSET = 0.01;

const stickerMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
function stickerMaterial(color: string): THREE.MeshLambertMaterial {
  let mat = stickerMaterialCache.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    stickerMaterialCache.set(color, mat);
  }
  return mat;
}

function centroidOf(corners: readonly THREE.Vector3[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const c of corners) sum.add(c);
  return sum.divideScalar(corners.length);
}

// Fan-triangulation from the polygon's own first vertex -- valid for any
// convex polygon, which every sticker shape buildFaceStickers produces is by
// construction (a "house" pentagon, a trapezoid, a wedge, or a regular
// pentagon -- all convex).
function fanIndices(count: number): number[] {
  const idx: number[] = [];
  for (let i = 1; i < count - 1; i++) idx.push(0, i, i + 1);
  return idx;
}

function polygonPositions(corners: readonly THREE.Vector3[]): Float32Array {
  const out = new Float32Array(corners.length * 3);
  corners.forEach((c, i) => {
    out[i * 3] = c.x;
    out[i * 3 + 1] = c.y;
    out[i * 3 + 2] = c.z;
  });
  return out;
}

function buildPolygonGeometry(positions: Float32Array, triIndices: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(triIndices);
  geo.computeVertexNormals();
  return geo;
}

function buildStickerGeometry(corners: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const centroid = centroidOf(corners);
  const inset = corners.map((c) => c.clone().sub(centroid).multiplyScalar(INSET).add(centroid));
  return buildPolygonGeometry(polygonPositions(inset), fanIndices(corners.length));
}

// Centroid-direction-from-origin normal (not cross-product of the polygon's
// own edges), same reasoning as CustomTetraScene's buildBackingGeometry --
// reliable here too since the whole shape is centered on the origin.
function buildBackingGeometry(corners: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const centroid = centroidOf(corners);
  const outward = centroid.clone().normalize();
  const off = outward.multiplyScalar(-BACKING_OFFSET);
  const offset = corners.map((c) => c.clone().add(off));
  return buildPolygonGeometry(polygonPositions(offset), fanIndices(corners.length));
}

interface StickerMeshes {
  sticker: THREE.Mesh;
  backing: THREE.Mesh;
}

export interface ActiveDodecaTurn {
  faceIndex: FaceIndex;
  depth: number;
  group: THREE.Group;
  stickerIds: Set<number>;
}

export class CustomDodecaScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly dodecaGroup: THREE.Group;
  readonly layerCount: number;
  private container: HTMLElement;
  private state: DodecaState;
  private meshesById = new Map<number, StickerMeshes>();
  private activeTurn: ActiveDodecaTurn | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private undoStack: { faceIndex: FaceIndex; depth: number; sign: 1 | -1 }[] = [];
  private moveHistory: { faceIndex: FaceIndex; depth: number; sign: 1 | -1 }[] = [];

  constructor(container: HTMLElement, layerCount = 3) {
    this.container = container;
    this.layerCount = layerCount;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    // A face-on-ish framing tilted to show 3 faces at once (top + two
    // neighbors), same spirit as CustomTetraScene's validated camera --
    // picked by inspection of a render, not derived analytically. Distance
    // tuned so the dodecahedron's ~1.73 circumradius fits within the 35deg
    // FOV with margin (verified against a real screenshot, not just
    // computed, since the on-screen silhouette also depends on aspect).
    this.camera.position.set(3.7, 3.85, 4.47);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.4);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);

    this.dodecaGroup = new THREE.Group();
    this.scene.add(this.dodecaGroup);

    this.dodecaGroup.add(this.buildCoreMesh());

    this.state = buildSolvedDodeca(this.layerCount);
    for (const sticker of this.state.stickers) {
      const meshes = this.buildStickerMeshes(sticker);
      this.meshesById.set(sticker.id, meshes);
      this.dodecaGroup.add(meshes.sticker, meshes.backing);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });
  }

  // A small, permanently-static solid dodecahedron at the origin -- same
  // insurance role as CustomTetraScene's buildCoreMesh (the camera never
  // sees the interior; this just guards a live drag from exposing empty
  // space through the gaps between stickers).
  private buildCoreMesh(): THREE.Mesh {
    const scale = 0.55;
    const positions: number[] = [];
    const indices: number[] = [];
    let base = 0;
    for (const members of FACE_VERTEX_INDICES) {
      for (const idx of members) {
        const v = VERTICES[idx];
        positions.push(v.x * scale, v.y * scale, v.z * scale);
      }
      for (const i of fanIndices(5)) indices.push(base + i);
      base += 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
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

  raycastableObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    for (const meshes of this.meshesById.values()) {
      objects.push(meshes.sticker, meshes.backing);
    }
    return objects;
  }

  isSolved(): boolean {
    return isSolvedState(this.state);
  }

  isTurning(): boolean {
    return this.activeTurn !== null;
  }

  /** Starts a live-scrubbable turn about `faceIndex`'s axis at cutoff `depth` (1..layerCount-1). Returns false if a turn is already in progress. */
  beginTurn(faceIndex: FaceIndex, depth: number): boolean {
    if (this.activeTurn) return false;
    const members = stickersForTurn(this.state, faceIndex, depth);
    const group = new THREE.Group();
    this.dodecaGroup.add(group);
    for (const sticker of members) {
      const meshes = this.meshesById.get(sticker.id)!;
      group.attach(meshes.sticker);
      group.attach(meshes.backing);
    }
    this.activeTurn = { faceIndex, depth, group, stickerIds: new Set(members.map((s) => s.id)) };
    return true;
  }

  /** signedProgress: +1 == a full +72-degree turn, -1 == a full -72-degree turn. */
  setTurnProgress(signedProgress: number): void {
    if (!this.activeTurn) return;
    this.activeTurn.group.quaternion.setFromAxisAngle(faceAxis(this.activeTurn.faceIndex), signedProgress * ((2 * Math.PI) / 5));
  }

  /** Ends the live turn. Pass +1/-1 to commit that fifth-turn, or null to revert. */
  endTurn(commitSign: 1 | -1 | null): void {
    const turn = this.activeTurn;
    if (!turn) return;
    try {
      if (commitSign !== null) {
        applyRawFifthTurn(this.state, turn.faceIndex, turn.depth, commitSign);
        this.undoStack.push({ faceIndex: turn.faceIndex, depth: turn.depth, sign: commitSign });
        this.moveHistory.push({ faceIndex: turn.faceIndex, depth: turn.depth, sign: commitSign });
      }
    } finally {
      for (const sticker of this.state.stickers) {
        if (!turn.stickerIds.has(sticker.id)) continue;
        const meshes = this.meshesById.get(sticker.id)!;
        // Reparent before rebuilding geometry/resetting the transform -- see
        // CustomTetraScene.endTurn's own comment for why (attach() would
        // otherwise double-apply the just-finished rotation).
        this.dodecaGroup.add(meshes.sticker);
        this.dodecaGroup.add(meshes.backing);
        this.refreshStickerMesh(sticker);
      }
      this.dodecaGroup.remove(turn.group);
      this.activeTurn = null;
    }
  }

  private refreshAllMeshes(): void {
    for (const sticker of this.state.stickers) this.refreshStickerMesh(sticker);
  }

  resetToSolved(): void {
    this.state = buildSolvedDodeca(this.layerCount);
    this.refreshAllMeshes();
    this.undoStack = [];
    this.moveHistory = [];
  }

  /** `rng` defaults to Math.random; pass a seeded one for a reproducible scramble. */
  scramble(rng: Rng = Math.random): void {
    this.resetToSolved();
    const turns = generateRandomFifthTurns(this.layerCount, 20, rng);
    for (const turn of turns) {
      applyRawFifthTurn(this.state, turn.faceIndex, turn.depth, turn.sign);
      this.moveHistory.push(turn);
    }
    this.refreshAllMeshes();
  }

  /** Reverts the last committed turn. Returns false as a safe no-op when there's nothing to undo or a turn is live. */
  undoLastMove(): boolean {
    if (this.activeTurn) return false;
    const last = this.undoStack.pop();
    if (!last) return false;
    applyRawFifthTurn(this.state, last.faceIndex, last.depth, last.sign === 1 ? -1 : 1);
    this.moveHistory.pop();
    this.refreshAllMeshes();
    return true;
  }

  getMoveHistory(): { faceIndex: FaceIndex; depth: number; sign: 1 | -1 }[] {
    return [...this.moveHistory];
  }

  getUndoCount(): number {
    return this.undoStack.length;
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
