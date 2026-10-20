// Greedy macro solver for an orbit of pieces that have a position and an orientation (corners mod 3, edges mod 2),
// shared by the Megaminx, Master Kilominx and Kilominx solvers.
//
// A macro is a move word whose net effect on the orbit touches only a few pieces: a conjugate S C S' of a
// "confined" commutator C (one that changes only this orbit and only a handful of its pieces, found offline by
// megaminx-gen/), where S is a short setup. Each macro's effect is computed once by composing the move tables; solving
// is then repeated greedy selection of the macro that fixes the most pieces per move.

import { buildCycleTools } from "../customCube/threeCycleTools";

export interface OrbitMoves {
  /** pieces in the orbit (positions 0..n-1) */
  n: number;
  /** orientation modulus (3 for corners, 2 for edges) */
  mod: number;
  /** from[m][pos]: after move m, position `pos` holds what position from[m][pos] held (pull convention) */
  from: readonly Int8Array[];
  /** delta[m][pos]: orientation added to the piece that lands on `pos` */
  delta: readonly Int8Array[];
}

export interface CommutatorWords {
  a: number[];
  b: number[];
}

interface Macro {
  word: number[];
  /** touched positions, the position each one's new piece comes from, and the orientation added */
  pos: Int8Array;
  src: Int8Array;
  add: Int8Array;
}

export interface OrbitMacros {
  moves: OrbitMoves;
  macros: Macro[];
}

const inverseWord = (w: readonly number[]): number[] => [...w].reverse().map((m) => m ^ 1);

/**
 * Effect of a move word on the orbit, as (from, add) arrays: new[pos] = old[from[pos]] with orientation + add[pos].
 * Two scratch buffer pairs are swapped move by move so nothing is allocated per move; the result is a view of
 * the scratch space, valid until the next call.
 */
function makeEffectComputer(moves: OrbitMoves): (word: readonly number[]) => { from: Int8Array; add: Int8Array } {
  const { n, mod } = moves;
  let fromA = new Int8Array(n);
  let addA = new Int8Array(n);
  let fromB = new Int8Array(n);
  let addB = new Int8Array(n);
  return (word) => {
    for (let i = 0; i < n; i++) {
      fromA[i] = i;
      addA[i] = 0;
    }
    for (let w = 0; w < word.length; w++) {
      const fm = moves.from[word[w]];
      const dm = moves.delta[word[w]];
      for (let pos = 0; pos < n; pos++) {
        const f = fm[pos];
        fromB[pos] = fromA[f];
        addB[pos] = (addA[f] + dm[pos]) % mod;
      }
      [fromA, fromB] = [fromB, fromA];
      [addA, addB] = [addB, addA];
    }
    return { from: fromA, add: addA };
  };
}

/** Builds every macro S C S' for the given commutators and setups (words), keeping the shortest word per distinct effect. */
export function buildOrbitMacros(moves: OrbitMoves, commutators: readonly CommutatorWords[], setups: readonly (readonly number[])[], withOrientationOnlyMacros = false): OrbitMacros {
  const byEffect = new Map<string, Macro>();
  const effectOf = makeEffectComputer(moves);
  for (const { a, b } of commutators) {
    const core = [...a, ...b, ...inverseWord(a), ...inverseWord(b)];
    for (const direction of [core, inverseWord(core)]) {
      for (const s of setups) {
        const word = [...s, ...direction, ...inverseWord(s)];
        const { from, add } = effectOf(word);
        const pos: number[] = [];
        for (let p = 0; p < moves.n; p++) if (from[p] !== p || add[p] !== 0) pos.push(p);
        if (pos.length === 0) continue;
        const key = pos.map((p) => `${p}:${from[p]}:${add[p]}`).join("|");
        const have = byEffect.get(key);
        if (have && have.word.length <= word.length) continue;
        byEffect.set(key, { word, pos: Int8Array.from(pos), src: Int8Array.from(pos.map((p) => from[p])), add: Int8Array.from(pos.map((p) => add[p])) });
      }
    }
  }
  addTripleMacros(moves, commutators, byEffect, effectOf);
  if (withOrientationOnlyMacros) {
    addOrientationOnlyMacros(moves, byEffect, effectOf);
    addPairMacros(moves, byEffect, effectOf);
  }
  return { moves, macros: [...byEffect.values()] };
}

/**
 * A macro for EVERY ordered triple of positions: the commutators that 3-cycle three pieces (twists allowed) are the
 * sources of a multi-source search over triples (threeCycleTools.ts), so a leftover 3-cycle can always be undone even
 * when the setup-limited library above has no macro for exactly those positions. The twists such a macro leaves behind
 * are cleaned up afterwards by the pair macros.
 */
