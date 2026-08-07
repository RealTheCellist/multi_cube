// Cube Model Experiment Sprint v2 -- Model B: Bitboard.
//
// Idea under test: every array-based model in this experiment still stores
// one array slot per piece (26 entries for a 3x3x3). This model instead
// packs state into a handful of plain integers, using bit-shifting instead
// of array indexing to read/write individual piece fields -- the classic
// "bitboard" storage idea, applied to piece permutation + orientation
// rather than array slots.
//
// SCOPE, stated precisely: this is 3x3x3-only, and not for the reason
// mentioned earlier when this candidate was first proposed (that a
// corner/edge coordinate cube is inherently 3x3-specific machinery) -- that
// framing was about a further reduction this model does NOT take (see
// below). The real reason it's 3x3-only here is structural: splitting
// state into "8 corners + 12 edges + 6 centers" is itself only a fact of
// the 3x3x3 (a 2x2x2 has no edges/centers at all; a 4x4x4/5x5x5 has
// different piece-type counts -- 24 edge wings in two paired sub-types,
// 24+ center facelets -- that don't correspond 1:1 to this scheme), so the
// precompute below is written directly against the 3x3x3's fixed 8/12/6
// split rather than a general gridSize.
//
// A further honesty note: this does NOT take the textbook step of reducing
// each piece's orientation to its true minimal state space (corner twist in
// Z3, edge flip in Z2) -- that would need its own independent derivation of
// which of the 24 rotation-group elements maps to which twist/flip class,
// a second hand-derivation this experiment isn't willing to risk being
// subtly wrong the way RotationGroup.ts's own header warns about (see its
// SNAP_VALUES comment). Instead every piece's orientation reuses the
// already-validated 24-element RotationGroup index uniformly, split into
// three groups and bit-packed for storage. So the actual idea under test
// here is narrower than "minimal coordinate cube": it's specifically
// "does bit-packed integer storage + shift/mask access beat plain array
// storage + index access for the same permutation-cycle technique
// Slot-Cycle already validated" -- not a state-space reduction.
import { rotateGridVector90, type Axis } from "../cubeMath";
import { buildSolvedCube, roundedComponent, type Cubie } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";
import { buildRotationGroup, type RotationGroup } from "./RotationGroup";
import * as THREE from "three";

function turnKey(axis: Axis, layer: number, sign: 1 | -1): string {
  return `${axis}|${layer}|${sign}`;
}

function posKey(v: THREE.Vector3): string {
  return `${v.x}:${v.y}:${v.z}`;
}

// Packs `values` into as few 32-bit-safe integers as possible, `bits` each.
function packChunks(values: number[], bits: number): number[] {
  const perChunk = Math.floor(32 / bits);
  const mask = (1 << bits) - 1;
  const chunks: number[] = [];
  for (let start = 0; start < values.length; start += perChunk) {
    let packed = 0;
    const end = Math.min(start + perChunk, values.length);
    for (let i = start; i < end; i++) packed |= (values[i] & mask) << ((i - start) * bits);
    chunks.push(packed >>> 0);
  }
  return chunks;
}

function unpackChunks(chunks: number[], bits: number, totalCount: number): number[] {
  const perChunk = Math.floor(32 / bits);
  const mask = (1 << bits) - 1;
  const out: number[] = new Array(totalCount);
  let idx = 0;
  for (const chunk of chunks) {
    const count = Math.min(perChunk, totalCount - idx);
    for (let i = 0; i < count; i++) out[idx++] = (chunk >>> (i * bits)) & mask;
  }
  return out;
}

interface GroupPrecompute {
  baselinePosition: THREE.Vector3[]; // slot -> fixed physical position
  baselineOriginalPosition: THREE.Vector3[];
  baselineStickers: Cubie["stickers"][]; // pieceId -> fixed sticker set
  turnTables: Map<string, { cycles: number[][]; genIndex: number }>;
}

