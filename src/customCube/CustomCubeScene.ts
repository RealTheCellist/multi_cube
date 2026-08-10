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
  cubiesInLayer,
  faceLetterForAxisSign,
  generateRandomLayerTurns,
  isSolved,
  middleSliceLetterForAxis,
  outerLayerCoordinate,
  randomScramble,
} from "./cubeState";
import { objectPoolModel, type ObjectPoolState } from "./customCubeExperiments/ObjectPoolModel";
import { playTurnSound } from "./turnSound";

// The whole cube always spans roughly this many world units regardless of
// gridSize, so switching between 2x2/3x3/4x4 doesn't change how big the
// cube looks on screen -- only how many, and how small, its cubies are.
// SPACING/CUBIE_SIZE/CORNER_RADIUS below are this extent's original 3x3x3
// values (spacing 1.06 * 3 cubies ~= 3.2), kept as the ratios each
// instance's actual per-cubie dimensions are derived from.
const CUBE_EXTENT = 3.18;
const SPACING_RATIO = 1; // spacing == CUBE_EXTENT / gridSize
const CUBIE_SIZE_RATIO = 1; // cubie size relative to spacing -- 1 means cubies touch, no gap between them
// Rounder look (was 0.07/1.06, ~4x smaller bevel) -- RoundedBoxGeometry
// keeps the underlying BoxGeometry's 6 face groups intact regardless of
// radius (only vertex positions/normals bulge), so a bigger bevel doesn't
// reintroduce the inter-cubie-gap misfire from
// INTER_CUBIE_GAP_HIT_FIX_V1.md: a ray landing on a cubie's own rounded
// corner still reports that face's real materialIndex/sticker, and a ray
// that slips into the physical gap between cubies still gets rejected by
// isStickerFaceHit() the same as before, independent of bevel size.
const CORNER_RADIUS_RATIO = 0.14 / 1.06;

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
  // Backing state for `cubies` below -- see ObjectPoolModel.ts. `cubies`
  // itself is the SAME array/object references every call (refreshed via
  // objectPoolModel.toCubies after every mutation), which is why every
  // internal turn-application path in this class goes through
  // applyRawTurn()/resetPoolToSolved() rather than mutating `cubies`
  // directly -- doing so would desync it from poolState until the next
  // refresh silently overwrote the change.
  private poolState: ObjectPoolState;
  private cubies: Cubie[];
  private meshById = new Map<number, THREE.Mesh>();
  // Invisible box slightly larger than the assembled cube's true rendered
  // surface, raycast only as a FALLBACK when a touch misses every real
  // cubie mesh (see customSwipeControls.ts's raycastNear). Swipes started
  // right at the cube's screen silhouette -- near a face-to-face boundary,
  // where perspective foreshortening narrows the true hit target -- land in
  // the few-pixel gap between "visually on the cube" and "actually
  // intersects a cubie mesh" often enough to feel like the gesture did
  // nothing (see docs/EDGE_GESTURE_HIT_EXPANSION_V1.md). This never
  // participates in the primary raycast (raycastableObjects() below), so it
  // cannot change which cubie/axis a touch that already lands on a real
  // cubie resolves to.
  private edgeGestureProxy: THREE.Mesh;
  private activeTurn: ActiveTurn | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  // Every committed move token in order since the last resetToSolved(),
  // including scramble moves -- 3x3x3 only (see cubeState.ts). This is all
  // the solver hint needs: replaying it onto a fresh cubing/kpuzzle pattern
  // reproduces the exact current state without this renderer having to
  // know anything about cubing.js's own piece/orientation encoding.
  private moveHistory: string[] = [];
  // One entry per committed endTurn() (any gridSize, unlike moveHistory
  // above which is letter-notation-only for 2x2x2/3x3x3) -- lets
  // undoLastMove() replay the inverse turn without needing a full letter
  // scheme. Never touched by scramble/hint-preview (both bypass this via
  // applyInstantMove or endTurn(null), see cubeState.ts/customSolvePlayback.ts).
  private undoStack: { axis: Axis; layer: number; sign: 1 | -1 }[] = [];

  constructor(container: HTMLElement, gridSize = 3) {
    this.container = container;
    this.gridSize = gridSize;
    this.spacing = (CUBE_EXTENT / gridSize) * SPACING_RATIO;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    // Same distance/zoom as the original 10%-closer position (5.4*0.9,
    // 4.5*0.9, 6.6*0.9), scaled 10% closer to the origin so the cube fills
    // more of the canvas -- makes each cubie face bigger on screen, which is
    // what actually matters for swipe-gesture testing (more pixels per
    // cubie = easier to land a precise swipe). Checked against clipping:
    // the cube's rendered corner is ~2.67 world units from center, and at
    // this distance/FOV the visible half-extent is still comfortably
    // larger even at a corner-on orbit view (verified visually).
    //
    // Yawed -5 degrees from that original azimuth (see
    // docs/CAMERA_ANGLE_OPTIMIZATION_VALIDATION_V1.md): a 7x6-point margin
    // sweep across 5 camera candidates (baseline, pitch +-5, yaw +-5) found
    // this yaw increases the screen-space angular separation between the
    // two candidate turn-axes on the top/right faces -- the structural
    // cause of the axis mis-recognition bug -- cutting the near-tied
    // (margin<0.05) sample rate from 10.3% to 5.1% and roughly halving
    // gesture mis-recognition at a representative top-face point (40%/42%
    // -> 24%/18%, N=50/direction, tremor model) with zero change to
    // front-face accuracy (still 0% mis-recognition, N=300) and no visible
    // change in how natural the view looks.
    this.camera.position.set(4.3238, 4.05, 6.341);
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

    this.poolState = objectPoolModel.buildSolved(this.gridSize);
    this.cubies = objectPoolModel.toCubies(this.poolState);
    for (const cubie of this.cubies) {
      const mesh = this.buildCubieMesh(cubie);
      this.meshById.set(cubie.id, mesh);
      this.cubeGroup.add(mesh);
    }

    this.edgeGestureProxy = this.buildEdgeGestureProxy();
    this.cubeGroup.add(this.edgeGestureProxy);

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

  private buildEdgeGestureProxy(): THREE.Mesh {
    // trueHalfExtent: the assembled cube's actual outer surface, in world
    // units -- the same geometry buildCubieMesh derives each cubie's size
    // and position from (outermost grid coordinate's cubie center, plus
    // half that cubie's own size). EDGE_MARGIN pads beyond that by roughly
    // half a cubie's spacing on every side, sized empirically against the
    // silhouette-miss gap measured in docs/EDGE_GESTURE_HIT_EXPANSION_V1.md.
    const trueHalfExtent = ((this.gridSize - 1) / 2) * this.spacing + (this.spacing * CUBIE_SIZE_RATIO) / 2;
    const EDGE_MARGIN_RATIO = 0.75;
    const proxyHalfExtent = trueHalfExtent + this.spacing * EDGE_MARGIN_RATIO;
    const size = proxyHalfExtent * 2;
    const geometry = new THREE.BoxGeometry(size, size, size);
    // opacity 0 (not `visible = false`) -- Three.js's Raycaster does not
    // consult `.visible`, only the renderer's draw pass does, so opacity is
    // what keeps this out of the rendered frame while staying raycastable.
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  raycastableObjects(): THREE.Object3D[] {
    return [...this.meshById.values()];
  }

  /**
   * Fallback-only raycast target for touches that miss every real cubie --
   * see edgeGestureProxy above. Deliberately excluded from
   * raycastableObjects() so callers must try that first and only fall back
   * to this on a genuine miss.
   */
  edgeGestureProxyObjects(): THREE.Object3D[] {
    return [this.edgeGestureProxy];
  }

  cubieIdForMesh(mesh: THREE.Object3D): number | null {
    return typeof mesh.userData.cubieId === "number" ? mesh.userData.cubieId : null;
  }

  /**
   * True only if a raycast hit landed on a real sticker face. Adjacent
   * cubies leave a small gap (CUBIE_SIZE_RATIO < 1) so a ray aimed right at
   * a grid line between two cubies can slip past the intended sticker and
   * land on a neighboring cubie's bare-plastic INTERIOR face instead (one
   * of the 6 box faces with no sticker.direction match in buildCubieMesh).
   * That hit is real (raycastableObjects() found *something*), but its
   * face/normal belongs to a face the touch was never meant to land on --
   * treating it as a legitimate candidate silently offers a completely
   * different axis pair than the sticker the user was visibly aiming at.
   */
  isStickerFaceHit(object: THREE.Object3D, materialIndex: number | undefined): boolean {
    if (typeof materialIndex !== "number") return false;
    const materials = (object as THREE.Mesh).material;
    const material = Array.isArray(materials) ? materials[materialIndex] : materials;
    return material !== undefined && material !== PLASTIC_MATERIAL;
  }

  /**
   * Which world axis a raycast hit's face belongs to, read from
   * hit.face.materialIndex rather than the face's (possibly smoothly
   * interpolated, non-axis-aligned) normal. BoxGeometry -- and
   * RoundedBoxGeometry, which extends it and only bulges vertex
   * positions/normals, never touching .groups -- always assigns its 6
   * macro faces to groups in this exact order (px,nx,py,ny,pz,nz),
   * matching LOCAL_FACE_SLOTS above, regardless of gridSize, bevel
   * radius, or whether the mesh's own .material is an array or single
   * material (edgeGestureProxy's plain BoxGeometry has the same 6 groups
   * even though it renders with one material). materialIndex is exact by
   * construction; the normal is a continuous quantity that legitimately
   * drifts away from axis-aligned near a bevel, more so the larger the
   * bevel radius -- undefined only means a non-grouped geometry, which
   * none of raycastableObjects()/edgeGestureProxyObjects() are.
   *
   * materialIndex alone is only a LOCAL (mesh-space) face slot, not a
   * world axis -- a previous version of this method returned
   * AXIS_BY_MATERIAL_INDEX[materialIndex] directly, silently assuming
   * every cubie mesh is still in its solved-orientation transform. That's
   * true right after a reset, but false for almost every cubie after any
   * real turn: endTurn's cubeGroup.attach(mesh) bakes the turn's rotation
   * into the mesh's permanent local transform, so materialIndex 0 ("local
   * +x", assigned once at construction from that cubie's solved-state
   * stickers) keeps meaning "local +x" forever, but local +x stops
   * pointing at world +x the moment that cubie is turned. Measured (real
   * app, scrambled cube, 27 face-center touches spread across all 3
   * visible faces): 19/27 (70%) reported a faceAxis whose own hit-point
   * coordinate wasn't even near the cube's true surface -- i.e. this
   * silently picked the wrong pair of candidate turns entirely, upstream
   * of and unfixable by anything in customSwipeControls.ts's own axis
   * DECISION logic (which only ever chooses between whatever 2 candidates
   * this method hands it). object's current world matrix is what actually
   * answers "which world axis does this LOCAL face slot point at right
   * now" -- LOCAL_FACE_SLOTS[materialIndex].dir is still exact (no bevel
   * curvature involved, unlike the raw hit normal), so transforming it by
   * the mesh's real, current rotation keeps both the original exactness
   * and correctness after any amount of turning.
   */
  axisForMaterialIndex(materialIndex: number | undefined, object: THREE.Object3D): Axis | undefined {
    if (typeof materialIndex !== "number") return undefined;
    const localDir = LOCAL_FACE_SLOTS[materialIndex]?.dir;
    if (!localDir) return undefined;
    const worldDir = localDir.clone().transformDirection(object.matrixWorld);
    const ax = Math.abs(worldDir.x);
    const ay = Math.abs(worldDir.y);
    const az = Math.abs(worldDir.z);
    return ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z";
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

  /** The only place a raw (axis, layer, sign) turn is applied to `poolState` -- keeps `cubies` in sync every time. */
  private applyRawTurn(axis: Axis, layer: number, sign: 1 | -1): void {
    objectPoolModel.applyTurn(this.poolState, { axis, layer, sign });
    this.cubies = objectPoolModel.toCubies(this.poolState);
  }

  // Local mirror of cubeState.ts's applyMoveToken, routed through
  // applyRawTurn() instead of applyRawQuarterTurn -- cubeState.ts's own
  // applyMoveToken mutates a passed-in Cubie[] directly, which would desync
  // poolState if called on `cubies` (see the field comment above). Kept in
  // sync with cubeState.ts's face-letter tables (FACE_TURNS/
  // MIDDLE_SLICE_TURNS/outerLayerCoordinate) by importing them rather than
  // re-deriving anything.
  private applyMoveTokenToPool(token: string): void {
    const face = token[0] as Face | "M" | "E" | "S";
    const suffix = token.slice(1);
    const times = suffix === "2" ? 2 : suffix === "'" ? 3 : 1;
    if (face === "M" || face === "E" || face === "S") {
      const { axis, sign } = MIDDLE_SLICE_TURNS[face];
      for (let i = 0; i < times; i++) this.applyRawTurn(axis, 0, sign);
      return;
    }
    const { axis, sign } = FACE_TURNS[face];
    const layer = outerLayerCoordinate(face, this.gridSize);
    for (let i = 0; i < times; i++) this.applyRawTurn(axis, layer, sign);
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
        this.applyRawTurn(turn.axis, turn.layer, commitSign);
        playTurnSound();
        this.undoStack.push({ axis: turn.axis, layer: turn.layer, sign: commitSign });
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
    this.applyMoveTokenToPool(token);
    for (const cubie of this.cubies) this.syncMeshTransform(cubie);
    this.moveHistory.push(token);
  }

  getMoveHistory(): string[] {
    return [...this.moveHistory];
  }

  // Count of committed turns since the last resetToSolved(), any gridSize --
  // callers that need to know how many quarter turns a batch of solve-hint
  // commits just produced (a hint move can be a double, e.g. "R2") compare
  // this before/after rather than parsing move tokens themselves.
  getUndoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Reverts the last committed turn (from a real swipe, any gridSize).
   * Returns false as a safe no-op when there's nothing to undo or a turn
   * is currently live (mid-drag) -- callers don't need to check either
   * condition themselves.
   */
  undoLastMove(): boolean {
    if (this.activeTurn) return false;
    const last = this.undoStack.pop();
    if (!last) return false;
    this.applyRawTurn(last.axis, last.layer, last.sign === 1 ? -1 : 1);
    playTurnSound();
    for (const cubie of this.cubies) this.syncMeshTransform(cubie);
    if (this.gridSize === 3 || this.gridSize === 2) {
      this.moveHistory.pop();
    }
    return true;
  }

  resetToSolved(): void {
    this.poolState = objectPoolModel.buildSolved(this.gridSize);
    this.cubies = objectPoolModel.toCubies(this.poolState);
    for (const cubie of this.cubies) {
      this.syncMeshTransform(cubie);
    }
    this.moveHistory = [];
    this.undoStack = [];
  }

  scramble(): void {
    this.resetToSolved();
    // Letter-notation scrambling (which also records move history for the
    // solver -- see applyInstantMove) works at any size with a full letter
    // scheme: 3x3x3 and 2x2x2. Other sizes fall back to raw layer turns.
    if (this.gridSize === 3 || this.gridSize === 2) {
      for (const move of randomScramble()) this.applyInstantMove(move);
    } else {
      for (const { axis, layer, sign } of generateRandomLayerTurns(this.gridSize)) this.applyRawTurn(axis, layer, sign);
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
    this.edgeGestureProxy.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
