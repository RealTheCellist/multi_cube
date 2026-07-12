import type { Axis } from "./cubeMath";
import { type Cubie, applyRawQuarterTurn, roundedComponent } from "./cubeState";
import { pieceType } from "./fourByFourCenters";

type Move = readonly [Axis, number, 1 | -1];

const AXES: Axis[] = ["x", "y", "z"];
const OUTER_LAYERS = [1.5, -1.5] as const;
const INNER_LAYERS = [0.5, -0.5] as const;

function slotKey(cubie: Cubie): string {
  return AXES.filter((a) => Math.abs(roundedComponent(cubie.position, a)) === 1.5)
    .map((a) => `${a}${roundedComponent(cubie.position, a)}`)
    .join(",");
}
function colorKey(cubie: Cubie): string {
  return cubie.stickers
    .map((s) => s.color)
    .slice()
    .sort()
    .join("");
}

/** Number of wing (edge) pieces not correctly paired with their same-slot sibling. */
export function unpairedWingCount(cubies: Cubie[]): number {
  const edges = cubies.filter((c) => pieceType(c) === "edge");
  const bySlot = new Map<string, Cubie[]>();
  for (const e of edges) {
    const key = slotKey(e);
    const list = bySlot.get(key) ?? [];
    list.push(e);
    bySlot.set(key, list);
  }
  let wrong = 0;
  for (const pair of bySlot.values()) {
    if (pair.length !== 2 || colorKey(pair[0]) !== colorKey(pair[1])) wrong += pair.length;
  }
  return wrong;
}

// --- Lightweight internal simulator ----------------------------------------
// The full Cubie model (THREE.Vector3 position + THREE.Quaternion
// orientation, cloned per candidate state) is far too slow for the
// thousands-to-millions of candidate states a real search needs to explore.
// Orientation never affects *which* moves are legal or where a piece ends up
// next (movement only depends on a piece's current axis/layer coordinate,
// never its type or facing), and a wing's color set is a fixed property of
// the piece -- so pairing-correctness search only needs each wing's (color,
// x, y, z), tracked as plain numbers. The winning move sequence this finds
// is replayed on the real Cubie[] afterward via applyRawQuarterTurn, which
// handles orientation/corners/centers correctly.
interface LiteEdge {
  color: string;
  x: number;
  y: number;
  z: number;
}

function toLiteEdges(cubies: Cubie[]): LiteEdge[] {
  return cubies
    .filter((c) => pieceType(c) === "edge")
    .map((c) => ({
      color: colorKey(c),
      x: roundedComponent(c.position, "x"),
      y: roundedComponent(c.position, "y"),
      z: roundedComponent(c.position, "z"),
    }));
}

function liteRotate90(e: LiteEdge, axis: Axis, sign: 1 | -1): LiteEdge {
  const { x, y, z } = e;
  switch (axis) {
    case "x":
      return sign === 1 ? { color: e.color, x, y: -z, z: y } : { color: e.color, x, y: z, z: -y };
    case "y":
      return sign === 1 ? { color: e.color, x: z, y, z: -x } : { color: e.color, x: -z, y, z: x };
    case "z":
      return sign === 1 ? { color: e.color, x: -y, y: x, z } : { color: e.color, x: y, y: -x, z };
  }
}
function liteLayerValue(e: LiteEdge, axis: Axis): number {
  return Math.round(e[axis] * 2) / 2;
}
function liteApplyMove(edges: LiteEdge[], move: Move): LiteEdge[] {
  const [axis, layer, sign] = move;
  return edges.map((e) => (liteLayerValue(e, axis) === layer ? liteRotate90(e, axis, sign) : e));
}
function liteApplySeq(edges: LiteEdge[], seq: readonly Move[]): LiteEdge[] {
  let cur = edges;
  for (const m of seq) cur = liteApplyMove(cur, m);
  return cur;
}
function liteSlotKey(e: LiteEdge): string {
  return AXES.filter((a) => Math.abs(liteLayerValue(e, a)) === 1.5)
    .map((a) => `${a}${liteLayerValue(e, a)}`)
    .join(",");
}
function liteUnpairedCount(edges: LiteEdge[]): number {
  const bySlot = new Map<string, LiteEdge[]>();
  for (const e of edges) {
    const key = liteSlotKey(e);
    const list = bySlot.get(key) ?? [];
    list.push(e);
    bySlot.set(key, list);
  }
  let wrong = 0;
  for (const pair of bySlot.values()) {
    if (pair.length !== 2 || pair[0].color !== pair[1].color) wrong += pair.length;
  }
  return wrong;
}
function liteStateKey(edges: LiteEdge[]): string {
  return edges
    .map((e) => `${e.x},${e.y},${e.z}:${e.color}`)
    .sort()
    .join("|");
}

