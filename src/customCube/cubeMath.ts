import * as THREE from "three";

export type Axis = "x" | "y" | "z";

const AXIS_VECTORS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

export function axisVector(axis: Axis): THREE.Vector3 {
  return AXIS_VECTORS[axis];
}

/**
 * Rotates an integer grid vector (components in {-1,0,1}) by a +/-90-degree
 * turn around one world axis, using the same right-hand-rule convention as
 * THREE.Quaternion.setFromAxisAngle(axisVector(axis), sign * Math.PI / 2) --
 * the two must stay in lockstep since cube.ts applies both to the same
 * cubie every turn (integer position via this function, continuous
 * orientation via the quaternion) and expects them to land on the same
 * result.
 */
export function rotateGridVector90(v: THREE.Vector3, axis: Axis, sign: 1 | -1): THREE.Vector3 {
  const { x, y, z } = v;
  switch (axis) {
    case "x":
      return sign === 1 ? new THREE.Vector3(x, -z, y) : new THREE.Vector3(x, z, -y);
    case "y":
      return sign === 1 ? new THREE.Vector3(z, y, -x) : new THREE.Vector3(-z, y, x);
    case "z":
      return sign === 1 ? new THREE.Vector3(-y, x, z) : new THREE.Vector3(y, -x, z);
  }
}

export function quarterTurnQuaternion(axis: Axis, sign: 1 | -1): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axisVector(axis), sign * (Math.PI / 2));
}
