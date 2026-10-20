// Shared by the 5x5x5 center/wing solvers and the Gigaminx solver: given the move permutations of a piece set and
// a list of commutators [A, B] that each move exactly three pieces, builds the cheapest "3-cycle macro" for any
// ordered triple of slots -- a conjugate  W' C W  of one of the commutators C, where W carries C's own three
// slots onto the requested ones.
//
// The setup words W come from a multi-source Dijkstra over ordered slot triples: every commutator (in both
// directions and all three rotations of its cycle) is a source whose starting cost is its own length, and each
// setup move costs 2 (it is played once before the commutator and once, inverted, after). Having hundreds of
// commutators as sources keeps the typical setup to 0-2 moves. Slots must number at most 64.

export interface CommutatorWords {
  a: number[];
  b: number[];
}

export interface CycleTools {
  /** Move word that sends the piece at q to p, the piece at p to r and the piece at r to q (and moves no other piece of the set), or null if unreachable. */
  macroFor(q: number, p: number, r: number): number[] | null;
}

const inverseWord = (w: readonly number[]): number[] => [...w].reverse().map((m) => m ^ 1);
const key3 = (a: number, b: number, c: number) => (a << 12) | (b << 6) | c; // 18 bits for slots < 64
const UNSEEN = 32767;

export function buildCycleTools(dest: readonly Uint8Array[], commutators: readonly CommutatorWords[]): CycleTools {
  const n = dest[0].length;
  if (n > 64) throw new Error("threeCycleTools: at most 64 slots");
  const nm = dest.length;
  const words: number[][] = [];
  for (const { a, b } of commutators) {
    words.push([...a, ...b, ...inverseWord(a), ...inverseWord(b)]);
    words.push([...b, ...a, ...inverseWord(b), ...inverseWord(a)]); // the inverse commutator: the opposite cycle
  }
  words.sort((x, y) => x.length - y.length);

  const size = 1 << 18;
  const cost = new Int16Array(size).fill(UNSEEN);
  const prev = new Int32Array(size).fill(-1);
  const move = new Int16Array(size).fill(-1);
  const root = new Int32Array(size).fill(-1);
  const buckets: number[][] = [];
  const push = (c: number, k: number) => {
    while (buckets.length <= c) buckets.push([]);
    buckets[c].push(k);
  };
  words.forEach((word, id) => {
    let perm: Uint8Array = Uint8Array.from({ length: n }, (_, i) => i);
    for (const m of word) perm = perm.map((s) => dest[m][s]);
    const moved: number[] = [];
    perm.forEach((to, from) => {
      if (to !== from) moved.push(from);
    });
    if (moved.length !== 3) throw new Error("threeCycleTools: a commutator does not move exactly three pieces");
    const x = moved[0];
    const cyc = [x, perm[x], perm[perm[x]]];
    for (let rot = 0; rot < 3; rot++) {
      const k = key3(cyc[rot], cyc[(rot + 1) % 3], cyc[(rot + 2) % 3]);
      if (cost[k] <= word.length) continue;
      cost[k] = word.length;
      root[k] = id;
      push(word.length, k);
    }
  });

  for (let c = 0; c < buckets.length; c++) {
    const list = buckets[c];
    for (let li = 0; li < list.length; li++) {
      const k = list[li];
      if (cost[k] !== c) continue; // stale
      const a = k >> 12;
      const b = (k >> 6) & 63;
      const cc = k & 63;
      for (let m = 0; m < nm; m++) {
        const d = dest[m];
        const nk = key3(d[a], d[b], d[cc]);
        const nc = c + 2;
        if (cost[nk] <= nc) continue;
        cost[nk] = nc;
        prev[nk] = k;
        move[nk] = m;
        root[nk] = root[k];
        push(nc, nk);
      }
    }
    buckets[c] = []; // free as we go
  }

  const memo = new Map<number, number[] | null>();
  return {
    macroFor(q, p, r) {
      const k = key3(q, p, r);
      const hit = memo.get(k);
      if (hit !== undefined) return hit;
      let result: number[] | null = null;
      if (cost[k] !== UNSEEN) {
        const setup: number[] = [];
        for (let cur = k; prev[cur] !== -1; cur = prev[cur]) setup.push(move[cur]);
        setup.reverse();
        result = [...inverseWord(setup), ...words[root[k]], ...setup];
      }
      memo.set(k, result);
      return result;
    },
  };
}
