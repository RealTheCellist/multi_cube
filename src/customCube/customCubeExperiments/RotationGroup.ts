// Cube Model Experiment Sprint v1 -- shared building block.
//
// Derives the 24-element proper rotation group of a cube as a lookup table
// (quaternion array + multiplication table + generator indices), by
// BFS-closing the same three axis-turn quaternions cubeState.ts's
// applyRawQuarterTurn already uses (via cubeMath.ts, read-only import) --
// never hand-typed, so correctness follows directly from the production
// math rather than a second, independently-fallible derivation of it.
//
// DiscreteTwistModel.ts and SlotCycleModel.ts both use this to replace a
// per-piece THREE.Quaternion (4 floats, composed via quaternion
// multiplication every turn) with a single integer index (0-23) composed
// via one array lookup -- the actual "new model" idea under test is
// downstream of this file, which only exists to make that idea correct by
// construction instead of hand-derived.
import * as THREE from "three";
import { quarterTurnQuaternion, type Axis } from "../cubeMath";

export interface RotationGroup {
  readonly quaternions: THREE.Quaternion[]; // 24 entries, index 0 = identity
  readonly identityIndex: number;
  readonly multiplyTable: number[][]; // multiplyTable[a][b] = index of (quaternions[a] * quaternions[b]), i.e. "apply a on top of b"
  readonly generatorIndex: Record<Axis, { plus: number; minus: number }>;
}

// Every component of a proper cube rotation's quaternion (composed purely
// from 90-degree quarter turns) is one of exactly these 7 values -- 0,
// +-1, +-0.5, or +-(root 2 / 2) for the half-angle sine of a 90-degree
// turn. Snapping to the nearest one before keying makes dedup exact
// regardless of which generator sequence floating-point path a given
// rotation was reached by (naive decimal rounding isn't enough: two
// multiplication paths to the same true rotation can disagree past the
// 6th decimal, which was silently inflating the discovered group past its
// true size of 24 before this fix).
const SNAP_VALUES = [0, 1, -1, 0.5, -0.5, Math.SQRT1_2, -Math.SQRT1_2];

function snap(v: number): number {
  let best = SNAP_VALUES[0];
  let bestDist = Math.abs(v - best);
  for (const candidate of SNAP_VALUES) {
    const dist = Math.abs(v - candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function quatKey(q: THREE.Quaternion): string {
  // Quaternions double-cover SO(3): q and -q represent the identical
  // physical rotation. Canonicalize sign (flip so the first nonzero
  // snapped component is positive) before keying, otherwise dedup finds
  // 48 "distinct" entries instead of the true 24 rotations.
  let x = snap(q.x);
  let y = snap(q.y);
  let z = snap(q.z);
  let w = snap(q.w);
  const firstNonZero = x !== 0 ? x : y !== 0 ? y : z !== 0 ? z : w;
  if (firstNonZero < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  return `${x},${y},${z},${w}`;
}

let cached: RotationGroup | null = null;

export function buildRotationGroup(): RotationGroup {
  if (cached) return cached;

  const generators: { axis: Axis; sign: 1 | -1; quat: THREE.Quaternion }[] = [];
  for (const axis of ["x", "y", "z"] as const) {
    for (const sign of [1, -1] as const) {
      generators.push({ axis, sign, quat: quarterTurnQuaternion(axis, sign) });
    }
  }

  const quaternions: THREE.Quaternion[] = [new THREE.Quaternion()]; // identity
  const indexByKey = new Map<string, number>([[quatKey(quaternions[0]), 0]]);
  const queue: number[] = [0];

  while (queue.length > 0) {
    const idx = queue.shift()!;
    for (const gen of generators) {
      const next = gen.quat.clone().multiply(quaternions[idx]);
      const key = quatKey(next);
      if (indexByKey.has(key)) continue;
      const nextIndex = quaternions.length;
      quaternions.push(next);
      indexByKey.set(key, nextIndex);
      queue.push(nextIndex);
    }
  }

  if (quaternions.length !== 24) {
    // The cube's proper rotation group has exactly 24 elements -- if BFS
    // closure over the 6 quarter-turn generators lands on a different
    // count, something about cubeMath.ts's primitives changed underneath
    // this file. Fail loudly rather than silently building a broken table.
    throw new Error(`Rotation group closure found ${quaternions.length} elements, expected 24`);
  }

  const multiplyTable: number[][] = quaternions.map((a) => quaternions.map((b) => indexByKey.get(quatKey(a.clone().multiply(b)))!));

  const generatorIndex = {} as Record<Axis, { plus: number; minus: number }>;
  for (const axis of ["x", "y", "z"] as const) {
    const plus = generators.find((g) => g.axis === axis && g.sign === 1)!;
    const minus = generators.find((g) => g.axis === axis && g.sign === -1)!;
    generatorIndex[axis] = {
      plus: indexByKey.get(quatKey(plus.quat))!,
      minus: indexByKey.get(quatKey(minus.quat))!,
    };
  }

  cached = { quaternions, identityIndex: 0, multiplyTable, generatorIndex };
  return cached;
}
