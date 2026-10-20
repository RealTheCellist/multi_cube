import type { Axis } from "./cubeMath";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, roundedComponent, type Cubie, type Face } from "./cubeState";
import { pieceType } from "./fourByFourCenters";
import commutatorData from "./data/fourByFourWingCommutators.json";
import { buildCycleTools, type CommutatorWords, type CycleTools } from "./threeCycleTools";

// ============================================================================
// 4x4x4 wing pairing by pure wing 3-cycles (the same idea as fiveByFiveWings.ts).
//
// The 24 wings form one orbit under the 24 usable quarter turns, acted on by the full symmetric
// group S24 with each wing's orientation locked to its slot (checked with sympy on the real sticker
// permutations). Offline exhaustive search (wings4-gen/) found 912 commutators [A, B] that move
// three wings and nothing else. A wing pair is "paired" when both wings of an edge line show the
// same colours on the same two faces; the solver greedily applies the 3-cycle (conjugated by a
// short setup, see threeCycleTools.ts) with the best gain per move until every line is paired.
// Centers are untouched by these 3-cycles. The sort reaches only even permutations; when it gets
// stuck, one inner-layer quarter turn (odd on the wings) is played first -- it disturbs the centers,
// which are solved afterwards anyway (solveCenters).
// ============================================================================

type Move = readonly [Axis, number, 1 | -1];

const AXES: readonly Axis[] = ["x", "y", "z"];
const LAYERS = [-1.5, -0.5, 0.5, 1.5] as const;
export const WING_MOVES4: readonly Move[] = (() => {
  const out: Move[] = [];
  for (const axis of AXES) for (const layer of LAYERS) for (const sign of [1, -1] as const) out.push([axis, layer, sign]);
  return out;
})();
// Inner-layer quarter turns: the odd ones on the wings.
const PARITY_FIXERS: readonly number[] = [2, 3, 4, 5, 10, 11, 12, 13, 18, 19, 20, 21];

const COMMUTATORS: CommutatorWords[] = commutatorData.W.map(([a, b]) => ({ a, b }));

const posKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

interface WingModel {
  n: number;
  slotOfPos: Map<string, number>;
  pieceOfId: Map<number, number>;
  /** pieceColor[piece][orbit] */
  pieceColor: Face[][];
  /** slotDest[m][s] = slot the wing at s goes to under move m */
  slotDest: Uint8Array[];
  /** lines[l] = the two slots of an edge line, with the orbit of each slot's sticker that faces the line's first/second direction */
  lines: { a: number; b: number; oa: number; ob: number }[];
  lineOfSlot: Int8Array;
}

let modelCache: WingModel | null = null;

