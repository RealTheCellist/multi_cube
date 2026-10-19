import type { Axis } from "./cubeMath";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, roundedComponent, type Cubie, type Face } from "./cubeState";
import { pieceType5 } from "./fiveByFivePieces";
import type { Move } from "./fiveByFiveCenters";

// ============================================================================
// 5x5x5 wing pairing by pure wing 3-cycles.
//
// The 24 wing pieces form one orbit under the 24 usable quarter turns (layers
// -2,-1,1,2), acted on by the full symmetric group S24, and a wing's orientation is
// locked to its slot (checked with a computer-algebra system on the real sticker
// permutations): one piece placed in a slot shows exactly one pair of colours. Every wing
// has a distinct (colour, colour) signature, so "the wings match the true edge of their
// line" pins down WHICH piece belongs in each slot: a fixed target permutation. It is
// sorted with 3-cycle commutators [A, B] that move three wings and nothing else (offline
// exhaustive search, wings5-gen/: 8 quarter turns), conjugated by a setup that carries
// the three chosen slots onto the commutator's own slots (breadth-first search over
// ordered slot triples, 24*23*22 states).
//
// A 3-cycle sort reaches only EVEN permutations, so a target of odd parity returns null
// and the caller has to change the parity (see fiveByFivePlan.ts).
// ============================================================================

const AXES: readonly Axis[] = ["x", "y", "z"];
const LAYERS = [-2, -1, 1, 2] as const;
export const WING_MOVES: readonly Move[] = (() => {
  const out: Move[] = [];
  for (const axis of AXES) for (const layer of LAYERS) for (const sign of [1, -1] as const) out.push([axis, layer, sign]);
  return out;
})();

/** [A, B] = A B A' B' as indices into WING_MOVES (found offline: moves exactly three wings). */
const COMMUTATOR = { a: [16], b: [13, 23, 12] };

const posKey = (x: number, y: number, z: number) => `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
const dirKey = (x: number, y: number, z: number) => `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
const inverseWord = (w: readonly number[]): number[] => [...w].reverse().map((m) => m ^ 1);

interface WingModel {
  n: number; // 24
  slotOfPos: Map<string, number>;
  slotPos: [number, number, number][];
  /** piece index by solved cubie id */
  pieceOfId: Map<number, number>;
  /** piece colours by sticker orbit: [piece][orbit] */
  pieceColor: Face[][];
  /** per cubie id: orbit of its sticker k */
  orbitOfSticker: Map<number, number[]>;
  /** per slot: facing direction key of the orbit-0 and orbit-1 sticker */
  slotDir: [string, string][];
  /** slotDest[m][s] = slot the wing at s moves to under move m */
  slotDest: Uint8Array[];
}

let modelCache: WingModel | null = null;