function addTripleMacros(moves: OrbitMoves, commutators: readonly CommutatorWords[], byEffect: Map<string, Macro>, effectOf: (word: readonly number[]) => { from: Int8Array; add: Int8Array }): void {
  const { n } = moves;
  const cycles: CommutatorWords[] = [];
  for (const c of commutators) {
    const { from } = effectOf([...c.a, ...c.b, ...inverseWord(c.a), ...inverseWord(c.b)]);
    let moved = 0;
    for (let p = 0; p < n; p++) if (from[p] !== p) moved++;
    if (moved === 3) cycles.push(c);
  }
  if (cycles.length === 0) return;
  const dest: Uint8Array[] = moves.from.map((f) => {
    const d = new Uint8Array(n);
    f.forEach((from, pos) => (d[from] = pos));
    return d;
  });
  const tools = buildCycleTools(dest, cycles);
  for (let q = 0; q < n; q++) {
    for (let p = 0; p < n; p++) {
      if (p === q) continue;
      for (let r = 0; r < n; r++) {
        if (r === q || r === p) continue;
        const word = tools.macroFor(q, p, r);
        if (!word) continue;
        const { from, add } = effectOf(word);
        const pos: number[] = [];
        for (let x = 0; x < n; x++) if (from[x] !== x || add[x] !== 0) pos.push(x);
        if (pos.length === 0) continue;
        const key = pos.map((x) => `${x}:${from[x]}:${add[x]}`).join("|");
        const have = byEffect.get(key);
        if (have && have.word.length <= word.length) continue;
        byEffect.set(key, { word, pos: Int8Array.from(pos), src: Int8Array.from(pos.map((x) => from[x])), add: Int8Array.from(pos.map((x) => add[x])) });
      }
    }
  }
}

/**
 * Pure twists/flips: two macros that move the same pieces the same way but add different orientations differ by a macro
 * that only changes orientations (m1 followed by the inverse of m2). Those are what the last wrong orientations need.
 */
function addOrientationOnlyMacros(moves: OrbitMoves, byEffect: Map<string, Macro>, effectOf: (word: readonly number[]) => { from: Int8Array; add: Int8Array }): void {
  const wantedPatterns = moves.mod === 2 ? 1 : 2; // flips: (1,1); twists: (1,2) and (2,1)
  const foundPatterns = new Set<string>();
  const groups = new Map<string, Macro[]>();
  for (const macro of byEffect.values()) {
    const key = Array.from(macro.pos).map((p, i) => `${p}:${macro.src[i]}`).join("|");
    const list = groups.get(key) ?? [];
    list.push(macro);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (foundPatterns.size >= wantedPatterns) break;
    if (list.length < 2) continue;
    list.sort((x, y) => x.word.length - y.word.length);
    const limited = list.slice(0, 4);
    for (const m1 of limited) {
      for (const m2 of limited) {
        if (m1 === m2) continue;
        const word = [...m1.word, ...inverseWord(m2.word)];
        const { from, add } = effectOf(word);
        const pos: number[] = [];
        for (let p = 0; p < moves.n; p++) if (from[p] !== p || add[p] !== 0) pos.push(p);
        if (pos.length === 0 || pos.some((p) => from[p] !== p)) continue; // keep only pure orientation changes
        if (pos.length === 2) foundPatterns.add(`${add[pos[0]]},${add[pos[1]]}`);
        const key = pos.map((p) => `${p}:${from[p]}:${add[p]}`).join("|");
        const have = byEffect.get(key);
        if (have && have.word.length <= word.length) continue;
        byEffect.set(key, { word, pos: Int8Array.from(pos), src: Int8Array.from(pos.map((p) => from[p])), add: Int8Array.from(pos.map((p) => add[p])) });
      }
    }
  }
}

/**
 * Pure twists/flips of two pieces for EVERY ordered pair of positions: take each distinct base orientation-only macro
 * that touches exactly two positions and conjugate it by the shortest word that carries its two positions onto the
 * wanted pair (breadth-first search over ordered pairs). This is what the very last wrong orientations need, and it
 * does not depend on which pairs the commutator library happens to cover.
 */
