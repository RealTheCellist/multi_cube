import * as THREE from "three";
import type { Cubie } from "./cubeState";

// Cubies carry THREE.Vector3/Quaternion instances, which a structured clone (postMessage) turns into plain
// objects without their methods; these helpers move them across a Worker boundary as plain numbers.

export interface SerializedCubie {
  id: number;
  originalPosition: [number, number, number];
  position: [number, number, number];
  orientation: [number, number, number, number];
  stickers: { direction: [number, number, number]; color: string }[];
}

export function serializeCubies(cubies: readonly Cubie[]): SerializedCubie[] {
  return cubies.map((c) => ({
    id: c.id,
    originalPosition: [c.originalPosition.x, c.originalPosition.y, c.originalPosition.z],
    position: [c.position.x, c.position.y, c.position.z],
    orientation: [c.orientation.x, c.orientation.y, c.orientation.z, c.orientation.w],
    stickers: c.stickers.map((s) => ({ direction: [s.direction.x, s.direction.y, s.direction.z], color: s.color })),
  }));
}

export function deserializeCubies(data: readonly SerializedCubie[]): Cubie[] {
  return data.map((c) => ({
    id: c.id,
    originalPosition: new THREE.Vector3(...c.originalPosition),
    position: new THREE.Vector3(...c.position),
    orientation: new THREE.Quaternion(...c.orientation),
    stickers: c.stickers.map((s) => ({ direction: new THREE.Vector3(...s.direction), color: s.color as Cubie["stickers"][number]["color"] })),
  }));
}