function buildGroupPrecompute(all: Cubie[], stickerCount: number): GroupPrecompute {
  const members = all.filter((c) => c.stickers.length === stickerCount);
  const baselinePosition = members.map((c) => c.position.clone());
  const baselineOriginalPosition = members.map((c) => c.originalPosition.clone());
  const baselineStickers = members.map((c) => c.stickers);

  const slotIndexByPos = new Map<string, number>();
  baselinePosition.forEach((p, i) => slotIndexByPos.set(posKey(p), i));

  const rotationGroup = buildRotationGroup();
  const turnTables = new Map<string, { cycles: number[][]; genIndex: number }>();
  const layers = [-1, 0, 1]; // 3x3x3 only

  for (const axis of ["x", "y", "z"] as const) {
    for (const layer of layers) {
      for (const sign of [1, -1] as const) {
        const fromSlots: number[] = [];
        for (let i = 0; i < baselinePosition.length; i++) {
          if (roundedComponent(baselinePosition[i], axis) === layer) fromSlots.push(i);
        }
        const destOf = new Map<number, number>();
        for (const fromSlot of fromSlots) {
          const rotated = rotateGridVector90(baselinePosition[fromSlot], axis, sign);
          const toSlot = slotIndexByPos.get(posKey(rotated));
          if (toSlot === undefined) {
            throw new Error(`Bitboard precompute: rotated position has no matching slot (axis=${axis}, layer=${layer}, sign=${sign})`);
          }
          destOf.set(fromSlot, toSlot);
        }
        const visited = new Set<number>();
        const cycles: number[][] = [];
        for (const start of fromSlots) {
          if (visited.has(start)) continue;
          const cycle = [start];
          visited.add(start);
          let cur = destOf.get(start)!;
          while (cur !== start) {
            cycle.push(cur);
            visited.add(cur);
            cur = destOf.get(cur)!;
          }
          cycles.push(cycle);
        }
        const genIndex = sign === 1 ? rotationGroup.generatorIndex[axis].plus : rotationGroup.generatorIndex[axis].minus;
        turnTables.set(turnKey(axis, layer, sign), { cycles, genIndex });
      }
    }
  }

  return { baselinePosition, baselineOriginalPosition, baselineStickers, turnTables };
}

interface BitboardPrecompute {
  corner: GroupPrecompute; // 8 pieces, 3 stickers each
  edge: GroupPrecompute; // 12 pieces, 2 stickers each
  center: GroupPrecompute; // 6 pieces, 1 sticker each
}

let cachedPrecompute: BitboardPrecompute | null = null;
function getPrecompute(): BitboardPrecompute {
  if (cachedPrecompute) return cachedPrecompute;
  const solved = buildSolvedCube(3);
  cachedPrecompute = {
    corner: buildGroupPrecompute(solved, 3),
    edge: buildGroupPrecompute(solved, 2),
    center: buildGroupPrecompute(solved, 1),
  };
  return cachedPrecompute;
}

const ORI_BITS = 5; // rotation-group index 0-23 fits in 5 bits

function applyGroupTurn(
  permChunks: number[],
  oriChunks: number[],
  permBits: number,
  count: number,
  table: { cycles: number[][]; genIndex: number } | undefined,
  rotationGroup: RotationGroup,
): { permChunks: number[]; oriChunks: number[] } {
  if (!table || table.cycles.length === 0) return { permChunks, oriChunks };

  const slotToPiece = unpackChunks(permChunks, permBits, count);
  const pieceOrientation = unpackChunks(oriChunks, ORI_BITS, count);

  const affected: number[] = [];
  for (const cycle of table.cycles) {
    for (const slot of cycle) affected.push(slotToPiece[slot]);
  }

  for (const cycle of table.cycles) {
    if (cycle.length < 2) continue;
    const carry = slotToPiece[cycle[cycle.length - 1]];
    for (let i = cycle.length - 1; i > 0; i--) slotToPiece[cycle[i]] = slotToPiece[cycle[i - 1]];
    slotToPiece[cycle[0]] = carry;
  }
  for (const pieceId of affected) {
    pieceOrientation[pieceId] = rotationGroup.multiplyTable[table.genIndex][pieceOrientation[pieceId]];
  }

  return { permChunks: packChunks(slotToPiece, permBits), oriChunks: packChunks(pieceOrientation, ORI_BITS) };
}