function addPairMacros(moves: OrbitMoves, byEffect: Map<string, Macro>, effectOf: (word: readonly number[]) => { from: Int8Array; add: Int8Array }): void {
  const { n } = moves;
  const nm = moves.from.length;
  const dest: Int8Array[] = moves.from.map((f) => {
    const d = new Int8Array(n);
    f.forEach((from, pos) => (d[from] = pos)); // the piece at `from` lands on `pos`
    return d;
  });
  const bases: Macro[] = [];
  const seenPattern = new Set<string>();
  const pure = [...byEffect.values()].filter((m) => m.pos.length === 2 && m.pos.every((p, i) => m.src[i] === p)).sort((x, y) => x.word.length - y.word.length);
  for (const m of pure) {
    const pattern = `${m.add[0]},${m.add[1]}`;
    if (seenPattern.has(pattern)) continue;
    seenPattern.add(pattern);
    bases.push(m);
  }
  for (const base of bases) {
    const a0 = base.pos[0];
    const b0 = base.pos[1];
    const parent = new Map<number, { prev: number; move: number }>();
    parent.set(a0 * n + b0, { prev: -1, move: -1 });
    let frontier = [a0 * n + b0];
    while (frontier.length) {
      const next: number[] = [];
      for (const k of frontier) {
        const a = Math.floor(k / n);
        const b = k % n;
        for (let m = 0; m < nm; m++) {
          const nk = dest[m][a] * n + dest[m][b];
          if (parent.has(nk)) continue;
          parent.set(nk, { prev: k, move: m });
          next.push(nk);
        }
      }
      frontier = next;
    }
    for (const k of parent.keys()) {
      const path: number[] = [];
      for (let cur = k; parent.get(cur)!.prev !== -1; cur = parent.get(cur)!.prev) path.push(parent.get(cur)!.move);
      path.reverse();
      const word = [...inverseWord(path), ...base.word, ...path];
      const { from, add } = effectOf(word);
      const pos: number[] = [];
      for (let p = 0; p < n; p++) if (from[p] !== p || add[p] !== 0) pos.push(p);
      if (pos.length === 0) continue;
      const key = pos.map((p) => `${p}:${from[p]}:${add[p]}`).join("|");
      const have = byEffect.get(key);
      if (have && have.word.length <= word.length) continue;
      byEffect.set(key, { word, pos: Int8Array.from(pos), src: Int8Array.from(pos.map((p) => from[p])), add: Int8Array.from(pos.map((p) => add[p])) });
    }
  }
}

/** Cancels adjacent inverse moves left where macros meet. */
function simplify(word: number[]): number[] {
  const out: number[] = [];
  for (const m of word) {
    if (out.length && (out[out.length - 1] ^ 1) === m) out.pop();
    else out.push(m);
  }
  return out;
}

/** Move word that puts every piece of the orbit home with orientation 0. Throws if the greedy search stalls. Does not mutate its inputs. */
export function solveOrbitWithMacros(lib: OrbitMacros, perm0: ArrayLike<number>, orient0: ArrayLike<number>): number[] {
  const { n, mod } = lib.moves;
  const perm = Int8Array.from(perm0 as ArrayLike<number>);
  const orient = Int8Array.from(orient0 as ArrayLike<number>);
  const word: number[] = [];
  // A piece counts as wrong if it is misplaced or home but twisted. (Weighing misplaced pieces more was tried: the
  // plans got longer, 352-388 vs 342 moves.)
  const weightAt = (p: number) => (perm[p] !== p || orient[p] !== 0 ? 1 : 0);
  for (let guard = 0; guard < 300; guard++) {
    let wrong = 0;
    for (let p = 0; p < n; p++) wrong += weightAt(p);
    if (wrong === 0) return simplify(word);
    let best: Macro | null = null;
    let bestScore = 0;
    for (const macro of lib.macros) {
      const k = macro.pos.length;
      let gain = 0;
      for (let i = 0; i < k; i++) {
        const p = macro.pos[i];
        const s = macro.src[i];
        gain += weightAt(p);
        gain -= perm[s] !== p || (orient[s] + macro.add[i]) % mod !== 0 ? 1 : 0;
      }
      if (gain <= 0) continue;
      const score = gain / macro.word.length + gain * 1e-6;
      if (score > bestScore) {
        bestScore = score;
        best = macro;
      }
    }
    if (!best) {
      const posWrong = Array.from(perm).filter((v, p) => v !== p).length;
      const oriWrong = Array.from(orient).filter((v, p) => perm[p] === p && v !== 0).length;
      throw new Error(`orientedCycleSolver: no macro improves the orbit (greedy search stalled: ${posWrong} pieces misplaced, ${oriWrong} only misoriented)`);
    }
    // apply the macro to the working state
    const k = best.pos.length;
    const np = new Int8Array(k);
    const no = new Int8Array(k);
    for (let i = 0; i < k; i++) {
      np[i] = perm[best.src[i]];
      no[i] = (orient[best.src[i]] + best.add[i]) % mod;
    }
    for (let i = 0; i < k; i++) {
      perm[best.pos[i]] = np[i];
      orient[best.pos[i]] = no[i];
    }
    word.push(...best.word);
  }
  throw new Error("orientedCycleSolver: iteration guard reached");
}
