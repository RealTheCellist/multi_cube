import * as THREE from "three";

// Duck-typed view of cubing.js's internal Twisty3DVantage (not exported from
// the public "cubing/twisty" entry point, so we can't name its type — see
// Twisty3DVantage in the compiled package for the real shape).
export interface VantageLike {
  scene: { scene(): Promise<THREE.Scene> } | null;
  scheduleRender(): void;
}

const LIGHTS_GROUP_NAME = "poly-puzzle-lights";

// cubing.js's compiled chunks resolve their own "three" imports separately
// from ours, so meshes/materials it constructs aren't `instanceof` our THREE
// classes even though they're functionally identical — duck-type via the
// `isFoo` flags three.js itself sets in every constructor instead.
function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (obj as unknown as { isMesh?: boolean }).isMesh === true;
}
function isMeshBasicMaterial(material: THREE.Material): material is THREE.MeshBasicMaterial {
  return (material as unknown as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial === true;
}

/**
 * cubing.js's PG3D renderer (the interactive visualization we need for
 * raycasting) draws every mesh with an unlit MeshBasicMaterial and never adds
 * a single THREE.js light — every color renders at flat, shadowless full
 * brightness regardless of orientation. Swapping in lit materials (preserving
 * each mesh's own color/vertex-color data) and adding a couple of lights to
 * the scene gets real shading and a plastic-like sheen without forking
 * cubing.js, since both the puzzle mesh and the scene are reachable through
 * its public (if experimental) APIs.
 */
function litVersionOf(material: THREE.Material): THREE.Material {
  if (!isMeshBasicMaterial(material) || !material.visible) return material;
  return new THREE.MeshLambertMaterial({
    color: material.color,
    vertexColors: material.vertexColors,
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
  });
}

export async function applyRealisticCubeStyling(puzzleObj: THREE.Object3D, vantage: VantageLike): Promise<void> {
  // Each cubie mesh shares one BufferGeometry with a per-face *array* of
  // materials (one array slot per sticker/hint/foundation/hidden-hitbox
  // face), and those slots all point at a handful of module-level singleton
  // MeshBasicMaterial instances reused across every cubie. Cache by original
  // material so all meshes referencing the same singleton end up sharing one
  // new lit material too, instead of allocating a fresh one per face slot.
  const cache = new Map<THREE.Material, THREE.Material>();
  const replace = (material: THREE.Material) => {
    let lit = cache.get(material);
    if (!lit) {
      lit = litVersionOf(material);
      cache.set(material, lit);
    }
    return lit;
  };

  puzzleObj.traverse((obj) => {
    if (!isMesh(obj)) return;
    obj.material = Array.isArray(obj.material) ? obj.material.map(replace) : replace(obj.material);
  });

  const scene = await vantage.scene?.scene();
  if (!scene || scene.getObjectByName(LIGHTS_GROUP_NAME)) return;

  const lights = new THREE.Group();
  lights.name = LIGHTS_GROUP_NAME;
  lights.add(new THREE.AmbientLight(0xffffff, 3.4));
  const key = new THREE.DirectionalLight(0xffffff, 5);
  key.position.set(2, 6, 3);
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.6);
  fill.position.set(-4, -1, -3);
  lights.add(fill);
  scene.add(lights);

  vantage.scheduleRender();
}