function resolveGroup(group: GroupPrecompute, permChunks: number[], oriChunks: number[], permBits: number, count: number, idStart: number, rotationGroup: RotationGroup): Cubie[] {
  const slotToPiece = unpackChunks(permChunks, permBits, count);
  const pieceOrientation = unpackChunks(oriChunks, ORI_BITS, count);
  const pieceToSlot = new Array<number>(count);
  for (let slot = 0; slot < count; slot++) pieceToSlot[slotToPiece[slot]] = slot;

  const out: Cubie[] = [];
  for (let pieceId = 0; pieceId < count; pieceId++) {
    const slot = pieceToSlot[pieceId];
    out.push({
      id: idStart + pieceId,
      originalPosition: group.baselineOriginalPosition[pieceId],
      position: group.baselinePosition[slot].clone(),
      orientation: rotationGroup.quaternions[pieceOrientation[pieceId]].clone(),
      stickers: group.baselineStickers[pieceId],
    });
  }
  return out;
}

export interface BitboardState {
  cornerPerm: number[]; // 8 x 3 bits, packed
  cornerOri: number[]; // 8 x 5 bits, packed
  edgePerm: number[]; // 12 x 4 bits, packed
  edgeOri: number[]; // 12 x 5 bits, packed
  centerPerm: number[]; // 6 x 3 bits, packed
  centerOri: number[]; // 6 x 5 bits, packed
}

export const bitboardModel: CubeModel<BitboardState> = {
  name: "Bitboard",
  summary: "26개 피스 배열 대신 corner/edge/center 3그룹으로 나눠 정수 몇 개에 비트 패킹 -- Slot-Cycle과 같은 순열 사이클 기법을 배열 인덱싱 대신 시프트/마스크로 수행 (3x3 전용)",

  buildSolved(gridSize: number): BitboardState {
    if (gridSize !== 3) throw new Error("Bitboard model only supports 3x3x3 (see file header for why)");
    const rotationGroup = buildRotationGroup();
    const identityPerm = (count: number) => Array.from({ length: count }, (_, i) => i);
    const identityOri = (count: number) => Array.from({ length: count }, () => rotationGroup.identityIndex);
    return {
      cornerPerm: packChunks(identityPerm(8), 3),
      cornerOri: packChunks(identityOri(8), ORI_BITS),
      edgePerm: packChunks(identityPerm(12), 4),
      edgeOri: packChunks(identityOri(12), ORI_BITS),
      centerPerm: packChunks(identityPerm(6), 3),
      centerOri: packChunks(identityOri(6), ORI_BITS),
    };
  },

  applyTurn(state: BitboardState, turn: Turn): void {
    const p = getPrecompute();
    const rotationGroup = buildRotationGroup();
    const key = turnKey(turn.axis, turn.layer, turn.sign);

    const c = applyGroupTurn(state.cornerPerm, state.cornerOri, 3, 8, p.corner.turnTables.get(key), rotationGroup);
    state.cornerPerm = c.permChunks;
    state.cornerOri = c.oriChunks;

    const e = applyGroupTurn(state.edgePerm, state.edgeOri, 4, 12, p.edge.turnTables.get(key), rotationGroup);
    state.edgePerm = e.permChunks;
    state.edgeOri = e.oriChunks;

    const ce = applyGroupTurn(state.centerPerm, state.centerOri, 3, 6, p.center.turnTables.get(key), rotationGroup);
    state.centerPerm = ce.permChunks;
    state.centerOri = ce.oriChunks;
  },

  toCubies(state: BitboardState): Cubie[] {
    const p = getPrecompute();
    const rotationGroup = buildRotationGroup();
    return [
      ...resolveGroup(p.corner, state.cornerPerm, state.cornerOri, 3, 8, 0, rotationGroup),
      ...resolveGroup(p.edge, state.edgePerm, state.edgeOri, 4, 12, 8, rotationGroup),
      ...resolveGroup(p.center, state.centerPerm, state.centerOri, 3, 6, 20, rotationGroup),
    ];
  },
};
