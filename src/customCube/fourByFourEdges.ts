import type { Axis } from "./cubeMath";
import { type Cubie, applyRawQuarterTurn, cloneCubies, roundedComponent } from "./cubeState";
import { pieceType } from "./fourByFourCenters";

type Move = readonly [Axis, number, 1 | -1];

const AXES: Axis[] = ["x", "y", "z"];
const OUTER_LAYERS = [1.5, -1.5] as const;
const INNER_LAYERS = [0.5, -0.5] as const;

const SINGLE_MOVES: Move[][] = [];
for (const axis of AXES) {
  for (const layer of [...OUTER_LAYERS, ...INNER_LAYERS]) {
    SINGLE_MOVES.push([[axis, layer, 1]]);
    SINGLE_MOVES.push([[axis, layer, -1]]);
  }
}
// A "wide" turn (outer + its adjacent inner slice moved together) is a
// single compound move in this move set, since that's what actually reaches
// short pairing solutions in practice -- pure single-layer turns need
// noticeably deeper search to find the same result (see session notes).
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
const MOVE_SET: Move[][] = [...SINGLE_MOVES, ...WIDE_MOVES];

function applySeq(cubies: Cubie[], seq: readonly Move[]): void {
  for (const [axis, layer, sign] of seq) applyRawQuarterTurn(cubies, axis, layer, sign);
}

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

function stateKey(cubies: Cubie[]): string {
  return cubies
    .filter((c) => pieceType(c) === "edge")
    .map((c) => `${roundedComponent(c.position, "x")},${roundedComponent(c.position, "y")},${roundedComponent(c.position, "z")}`)
    .join("|");
}

// Beam search over the mixed single+wide move set: no hand-derived
// commutators here (unlike centers) -- wing pairing didn't yield a clean,
// small, corner/center-safe primitive under the same derivation approach
// (see session notes), so this leans on breadth instead. It's slower and
// occasionally doesn't fully converge within the time budget, in which
// case solveEdgePairing reports that honestly via its `solved` flag rather
// than silently returning a still-scrambled cube.
function beamStep(cubies: Cubie[], beamWidth: number, maxLevels: number, deadline: number): Cubie[] {
  let beam: { state: Cubie[]; score: number }[] = [{ state: cloneCubies(cubies), score: unpairedWingCount(cubies) }];
  const seen = new Set<string>([stateKey(cubies)]);
  for (let level = 0; level < maxLevels; level++) {
    if (Date.now() > deadline) break;
    if (beam.some((b) => b.score === 0)) break;
    const candidates: { state: Cubie[]; score: number }[] = [];
    for (const node of beam) {
      for (const move of MOVE_SET) {
        const clone = cloneCubies(node.state);
        applySeq(clone, move);
        const key = stateKey(clone);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ state: clone, score: unpairedWingCount(clone) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    beam = candidates.slice(0, beamWidth);
    if (beam.length === 0) break;
  }
  beam.sort((a, b) => a.score - b.score);
  return beam[0]?.state ?? cubies;
}

// Iteratively-deepened exhaustive search, used once the beam plateaus, to
// push through whatever residual it couldn't reach.
function exhaustiveStep(cubies: Cubie[], maxDepth: number, deadline: number): Move[] | null {
  let bestSeq: Move[] | null = null;
  let bestScore = unpairedWingCount(cubies);
  function dfs(prefix: Move[], depth: number, state: Cubie[]): boolean {
    if (Date.now() > deadline) return true;
    if (depth === 0) return false;
    for (const move of MOVE_SET) {
      const clone = cloneCubies(state);
      applySeq(clone, move);
      const score = unpairedWingCount(clone);
      const seq = [...prefix, ...move];
      if (score < bestScore) {
        bestScore = score;
        bestSeq = seq;
        if (score === 0) return true;
      }
      if (depth > 1 && dfs(seq, depth - 1, clone)) return true;
    }
    return false;
  }
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (dfs([], depth, cubies)) break;
    if (bestSeq) break;
    if (Date.now() > deadline) break;
  }
  return bestSeq;
}

export interface SolveEdgePairingResult {
  solved: boolean;
}

/**
 * Pairs up all 24 wing pieces into their 12 same-colored pairs, in place.
 * Position of each pair doesn't matter (see unpairedWingCount) -- the
 * reduction-to-3x3x3 solve afterward handles final placement.
 */
export function solveEdgePairing(cubies: Cubie[], timeBudgetMs = 30000): SolveEdgePairingResult {
  const deadline = Date.now() + timeBudgetMs;
  let guard = 0;
  while (unpairedWingCount(cubies) > 0 && guard < 20 && Date.now() < deadline) {
    guard++;
    const beamBudget = Math.min(deadline, Date.now() + 5000);
    const afterBeam = beamStep(cubies, 60, 15, beamBudget);
    for (let i = 0; i < cubies.length; i++) {
      cubies[i].position.copy(afterBeam[i].position);
      cubies[i].orientation.copy(afterBeam[i].orientation);
    }
    if (unpairedWingCount(cubies) === 0) break;
    const seq = exhaustiveStep(cubies, 3, Math.min(deadline, Date.now() + 10000));
    if (!seq) break;
    applySeq(cubies, seq);
  }
  return { solved: unpairedWingCount(cubies) === 0 };
}
