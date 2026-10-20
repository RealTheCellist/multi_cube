// Fast axial solver for Master/Professor Pyraminx (N=4/5), replacing the
// whole-axial meet-in-the-middle search (millions of states, up to 20+s on
// hard N=5 scrambles) with two small steps. Imports types only, so it is safe
// for both worker entry files (see masterTetraminxSolver.ts's header).
//
// Group structure, checked with a computer-algebra system on the real move
// permutations (not assumed):
//   - N=5: the 40 axial slots split into orbits 3,3,3,3,4,12,12. The two
//     12-orbits are always in lock-step (together they form ONE copy of A12:
//     order 239,500,800), and the whole axial group is that A12 times the
//     small group on the other orbits (order 972) -- a direct product
//     (239,500,800 * 972 = 232,794,777,600 = the full group order).
//   - N=4: orbits 3,3,3,3,12; the group is the product of the 12-orbit's
//     action (order 11,520) and the small orbits' (order 81); together with
//     the 4 centers (A4, order 12) the kernel group has order 81 * 12 = 972.
// So: (1) meet-in-the-middle over ONE 12-orbit's own 12 slots (well under
// 200k states), then (2) whatever is still wrong on the remaining axial slots
// is fixed by a precomputed "kernel word": a short move sequence leaving the
// main orbit untouched that realises any one of the small group's elements
// (data/tetraAxialKernelWords.json, built offline by kernel-words-gen).
import type { PrecomputedMoves, TetraMove } from "./masterTetraminxSolver";
import kernelWordsData from "./data/tetraAxialKernelWords.json";

const KERNEL_WORDS = kernelWordsData as unknown as Record<string, readonly string[]>;
const MAIN_ORBIT_SIZE = 12;

function moveKey(m: TetraMove): string {
  return `${m.vertexIndex}_${m.depth}_${m.sign}`;
}

export interface AxialSplit {
  /** Global slot indices of the searched orbit (12 of them), in ascending order. */
  main: number[];
  /** Every other axial slot, ascending (plus the centers for N=4). */
  rest: number[];
  /** Pull permutation of each move (same order as pre.allMoves) restricted to `main`, in main-local indices. */
  mainPerms: Uint8Array[];
  /** Same for `rest`, in rest-local indices. */
  restPerms: Uint8Array[];
}

const splitCache = new Map<number, AxialSplit | null>();

/** null when this layerCount has no 12-slot axial orbit (N=3 and N>=6 do not use this path). */
export function axialSplit(pre: PrecomputedMoves): AxialSplit | null {
  if (splitCache.has(pre.layerCount)) return splitCache.get(pre.layerCount)!;
  const axial: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "axial") axial.push(i);
  // orbits by union-find over every move's piece movement
  const parent = new Map<number, number>(axial.map((s) => [s, s]));
  const find = (x: number): number => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const move of pre.allMoves) {
    const perm = pre.permByMove.get(moveKey(move))!;
    for (const s of axial) {
      const a = find(s);
      const b = find(perm[s]);
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
    }
  }
  const orbits = new Map<number, number[]>();
  for (const s of axial) {
    const r = find(s);
    if (!orbits.has(r)) orbits.set(r, []);
    orbits.get(r)!.push(s);
  }
  const main = [...orbits.values()].filter((o) => o.length === MAIN_ORBIT_SIZE).sort((a, b) => a[0] - b[0])[0];
  if (!main) {
    splitCache.set(pre.layerCount, null);
    return null;
  }
  const mainSet = new Set(main);
  // N=4 also folds the 4 centers into the kernel part: with only axial fixed, the old center
  // cleanup (pure-center Klein-4 swaps, the only pure-center moves that exist for N=4) fails
  // whenever the leftover center arrangement is one of the 8 three-cycles of A4 -- and A4 is
  // exactly what the axial-fixing words realise on the centers (checked by group order). So the
  // kernel words here fix the centers too.
  const centers: number[] = [];
  if (pre.layerCount === 4) for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "center") centers.push(i);
  const rest = [...axial.filter((s) => !mainSet.has(s)), ...centers];
  const localOf = (slots: number[]) => new Map<number, number>(slots.map((s, i) => [s, i]));
  const mainPos = localOf(main);
  const restPos = localOf(rest);
  const split: AxialSplit = {
    main,
    rest,
    mainPerms: pre.allMoves.map((m) => {
      const p = pre.permByMove.get(moveKey(m))!;
      return Uint8Array.from(main.map((s) => mainPos.get(p[s])!));
    }),
    restPerms: pre.allMoves.map((m) => {
      const p = pre.permByMove.get(moveKey(m))!;
      return Uint8Array.from(rest.map((s) => restPos.get(p[s])!));
    }),
  };
  splitCache.set(pre.layerCount, split);
  return split;
}

/**
 * Meet-in-the-middle over one orbit's own arrangement (at most 12 slots, so a state packs into a number); returns
 * move indices into `perms` or null. Moves must come in inverse pairs: move m's inverse is m ^ 1.
 */