function getModel(): WingModel {
  if (modelCache) return modelCache;
  const solved = buildSolvedCube(5);
  const wings = solved.filter((c) => pieceType5(c) === "wingEdge").sort((a, b) => a.id - b.id);
  const n = wings.length;
  const slotOfPos = new Map<string, number>();
  const slotPos: [number, number, number][] = [];
  wings.forEach((c, i) => {
    slotOfPos.set(posKey(c.position.x, c.position.y, c.position.z), i);
    slotPos.push([Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z)]);
  });
  const pieceOfId = new Map(wings.map((c, i) => [c.id, i]));

  // sticker slots of the wings: (slot, direction) -> index, then union-find over every move
  const stickerIndex = new Map<string, number>();
  const stickerOf: { cubie: number; k: number }[] = [];
  for (const c of wings) c.stickers.forEach((s, k) => {
    stickerIndex.set(`${posKey(c.position.x, c.position.y, c.position.z)}|${dirKey(s.direction.x, s.direction.y, s.direction.z)}`, stickerOf.length);
    stickerOf.push({ cubie: c.id, k });
  });
  const parent = stickerOf.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const slotDest: Uint8Array[] = [];
  for (const [axis, layer, sign] of WING_MOVES) {
    const copy = cloneCubies(solved);
    applyRawQuarterTurn(copy, axis, layer, sign);
    const byId = new Map(copy.map((c) => [c.id, c]));
    slotDest.push(
      Uint8Array.from(wings.map((w) => {
        const q = byId.get(w.id)!;
        return slotOfPos.get(posKey(q.position.x, q.position.y, q.position.z))!;
      })),
    );
    stickerOf.forEach((st, i) => {
      const q = byId.get(st.cubie)!;
      const d = q.stickers[st.k].direction.clone().applyQuaternion(q.orientation);
      const j = stickerIndex.get(`${posKey(q.position.x, q.position.y, q.position.z)}|${dirKey(d.x, d.y, d.z)}`)!;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[a] = b;
    });
  }
  const roots = [...new Set(stickerOf.map((_, i) => find(i)))];
  if (roots.length !== 2) throw new Error(`fiveByFiveWings: expected 2 wing sticker orbits, found ${roots.length}`);
  const orbitOfSticker = new Map<number, number[]>();
  const pieceColor: Face[][] = wings.map(() => [] as Face[]);
  const slotDir: [string, string][] = wings.map(() => ["", ""]);
  stickerOf.forEach((st, i) => {
    const orbit = roots.indexOf(find(i));
    const arr = orbitOfSticker.get(st.cubie) ?? [];
    arr[st.k] = orbit;
    orbitOfSticker.set(st.cubie, arr);
    const cubie = wings.find((w) => w.id === st.cubie)!;
    pieceColor[pieceOfId.get(st.cubie)!][orbit] = cubie.stickers[st.k].color;
    const d = cubie.stickers[st.k].direction;
    slotDir[pieceOfId.get(st.cubie)!][orbit] = dirKey(d.x, d.y, d.z); // solved: piece p sits in slot p
  });
  modelCache = { n, slotOfPos, slotPos, pieceOfId, pieceColor, orbitOfSticker, slotDir, slotDest };
  return modelCache;
}

interface Tools {
  base: [number, number, number];
  commutator: number[];
  pathTo: Map<number, number[]>;
}
let toolsCache: Tools | null = null;
const tripleKey = (a: number, b: number, c: number) => (a * 32 + b) * 32 + c;

function getTools(): Tools {
  if (toolsCache) return toolsCache;
  const model = getModel();
  const commutator = [...COMMUTATOR.a, ...COMMUTATOR.b, ...inverseWord(COMMUTATOR.a), ...inverseWord(COMMUTATOR.b)];
  let perm: Uint8Array = Uint8Array.from({ length: model.n }, (_, i) => i);
  for (const m of commutator) perm = perm.map((s) => model.slotDest[m][s]);
  const moved: number[] = [];
  perm.forEach((to, from) => {
    if (to !== from) moved.push(from);
  });
  if (moved.length !== 3) throw new Error("fiveByFiveWings: commutator does not move exactly three wings");
  const base: [number, number, number] = [moved[0], perm[moved[0]], perm[perm[moved[0]]]];

  const parent = new Map<number, { prev: number; move: number }>();
  parent.set(tripleKey(...base), { prev: -1, move: -1 });
  let frontier: [number, number, number][] = [base];
  while (frontier.length) {
    const next: [number, number, number][] = [];
    for (const t of frontier) {
      const tk = tripleKey(...t);
      for (let m = 0; m < WING_MOVES.length; m++) {
        const nt: [number, number, number] = [model.slotDest[m][t[0]], model.slotDest[m][t[1]], model.slotDest[m][t[2]]];
        const k = tripleKey(...nt);
        if (parent.has(k)) continue;
        parent.set(k, { prev: tk, move: m });
        next.push(nt);
      }
    }
    frontier = next;
  }
  const pathTo = new Map<number, number[]>();
  for (const k of parent.keys()) {
    const word: number[] = [];
    for (let cur = k; parent.get(cur)!.prev !== -1; cur = parent.get(cur)!.prev) word.push(parent.get(cur)!.move);
    pathTo.set(k, word.reverse());
  }
  toolsCache = { base, commutator, pathTo };
  return toolsCache;
}

function macroFor(tools: Tools, q: number, p: number, r: number): number[] | null {
  const w = tools.pathTo.get(tripleKey(q, p, r));
  return w ? [...inverseWord(w), ...tools.commutator, ...w] : null;
}

function simplify(word: number[]): number[] {
  const out: number[] = [];
  for (const m of word) {
    if (out.length && (out[out.length - 1] ^ 1) === m) out.pop();
    else out.push(m);
  }
  return out;
}