// --- Move sets ---------------------------------------------------------
const SINGLE_MOVES: Move[][] = [];
for (const axis of AXES) {
  for (const layer of [...OUTER_LAYERS, ...INNER_LAYERS]) {
    for (const sign of [1, -1] as const) SINGLE_MOVES.push([[axis, layer, sign]]);
  }
}
const WIDE_MOVES: Move[][] = [];
for (const axis of AXES) {
  for (const outerLayer of OUTER_LAYERS) {
    const innerLayer = outerLayer > 0 ? 0.5 : -0.5;
    for (const sign of [1, -1] as const) {
      WIDE_MOVES.push([
        [axis, outerLayer, sign],
        [axis, innerLayer, sign],
      ]);
    }
  }
}
const BEAM_MOVES: Move[][] = [...SINGLE_MOVES, ...WIDE_MOVES];

// TAIL_MOVES additionally includes atomic 180-degree turns (both inner and
// outer/wide). A double turn is the *actual* atomic unit needed for several
// of the fixes the tail phase has to find -- e.g. a bare double turn of an
// inner slice is what cleanly swaps two wing pieces between two different
// edges (see session notes) -- but its own single-90 half-step usually looks
// strictly *worse* than where it started, so unless it's tried as one
// indivisible move, any score-improving search discards that first half
// before it ever gets to apply the second and see the net gain.
const TAIL_MOVES: Move[][] = [];
for (const axis of AXES) {
  for (const layer of [...OUTER_LAYERS, ...INNER_LAYERS]) {
    for (const sign of [1, -1] as const) TAIL_MOVES.push([[axis, layer, sign]]);
    TAIL_MOVES.push([
      [axis, layer, 1],
      [axis, layer, 1],
    ]);
  }
  for (const outerLayer of OUTER_LAYERS) {
    const innerLayer = outerLayer > 0 ? 0.5 : -0.5;
    for (const sign of [1, -1] as const) {
      TAIL_MOVES.push([
        [axis, outerLayer, sign],
        [axis, innerLayer, sign],
      ]);
    }
    TAIL_MOVES.push([
      [axis, outerLayer, 1],
      [axis, innerLayer, 1],
      [axis, outerLayer, 1],
      [axis, innerLayer, 1],
    ]);
  }
}

// --- Cooperative yielding ---------------------------------------------------
// Both search phases below can legitimately run for tens of seconds; without
// periodically handing control back to the event loop that would freeze the
// tab (and the browser would eventually flag the page as unresponsive).
const FRAME_BUDGET_MS = 14;
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// --- Bulk phase: beam search -------------------------------------------
// Pairs the large majority of wings quickly. Reliably reduces a fresh
// scramble to a small residual (empirically 0-8 of 24 wings still wrong)
// within a couple of seconds, but its greedy/best-first nature means it can
// permanently plateau above 0 -- fixing the last one or two dedges usually
// requires passing through a state that scores *worse* than where the beam
// got stuck, which a search that only ever keeps the best-scoring candidates
// can never reach (see tail phase below for why that residual needs a
// different technique entirely).
async function beamPhase(
  startEdges: LiteEdge[],
  beamWidth: number,
  maxLevels: number,
  deadline: number,
): Promise<{ edges: LiteEdge[]; path: Move[] }> {
  type Node = { edges: LiteEdge[]; path: Move[]; score: number };
  let beam: Node[] = [{ edges: startEdges, path: [], score: liteUnpairedCount(startEdges) }];
  const seen = new Set<string>([liteStateKey(startEdges)]);
  let lastYield = Date.now();
  for (let level = 0; level < maxLevels; level++) {
    if (Date.now() > deadline) break;
    if (beam.some((b) => b.score === 0)) break;
    const candidates: Node[] = [];
    for (const node of beam) {
      for (const move of BEAM_MOVES) {
        const nextEdges = liteApplySeq(node.edges, move);
        const key = liteStateKey(nextEdges);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ edges: nextEdges, path: [...node.path, ...move], score: liteUnpairedCount(nextEdges) });
      }
      if (Date.now() - lastYield > FRAME_BUDGET_MS) {
        await yieldToEventLoop();
        lastYield = Date.now();
        if (Date.now() > deadline) break;
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    beam = candidates.slice(0, beamWidth);
    if (beam.length === 0) break;
  }
  beam.sort((a, b) => a.score - b.score);
  const best = beam[0] ?? { edges: startEdges, path: [] as Move[], score: liteUnpairedCount(startEdges) };
  return { edges: best.edges, path: best.path };
}