function getModel(): WingModel {
  if (modelCache) return modelCache;
  const solved = buildSolvedCube(4);
  const wings = solved.filter((c) => pieceType(c) === "edge").sort((a, b) => a.id - b.id);
  const n = wings.length;
  const key = (c: Cubie) => posKey(roundedComponent(c.position, "x"), roundedComponent(c.position, "y"), roundedComponent(c.position, "z"));
  const slotOfPos = new Map(wings.map((c, i) => [key(c), i]));
  const pieceOfId = new Map(wings.map((c, i) => [c.id, i]));
  const dirKey = (x: number, y: number, z: number) => `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;

  const stickerIndex = new Map<string, number>();
  const stickerOf: { cubie: number; k: number }[] = [];
  for (const c of wings) {
    c.stickers.forEach((s, k) => {
      stickerIndex.set(`${key(c)}|${dirKey(s.direction.x, s.direction.y, s.direction.z)}`, stickerOf.length);
      stickerOf.push({ cubie: c.id, k });
    });
  }
  const parent = stickerOf.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const slotDest: Uint8Array[] = [];
  for (const [axis, layer, sign] of WING_MOVES4) {
    const copy = cloneCubies(solved);
    applyRawQuarterTurn(copy, axis, layer, sign);
    const byId = new Map(copy.map((c) => [c.id, c]));
    slotDest.push(Uint8Array.from(wings.map((w) => slotOfPos.get(key(byId.get(w.id)!))!)));
    stickerOf.forEach((st, i) => {
      const q = byId.get(st.cubie)!;
      const d = q.stickers[st.k].direction.clone().applyQuaternion(q.orientation);
      const j = stickerIndex.get(`${key(q)}|${dirKey(d.x, d.y, d.z)}`)!;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[a] = b;
    });
  }
  const roots = [...new Set(stickerOf.map((_, i) => find(i)))];
  if (roots.length !== 2) throw new Error(`fourByFourWingsCycle: expected 2 wing sticker orbits, found ${roots.length}`);
  const pieceColor: Face[][] = wings.map(() => [] as Face[]);
  const slotDir: [string, string][] = wings.map(() => ["", ""]);
  stickerOf.forEach((st, i) => {
    const orbit = roots.indexOf(find(i));
    const cubie = wings.find((w) => w.id === st.cubie)!;
    const p = pieceOfId.get(st.cubie)!;
    pieceColor[p][orbit] = cubie.stickers[st.k].color;
    const d = cubie.stickers[st.k].direction;
    slotDir[p][orbit] = dirKey(d.x, d.y, d.z); // solved: piece p sits in slot p
  });

  // the two wings of one edge line share both facing directions
  const lineOf = new Map<string, number[]>();
  wings.forEach((c, s) => {
    const k = AXES.filter((a) => Math.abs(roundedComponent(c.position, a)) === 1.5)
      .map((a) => `${a}${roundedComponent(c.position, a)}`)
      .join(",");
    lineOf.set(k, [...(lineOf.get(k) ?? []), s]);
  });
  const lines: WingModel["lines"] = [];
  const lineOfSlot = new Int8Array(n).fill(-1);
  for (const [a, b] of lineOf.values()) {
    const first = slotDir[a][0];
    const ob = slotDir[b][0] === first ? 0 : 1;
    if (slotDir[b][ob] !== first) throw new Error("fourByFourWingsCycle: line slots do not share directions");
    lineOfSlot[a] = lineOfSlot[b] = lines.length;
    lines.push({ a, b, oa: 0, ob });
  }
  modelCache = { n, slotOfPos, pieceOfId, pieceColor, slotDest, lines, lineOfSlot };
  return modelCache;
}

let toolsCache: CycleTools | null = null;
function getTools(): CycleTools {
  if (!toolsCache) toolsCache = buildCycleTools(getModel().slotDest, COMMUTATORS);
  return toolsCache;
}

/** Builds the 3-cycle lookup now (about a second), so the first solve doesn't pay for it. */
export function warmupWingCycleSolver4(): void {
  getTools();
}

function simplify(word: number[]): number[] {
  const out: number[] = [];
  for (const m of word) {
    if (out.length && (out[out.length - 1] ^ 1) === m) out.pop();
    else out.push(m);
  }
  return out;
}

function readArrangement(cubies: readonly Cubie[]): number[] | null {
  const model = getModel();
  const cur: number[] = new Array(model.n).fill(-1);
  for (const c of cubies) {
    if (pieceType(c) !== "edge") continue;
    const slot = model.slotOfPos.get(posKey(roundedComponent(c.position, "x"), roundedComponent(c.position, "y"), roundedComponent(c.position, "z")));
    const piece = model.pieceOfId.get(c.id);
    if (slot === undefined || piece === undefined) return null;
    cur[slot] = piece;
  }
  return cur.some((p) => p < 0) ? null : cur;
}

/** Plays one 3-cycle search from `start`; returns the move word, or null when no 3-cycle improves the pairing any more. */
function sortByCycles(start: readonly number[]): { word: number[]; cur: number[]; left: number } {
  const model = getModel();
  const tools = getTools();
  const cur = start.slice();
  const word: number[] = [];
  const paired = (l: number) => {
    const { a, b, oa, ob } = model.lines[l];
    return model.pieceColor[cur[a]][oa] === model.pieceColor[cur[b]][ob] && model.pieceColor[cur[a]][1 - oa] === model.pieceColor[cur[b]][1 - ob];
  };
  const unpaired = () => {
    let u = 0;
    for (let l = 0; l < model.lines.length; l++) if (!paired(l)) u++;
    return u;
  };
  for (let guard = 0; guard < 60; guard++) {
    const total = unpaired();
    if (total === 0) break;
    let best: { score: number; q: number; p: number; r: number; macro: number[] } | null = null;
    for (let q = 0; q < model.n; q++) {
      for (let p = 0; p < model.n; p++) {
        if (p === q) continue;
        for (let r = 0; r < model.n; r++) {
          if (r === q || r === p) continue;
          const lines = new Set([model.lineOfSlot[q], model.lineOfSlot[p], model.lineOfSlot[r]]);
          let before = 0;
          for (const l of lines) if (!paired(l)) before++;
          if (before === 0) continue;
          const [pq, pp, pr] = [cur[q], cur[p], cur[r]];
          cur[p] = pq;
          cur[r] = pp;
          cur[q] = pr;
          let after = 0;
          for (const l of lines) if (!paired(l)) after++;
          cur[q] = pq;
          cur[p] = pp;
          cur[r] = pr;
          const gain = before - after;
          if (gain <= 0) continue;
          const macro = tools.macroFor(q, p, r);
          if (!macro) continue;
          const score = gain / macro.length;
          if (!best || score > best.score) best = { score, q, p, r, macro };
        }
      }
    }
    if (!best) break;
    const { q, p, r, macro } = best;
    const [pq, pp, pr] = [cur[q], cur[p], cur[r]];
    cur[p] = pq;
    cur[r] = pp;
    cur[q] = pr;
    word.push(...macro);
  }
  return { word, cur, left: unpaired() };
}

/**
 * Moves (quarter turns) that pair all 24 wings, built from pure wing 3-cycles, or null when the sort gets stuck even after
 * a parity-fixing inner turn. The centers are generally NOT solved afterwards if a parity turn was used. Does not mutate `cubies`.
 */
export function solveWingsByCycles4(cubies: readonly Cubie[]): Move[] | null {
  const model = getModel();
  const start = readArrangement(cubies);
  if (!start) throw new Error("fourByFourWingsCycle: cannot read the wing arrangement");
  const direct = sortByCycles(start);
  if (direct.left === 0) return simplify(direct.word).map((m) => WING_MOVES4[m]);
  let best: number[] | null = null;
  for (const f of PARITY_FIXERS) {
    const moved: number[] = new Array(model.n);
    for (let s = 0; s < model.n; s++) moved[model.slotDest[f][s]] = start[s];
    const res = sortByCycles(moved);
    if (res.left !== 0) continue;
    const word = simplify([f, ...res.word]);
    if (!best || word.length < best.length) best = word;
  }
  return best ? best.map((m) => WING_MOVES4[m]) : null;
}
