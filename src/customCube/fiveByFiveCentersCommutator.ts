import { type Axis } from "./cubeMath";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, roundedComponent, type Cubie, type Face } from "./cubeState";
import { pieceType5 } from "./fiveByFivePieces";
import commutatorData from "./data/fiveByFiveCommutators.json";
import type { Move } from "./fiveByFiveCenters";
import { buildCycleTools, type CommutatorWords, type CycleTools } from "./threeCycleTools";

// ============================================================================
// 5x5x5 centers by 3-cycle commutators on an abstract permutation model.
//
// Replaces fiveByFiveHumanCenters.ts's greedy/IDA* search (which routinely used its
// full 15s budget -- and still often returned only a partial plan -- freezing the page
// after every scramble) with a constructive solve that takes milliseconds.
//
// Structure (group-checked on the real move permutations with a computer-algebra
// system, not assumed): with the layers -2,-1,1,2 of each axis as moves, the 24
// X-center slots and the 24 T-center slots are two independent orbits, each acted on
// by the full symmetric group S24, and together they form the direct product
// S24 x S24. Pieces of one colour are interchangeable, so each orbit is solved
// separately by repeatedly applying a pure 3-cycle -- a commutator [A, B] found by an
// offline exhaustive search (centers5-gen/): 8 quarter turns for X, 12 for T -- conjugated by a
// setup that carries the three chosen slots onto the commutator's own three slots.
// Setups come from a breadth-first search over ordered slot triples (24*23*22 = 12,144
// states per orbit).
// ============================================================================

const AXES: readonly Axis[] = ["x", "y", "z"];
const LAYERS = [-2, -1, 1, 2] as const;
const FACE_OF: Record<string, Face> = { "x2": "R", "x-2": "L", "y2": "U", "y-2": "D", "z2": "F", "z-2": "B" };

/** The 24 usable moves, in this fixed order (sign +1, then -1, adjacent; so move m's inverse is m ^ 1). */
const MOVES: readonly Move[] = (() => {
  const out: Move[] = [];
  for (const axis of AXES) for (const layer of LAYERS) for (const sign of [1, -1] as const) out.push([axis, layer, sign]);
  return out;
})();

/** Commutators [A, B] = A B A' B' (as indices into MOVES) that each move exactly three pieces of one orbit, found offline (centers5-gen/). */
const COMMUTATORS: Record<"X" | "T", CommutatorWords[]> = { X: commutatorData.X.map(([a, b]) => ({ a, b })), T: commutatorData.T.map(([a, b]) => ({ a, b })) };

interface Model {
  n: number;
  type: ("X" | "T")[];
  goal: Face[]; // goal colour of each slot
  slotOf: Map<string, number>;
  dest: Uint8Array[]; // dest[m][p] = slot the piece at p moves to under move m
}

