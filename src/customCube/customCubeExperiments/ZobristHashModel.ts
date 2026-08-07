// Cube Model Experiment Sprint v3 -- Model H: Zobrist-Hash.
//
// Idea under test: none of this repo's solver research (a very large body
// of prior work in src/customCube/*Solver*, primitiveResearch/, etc) is
// touched here -- but that work's whole shape (BFS/IDA* expansion, pattern
// databases, "have I seen this state before" dedup) depends on being able
// to fingerprint a cube state cheaply. Recomputing a full hash from scratch
// every time you want to check a state (O(pieceCount)) is the naive
// option. This model wraps Slot-Cycle (delegates state entirely, same
// pattern as SlotCycleLoggedModel) and additionally maintains a Zobrist
// hash incrementally: each turn only XORs the random per-(slot, occupant)
// keys for the SLOTS that turn actually touched, in and out, so the hash
// is always O(1) to read and costs only O(turn's affected pieces) to
// maintain -- never a full re-scan.
//
// Honesty notes: (1) the hash is a single 32-bit XOR accumulator, not a
// proper 64-bit-plus Zobrist key -- collision risk is real at scale, a
// production use would want two independent 32-bit keys or a BigInt one.
// (2) this only tests maintenance cost, not collision behavior -- that
// would be a separate experiment.
import { slotCycleModel, getPrecomputedGrid, turnKey, type SlotCycleState } from "./SlotCycleModel";
import { makeRng } from "./ExperimentHarness";
import type { Cubie } from "../cubeState";
import type { CubeModel, Turn } from "./ExperimentTypes";

const ORIENTATION_COUNT = 24;
const ZOBRIST_SEED = 0x20b21571; // fixed, so keys (and therefore hash values) are reproducible run-to-run

const keysCache = new Map<number, number[][]>();

function buildZobristKeys(gridSize: number): number[][] {
  const pieceCount = getPrecomputedGrid(gridSize).slotPosition.length;
  const rng = makeRng(ZOBRIST_SEED + gridSize);
  const keys: number[][] = [];
  for (let slot = 0; slot < pieceCount; slot++) {
    const row = new Array<number>(pieceCount * ORIENTATION_COUNT);
    for (let i = 0; i < row.length; i++) row[i] = (Math.floor(rng() * 0x100000000) | 0) >>> 0;
    keys.push(row);
  }
  return keys;
}

function getZobristKeys(gridSize: number): number[][] {
  let keys = keysCache.get(gridSize);
  if (!keys) {
    keys = buildZobristKeys(gridSize);
    keysCache.set(gridSize, keys);
  }
  return keys;
}

// Independent from-scratch computation -- the "slow" baseline this model's
// incremental maintenance is meant to beat, and also the correctness oracle
// for the incrementally-maintained value (see runHashFidelityCheck in the
// driver).
export function computeZobristHashFromScratch(gridSize: number, inner: SlotCycleState): number {
  const keys = getZobristKeys(gridSize);
  let h = 0;
  for (let slot = 0; slot < inner.slotToPiece.length; slot++) {
    const pieceId = inner.slotToPiece[slot];
    h ^= keys[slot][pieceId * ORIENTATION_COUNT + inner.pieceOrientation[pieceId]];
  }
  return h >>> 0;
}

export interface ZobristState {
  inner: SlotCycleState;
  hash: number; // incrementally maintained, O(1) to read
}

export const zobristHashModel: CubeModel<ZobristState> = {
  name: "Zobrist-Hash",
  summary: "Slot-Cycle 상태 그대로 + 매 턴 영향받은 슬롯만 XOR로 갱신되는 지문(hash)을 공짜로 유지 -- 상태 전체를 매번 다시 해시할 필요 없이 O(1) 조회, 솔버 계열의 '이 상태 본 적 있나' 중복 탐지용",

  buildSolved(gridSize: number): ZobristState {
    const inner = slotCycleModel.buildSolved(gridSize);
    return { inner, hash: computeZobristHashFromScratch(gridSize, inner) };
  },

  applyTurn(state: ZobristState, turn: Turn): void {
    const grid = getPrecomputedGrid(state.inner.gridSize);
    const table = grid.turnTables.get(turnKey(turn.axis, turn.layer, turn.sign));
    if (!table) return;
    const keys = getZobristKeys(state.inner.gridSize);

    const affectedSlots: number[] = [];
    for (const cycle of table.cycles) for (const slot of cycle) affectedSlots.push(slot);

    for (const slot of affectedSlots) {
      const pieceId = state.inner.slotToPiece[slot];
      state.hash ^= keys[slot][pieceId * ORIENTATION_COUNT + state.inner.pieceOrientation[pieceId]];
    }

    slotCycleModel.applyTurn(state.inner, turn);

    for (const slot of affectedSlots) {
      const pieceId = state.inner.slotToPiece[slot];
      state.hash ^= keys[slot][pieceId * ORIENTATION_COUNT + state.inner.pieceOrientation[pieceId]];
    }
    state.hash = state.hash >>> 0;
  },

  toCubies(state: ZobristState): Cubie[] {
    return slotCycleModel.toCubies(state.inner);
  },
};