export function searchPermutationOrbit(start: Uint8Array, perms: Uint8Array[], maxDepthEachSide: number, maxStates: number): number[] | null {
  const n = start.length;
  const keyOf = (s: Uint8Array): number => {
    let k = 0;
    for (let i = 0; i < n; i++) k = k * 16 + s[i]; // n <= 12 entries of 4 bits: < 2^48
    return k;
  };
  interface Side {
    keys: Map<number, number>;
    states: Uint8Array[];
    parent: number[];
    move: number[];
    frontier: number[];
  }
  const mk = (root: Uint8Array): Side => ({ keys: new Map([[keyOf(root), 0]]), states: [root], parent: [-1], move: [-1], frontier: [0] });
  const solved = Uint8Array.from({ length: n }, (_, i) => i);
  const fwd = mk(start);
  const bwd = mk(solved);
  if (fwd.keys.has(keyOf(solved))) return [];

  const pathOf = (side: Side, idx: number): number[] => {
    const out: number[] = [];
    for (let i = idx; side.move[i] !== -1; i = side.parent[i]) out.push(side.move[i]);
    return out.reverse();
  };
  const inverseOf = (m: number) => m ^ 1; // moves come in (sign +1, sign -1) pairs
  const finish = (f: number, b: number): number[] => [...pathOf(fwd, f), ...pathOf(bwd, b).reverse().map(inverseOf)];

  const expand = (me: Side, other: Side, isFwd: boolean): number[] | null | undefined => {
    const next: number[] = [];
    for (const row of me.frontier) {
      const s = me.states[row];
      for (let m = 0; m < perms.length; m++) {
        const p = perms[m];
        const t = new Uint8Array(n);
        for (let i = 0; i < n; i++) t[i] = s[p[i]];
        const k = keyOf(t);
        if (me.keys.has(k)) continue;
        const idx = me.states.length;
        me.keys.set(k, idx);
        me.states.push(t);
        me.parent.push(row);
        me.move.push(m);
        next.push(idx);
        if (fwd.states.length + bwd.states.length > maxStates) return null;
        const o = other.keys.get(k);
        if (o !== undefined) return isFwd ? finish(idx, o) : finish(o, idx);
      }
    }
    me.frontier = next;
    return undefined;
  };
  for (let d = 0; d < maxDepthEachSide; d++) {
    const a = expand(fwd, bwd, true);
    if (a !== undefined) return a;
    const b = expand(bwd, fwd, false);
    if (b !== undefined) return b;
  }
  return null;
}

const kernelTables = new Map<number, Map<string, string>>();
function restKey(c: ArrayLike<number>): string {
  return String.fromCharCode.apply(null, Array.from(c, (v) => v + 48));
}
function kernelTable(pre: PrecomputedMoves, split: AxialSplit): Map<string, string> | null {
  const cached = kernelTables.get(pre.layerCount);
  if (cached) return cached;
  const words = KERNEL_WORDS[String(pre.layerCount)];
  if (!words) return null;
  const n = split.rest.length;
  const table = new Map<string, string>();
  for (const word of words) {
    let c = Uint8Array.from({ length: n }, (_, i) => i);
    for (let k = 0; k < word.length; k++) {
      const t = split.restPerms[word.charCodeAt(k) - 48];
      const next = new Uint8Array(n);
      for (let i = 0; i < n; i++) next[i] = c[t[i]];
      c = next;
    }
    table.set(restKey(c), word);
  }
  kernelTables.set(pre.layerCount, table);
  return table;
}

/**
 * Solves every axial slot: returns the raw move sequence, or null when this
 * layerCount isn't covered, the search exceeds its budget, or (defensively)
 * the result does not actually leave axial solved.
 */
export function solveAxialDecomposed(pre: PrecomputedMoves, startPieces: readonly number[], maxStates = 4_000_000): TetraMove[] | null {
  const split = axialSplit(pre);
  if (!split) return null;
  const table = kernelTable(pre, split);
  if (!table) return null;

  const mainPos = new Map<number, number>(split.main.map((s, i) => [s, i]));
  const start = Uint8Array.from(split.main.map((s) => mainPos.get(startPieces[s])!));
  const mainMoves = searchPermutationOrbit(start, split.mainPerms, 10, maxStates);
  if (!mainMoves) return null;

  // follow the real full-slot pattern through those moves
  let pieces = startPieces.slice();
  for (const mi of mainMoves) {
    const perm = pre.permByMove.get(moveKey(pre.allMoves[mi]))!;
    pieces = pieces.map((_, i) => pieces[perm[i]]);
  }
  const restPos = new Map<number, number>(split.rest.map((s, i) => [s, i]));
  const x = split.rest.map((s) => restPos.get(pieces[s]));
  const moves = mainMoves.slice();
  if (x.some((v, i) => v !== i)) {
    if (x.some((v) => v === undefined)) return null; // a main-orbit piece left its orbit: impossible, but never guess
    const inv = new Array<number>(x.length);
    (x as number[]).forEach((v, i) => (inv[v] = i));
    const word = table.get(restKey(inv));
    if (word === undefined) return null;
    for (let k = 0; k < word.length; k++) moves.push(word.charCodeAt(k) - 48);
  }
  // verify against the real permutations before handing it back
  let check = startPieces.slice();
  for (const mi of moves) {
    const perm = pre.permByMove.get(moveKey(pre.allMoves[mi]))!;
    check = check.map((_, i) => check[perm[i]]);
  }
  for (const s of split.main.concat(split.rest)) if (check[s] !== s) return null;
  return moves.map((mi) => pre.allMoves[mi]);
}