let modelCache: Model | null = null;
const posKey = (x: number, y: number, z: number) => `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;

function getModel(): Model {
  if (modelCache) return modelCache;
  const solved = buildSolvedCube(5);
  const centers = solved
    .filter((c) => {
      const t = pieceType5(c);
      return t === "xCenter" || t === "tCenter";
    })
    .sort((a, b) => a.id - b.id);
  const slotOf = new Map<string, number>();
  centers.forEach((c, i) => slotOf.set(posKey(c.position.x, c.position.y, c.position.z), i));
  const dest = MOVES.map(([axis, layer, sign]) => {
    const copy = cloneCubies(solved);
    applyRawQuarterTurn(copy, axis, layer, sign);
    const byId = new Map(copy.map((c) => [c.id, c]));
    return Uint8Array.from(centers.map((c) => {
      const moved = byId.get(c.id)!;
      return slotOf.get(posKey(moved.position.x, moved.position.y, moved.position.z))!;
    }));
  });
  modelCache = {
    n: centers.length,
    type: centers.map((c) => (pieceType5(c) === "xCenter" ? "X" : "T")),
    goal: centers.map((c) => c.stickers[0].color),
    slotOf,
    dest,
  };
  return modelCache;
}

interface OrbitTools {
  slots: number[]; // slots of this orbit
  tools: CycleTools;
}

const toolsCache = new Map<"X" | "T", OrbitTools>();

function getTools(kind: "X" | "T"): OrbitTools {
  const cached = toolsCache.get(kind);
  if (cached) return cached;
  const model = getModel();
  const tools: OrbitTools = { slots: model.type.map((t, i) => (t === kind ? i : -1)).filter((i) => i >= 0), tools: buildCycleTools(model.dest, COMMUTATORS[kind]) };
  toolsCache.set(kind, tools);
  return tools;
}

/** Cancels adjacent inverse pairs (m followed by m^1) left where setups and the commutator meet. */
function simplify(word: number[]): number[] {
  const out: number[] = [];
  for (const m of word) {
    if (out.length && (out[out.length - 1] ^ 1) === m) out.pop();
    else out.push(m);
  }
  return out;
}

function solveOrbit(model: Model, kind: "X" | "T", colors: Face[]): number[] {
  const tools = getTools(kind);
  const slots = tools.slots;
  const wrongCount = () => slots.filter((s) => colors[s] !== model.goal[s]).length;
  const word: number[] = [];
  for (let guard = 0; guard < 200 && wrongCount() > 0; guard++) {
    let best: { after: number; cost: number; q: number; p: number; r: number; macro: number[] } | null = null;
    const wrong = slots.filter((s) => colors[s] !== model.goal[s]);
    for (const p of wrong) {
      for (const q of wrong) {
        if (q === p || colors[q] !== model.goal[p]) continue; // q holds the colour p needs
        for (const r of slots) {
          if (r === p || r === q) continue;
          // after the cycle q->p, p->r, r->q
          let after = wrong.length;
          const changed: [number, Face][] = [
            [p, colors[q]],
            [r, colors[p]],
            [q, colors[r]],
          ];
          for (const [s, c] of changed) {
            const was = colors[s] !== model.goal[s];
            const now = c !== model.goal[s];
            if (was && !now) after--;
            else if (!was && now) after++;
          }
          if (after >= wrong.length) continue; // must make real progress
          const macro = tools.tools.macroFor(q, p, r);
          if (!macro) continue;
          const cost = macro.length;
          if (!best || after < best.after || (after === best.after && cost < best.cost)) best = { after, cost, q, p, r, macro };
        }
      }
    }
    if (!best) throw new Error(`fiveByFiveCentersCommutator: no progressing 3-cycle found for the ${kind}-centers`);
    const { q, p, r, macro } = best;
    const [cq, cp, cr] = [colors[q], colors[p], colors[r]];
    colors[p] = cq;
    colors[r] = cp;
    colors[q] = cr;
    word.push(...macro);
  }
  if (wrongCount() > 0) throw new Error(`fiveByFiveCentersCommutator: ${kind}-centers not solved within the iteration guard`);
  return word;
}

/**
 * Plan (quarter turns, never touching the middle layers) that solves every X- and T-center
 * of a 5x5x5 whose true centers are already in place (see solveTrueCenterPositions5). Does not
 * mutate `cubies`. Throws if the state is not one this model can describe.
 */
export function solveCentersByCommutator5(cubies: readonly Cubie[]): Move[] {
  const model = getModel();
  const colors: Face[] = new Array(model.n);
  let seen = 0;
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t !== "xCenter" && t !== "tCenter") continue;
    const slot = model.slotOf.get(posKey(roundedComponent(c.position, "x"), roundedComponent(c.position, "y"), roundedComponent(c.position, "z")));
    if (slot === undefined) throw new Error("fiveByFiveCentersCommutator: unexpected center position");
    colors[slot] = c.stickers[0].color as Face;
    seen++;
  }
  if (seen !== model.n) throw new Error("fiveByFiveCentersCommutator: expected 48 X/T-centers");
  const word = [...solveOrbit(model, "X", colors), ...solveOrbit(model, "T", colors)];
  return simplify(word).map((m) => MOVES[m]);
}

/** Exposed for tests. */
export const __internals = { getModel, MOVES, FACE_OF };