function colorFacing(cubie: Cubie, dir: string): Face {
  for (const s of cubie.stickers) {
    const d = s.direction.clone().applyQuaternion(cubie.orientation);
    if (dirKey(d.x, d.y, d.z) === dir) return s.color;
  }
  throw new Error("fiveByFiveWings: true edge has no sticker facing that direction");
}

export interface WingArrangement {
  /** cur[s] = piece currently in wing slot s */
  cur: number[];
  /** target[s] = piece that must be in slot s for the wing to match the true edge of its line */
  target: number[];
}

/** Current wing arrangement and the pairing target of a 5x5x5 (null when the cubies are not a 5x5x5 state this model can read). */
export function readWingArrangement(cubies: readonly Cubie[]): WingArrangement | null {
  const model = getModel();
  const cur: number[] = new Array(model.n).fill(-1);
  const trueEdgeAt = new Map<string, Cubie>();
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t === "wingEdge") {
      const slot = model.slotOfPos.get(posKey(roundedComponent(c.position, "x"), roundedComponent(c.position, "y"), roundedComponent(c.position, "z")));
      const piece = model.pieceOfId.get(c.id);
      if (slot === undefined || piece === undefined) return null;
      cur[slot] = piece;
    } else if (t === "trueEdge") {
      trueEdgeAt.set(posKey(roundedComponent(c.position, "x"), roundedComponent(c.position, "y"), roundedComponent(c.position, "z")), c);
    }
  }
  if (cur.some((p) => p < 0)) return null;
  const target: number[] = new Array(model.n).fill(-1);
  for (let s = 0; s < model.n; s++) {
    const [x, y, z] = model.slotPos[s];
    // the true edge of this wing's line: same two boundary coordinates, 0 along the line
    const t = trueEdgeAt.get(posKey(Math.abs(x) === 2 ? x : 0, Math.abs(y) === 2 ? y : 0, Math.abs(z) === 2 ? z : 0));
    if (!t) return null;
    const c0 = colorFacing(t, model.slotDir[s][0]);
    const c1 = colorFacing(t, model.slotDir[s][1]);
    const piece = model.pieceColor.findIndex((pc) => pc[0] === c0 && pc[1] === c1);
    if (piece < 0) return null;
    target[s] = piece;
  }
  if (new Set(target).size !== model.n) return null;
  return { cur, target };
}

/**
 * Moves (quarter turns) that pair every wing with the true edge of its line using only pure wing 3-cycles,
 * or null when the target permutation is odd (a 3-cycle sort cannot reach it). Does not mutate `cubies`.
 */
export function solveWingsByCommutator5(cubies: readonly Cubie[]): Move[] | null {
  const model = getModel();
  const arr = readWingArrangement(cubies);
  if (!arr) throw new Error("fiveByFiveWings: cannot read the wing arrangement");
  const tools = getTools();
  const cur = arr.cur.slice();
  const { target } = arr;
  const word: number[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const wrong: number[] = [];
    for (let s = 0; s < model.n; s++) if (cur[s] !== target[s]) wrong.push(s);
    if (wrong.length === 0) return simplify(word).map((m) => WING_MOVES[m]);
    if (wrong.length === 2) return null; // a single transposition left: odd permutation
    let best: { after: number; cost: number; q: number; p: number; r: number; macro: number[] } | null = null;
    for (const p of wrong) {
      const q = cur.indexOf(target[p]);
      for (let r = 0; r < model.n; r++) {
        if (r === p || r === q) continue;
        let after = wrong.length;
        const was = (s: number) => cur[s] !== target[s];
        const placed: [number, number][] = [
          [p, cur[q]],
          [r, cur[p]],
          [q, cur[r]],
        ];
        for (const [s, piece] of placed) {
          const now = piece !== target[s];
          if (was(s) && !now) after--;
          else if (!was(s) && now) after++;
        }
        if (after >= wrong.length) continue;
        const macro = macroFor(tools, q, p, r);
        if (!macro) continue;
        if (!best || after < best.after || (after === best.after && macro.length < best.cost)) best = { after, cost: macro.length, q, p, r, macro };
      }
    }
    if (!best) return null;
    const { q, p, r, macro } = best;
    const [pq, pp, pr] = [cur[q], cur[p], cur[r]];
    cur[p] = pq;
    cur[r] = pp;
    cur[q] = pr;
    word.push(...macro);
  }
  return null;
}