// --- Tail phase: best-first bounded search ------------------------------
// Handles the residual the beam phase can't: an exhaustive (not greedy)
// search over TAIL_MOVES, expanded one full ply at a time. Within each ply,
// nodes are tried in ascending-score order first ("best-first per layer") so
// a solution existing at that depth is very likely found long before the
// full layer is exhausted, rather than depending on incidental move-array
// ordering -- in testing this cut typical solve time roughly in half without
// changing what's reachable. Unlike the beam phase, a node here is never
// discarded for scoring worse than another -- only depth and the time
// budget bound the search -- which is what makes it able to find fixes that
// must pass through a temporarily worse-scoring state (see beamPhase notes).
// Hard cap on how many nodes carry over into the next ply. A full,
// uncapped layer at depth 5 can reach several million states -- fine on a
// beefy Node process, but well past what a browser tab's heap can hold.
// Keeping only the best-scoring nodes (see the per-layer sort below) trades
// a small amount of completeness for a bounded memory footprint.
const TAIL_FRONTIER_CAP = 150000;

async function tailPhase(startEdges: LiteEdge[], maxDepth: number, deadline: number): Promise<Move[] | null> {
  if (liteUnpairedCount(startEdges) === 0) return [];
  type Node = { edges: LiteEdge[]; path: Move[]; score: number };
  let frontier: Node[] = [{ edges: startEdges, path: [], score: liteUnpairedCount(startEdges) }];
  const visited = new Set<string>([liteStateKey(startEdges)]);
  let lastYield = Date.now();
  for (let depth = 1; depth <= maxDepth; depth++) {
    frontier.sort((a, b) => a.score - b.score);
    if (frontier.length > TAIL_FRONTIER_CAP) frontier = frontier.slice(0, TAIL_FRONTIER_CAP);
    const next: Node[] = [];
    for (const node of frontier) {
      if (Date.now() > deadline) return null;
      for (const move of TAIL_MOVES) {
        const nextEdges = liteApplySeq(node.edges, move);
        const key = liteStateKey(nextEdges);
        if (visited.has(key)) continue;
        visited.add(key);
        const path = [...node.path, ...move];
        const score = liteUnpairedCount(nextEdges);
        if (score === 0) return path;
        next.push({ edges: nextEdges, path, score });
      }
      if (Date.now() - lastYield > FRAME_BUDGET_MS) {
        await yieldToEventLoop();
        lastYield = Date.now();
      }
    }
    frontier = next;
    if (frontier.length === 0) return null;
  }
  return null;
}

export interface SolveEdgePairingResult {
  solved: boolean;
  movesApplied: number;
}

/**
 * Pairs up all 24 wing pieces into their 12 same-colored pairs, in place.
 * Position of each pair doesn't matter (see unpairedWingCount) -- the
 * reduction-to-3x3x3 solve afterward handles final placement. Centers are
 * not protected here (some tail-phase moves disturb them, see TAIL_MOVES) --
 * solveCenters is safe to run again afterward since its own moves never
 * touch edges.
 */
export async function solveEdgePairing(cubies: Cubie[], tailTimeBudgetMs = 100000): Promise<SolveEdgePairingResult> {
  let liteEdges = toLiteEdges(cubies);
  let movesApplied = 0;

  const applyAndCount = (seq: Move[]) => {
    for (const move of seq) applyRawQuarterTurn(cubies, move[0], move[1], move[2]);
    movesApplied += seq.length;
  };

  // The beam phase naturally stops itself well before this via its own
  // convergence checks (score===0 or no new states); this cap just bounds
  // the pathological case. It's a separate, smaller budget from the tail
  // phase's below rather than a shared one -- the residual the beam phase
  // leaves behind is usually what the tail phase actually has to work to
  // resolve (see its own comment), so it needs the lion's share of time,
  // not whatever the beam phase happens to leave over.
  const beamDeadline = Date.now() + 20000;
  const beamResult = await beamPhase(liteEdges, 300, 25, beamDeadline);
  if (beamResult.path.length > 0) applyAndCount(beamResult.path);
  liteEdges = beamResult.edges;

  if (liteUnpairedCount(liteEdges) === 0) {
    return { solved: true, movesApplied };
  }

  // A single call up to depth 6: tailPhase already expands and checks one
  // full ply at a time and returns the instant it finds a solution, so a
  // depth-4 fix is found just as fast this way as it would be from a
  // depth-4-only call -- but a *separate* call per depth would re-walk
  // depths 1..N-1 from scratch every time (most residuals need depth 5-6,
  // see session notes), wasting most of the time budget on repeat work
  // instead of the deeper search that actually needs it.
  const tailDeadline = Date.now() + tailTimeBudgetMs;
  const fix = await tailPhase(liteEdges, 6, tailDeadline);
  if (fix && fix.length > 0) {
    applyAndCount(fix);
    liteEdges = liteApplySeq(liteEdges, fix);
  }

  return { solved: unpairedWingCount(cubies) === 0, movesApplied };
}
