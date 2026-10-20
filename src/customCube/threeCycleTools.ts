// Shared by the 5x5x5 center and wing solvers: given the move permutations of a piece set and a list of
// commutators [A, B] that each move exactly three pieces, builds the cheapest "3-cycle macro" for any
// ordered triple of slots -- a conjugate  W' C W  of one of the commutators C, where W carries C's own
// three slots onto the requested ones.
//
// The setup words W come from a multi-source Dijkstra over ordered slot triples: every commutator (in both
// directions and all three rotations of its cycle) is a source whose starting cost is its own length, and
// each setup move costs 2 (it is played once before the commutator and once, inverted, after). Having
// hundreds of commutators as sources keeps the typical setup to 0-2 moves.

export interface CommutatorWords {
  a: number[];
  b: number[];
}

export interface CycleTools {
  /** Move word that sends the piece at q to p, the piece at p to r and the piece at r to q (and moves no other piece of the set), or null if unreachable. */
  macroFor(q: number, p: number, r: number): number[] | null;
}

const inverseWord = (w: readonly number[]): number[] => [...w].reverse().map((m) => m ^ 1);
const key3 = (a: number, b: number, c: number) => (a * 64 + b) * 64 + c;

export function buildCycleTools(dest: readonly Uint8Array[], commutators: readonly CommutatorWords[]): CycleTools {
  const n = dest[0].length;
  const words: number[][] = [];
  for (const { a, b } of commutators) {
    words.push([...a, ...b, ...inverseWord(a), ...inverseWord(b)]);
    words.push([...b, ...a, ...inverseWord(b), ...inverseWord(a)]); // the inverse commutator: the opposite cycle
  }
  words.sort((x, y) => x.length - y.length);

  interface Entry {
    cost: number;
    prev: number;
    move: number;
    root: number;
  }
  const best = new Map<number, Entry>();
  const buckets = new Map<number, number[][]>();
  const push = (cost: number, triple: number[]) => {
    const list = buckets.get(cost) ?? [];
    list.push(triple);
    buckets.set(cost, list);
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
      const t = [cyc[rot], cyc[(rot + 1) % 3], cyc[(rot + 2) % 3]];
      const k = key3(t[0], t[1], t[2]);
      const have = best.get(k);
      if (have && have.cost <= word.length) continue;
      best.set(k, { cost: word.length, prev: -1, move: -1, root: id });
      push(word.length, t);
    }
  });

  while (buckets.size > 0) {
    const cost = Math.min(...buckets.keys());
    const list = buckets.get(cost)!;
    buckets.delete(cost);
    for (const t of list) {
      const k = key3(t[0], t[1], t[2]);
      if (best.get(k)!.cost !== cost) continue; // stale
      for (let m = 0; m < dest.length; m++) {
        const nt = [dest[m][t[0]], dest[m][t[1]], dest[m][t[2]]];
        const nk = key3(nt[0], nt[1], nt[2]);
        const nc = cost + 2;
        const have = best.get(nk);
        if (have && have.cost <= nc) continue;
        best.set(nk, { cost: nc, prev: k, move: m, root: best.get(k)!.root });
        push(nc, nt);
      }
    }
  }

  const memo = new Map<number, number[] | null>();
  return {
    macroFor(q, p, r) {
      const k = key3(q, p, r);
      if (memo.has(k)) return memo.get(k)!;
      const entry = best.get(k);
      let result: number[] | null = null;
      if (entry) {
        const setup: number[] = [];
        for (let cur: Entry | undefined = entry; cur && cur.prev !== -1; cur = best.get(cur.prev)) setup.push(cur.move);
        setup.reverse();
        result = [...inverseWord(setup), ...words[entry.root], ...setup];
      }
      memo.set(k, result);
      return result;
    },
  };
}
