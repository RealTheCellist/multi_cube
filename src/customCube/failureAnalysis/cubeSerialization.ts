// Serializes/deserializes a Cubie[] to/from a plain JSON string, purely for
// FailureDatabase persistence and Failure Replay (spec sections
// "FailureDatabase"/"Failure Replay"). THREE.Vector3/Quaternion aren't
// JSON-safe on their own (they carry methods), so this flattens them to
// plain {x,y,z[,w]} and reconstructs real THREE instances on load -- the
// only place in this whole directory that touches cubeState.ts's Cubie
// shape, read-only.
import * as THREE from "three";
import type { Cubie, Face } from "../cubeState";

interface PlainVec3 {
  x: number;
  y: number;
  z: number;
}
interface PlainQuat extends PlainVec3 {
  w: number;
}
interface PlainSticker {
  direction: PlainVec3;
  color: Face;
}
interface PlainCubie {
  id: number;
  originalPosition: PlainVec3;
  position: PlainVec3;
  orientation: PlainQuat;
  stickers: PlainSticker[];
}

export function serializeCube(cubies: readonly Cubie[]): string {
  const plain: PlainCubie[] = cubies.map((c) => ({
    id: c.id,
    originalPosition: { x: c.originalPosition.x, y: c.originalPosition.y, z: c.originalPosition.z },
    position: { x: c.position.x, y: c.position.y, z: c.position.z },
    orientation: { x: c.orientation.x, y: c.orientation.y, z: c.orientation.z, w: c.orientation.w },
    stickers: c.stickers.map((s) => ({
      direction: { x: s.direction.x, y: s.direction.y, z: s.direction.z },
      color: s.color,
    })),
  }));
  return JSON.stringify(plain);
}

export function deserializeCube(json: string): Cubie[] {
  const plain: PlainCubie[] = JSON.parse(json);
  return plain.map((p) => ({
    id: p.id,
    originalPosition: new THREE.Vector3(p.originalPosition.x, p.originalPosition.y, p.originalPosition.z),
    position: new THREE.Vector3(p.position.x, p.position.y, p.position.z),
    orientation: new THREE.Quaternion(p.orientation.x, p.orientation.y, p.orientation.z, p.orientation.w),
    stickers: p.stickers.map((s) => ({
      direction: new THREE.Vector3(s.direction.x, s.direction.y, s.direction.z),
      color: s.color,
    })),
  }));
}
