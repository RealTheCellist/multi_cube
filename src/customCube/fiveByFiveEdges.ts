import type { Axis } from "./cubeMath";
import { applyRawQuarterTurn, type Cubie, type Face, buildSolvedCube, cloneCubies, FACE_TURNS, outerLayerCoordinate } from "./cubeState";
import { pieceType5 } from "./fiveByFivePieces";

type Move = readonly [Axis, number, 1 | -1];

const AXES: Axis[] = ["x", "y", "z"];
const ALL_FACES: Face[] = ["U", "D", "L", "R", "F", "B"];
const BOUNDARY = 2; // (gridSize-1)/2 for gridSize=5

function applySeq(cubies: Cubie[], seq: readonly Move[]): void {
  for (const [axis, layer, sign] of seq) applyRawQuarterTurn(cubies, axis, layer, sign);
}
function round(c: Cubie, axis: Axis): number {
  return Math.round(c.position[axis] * 2) / 2;
}
function slotKey(c: Cubie): string {
  return AXES.filter((a) => Math.abs(round(c, a)) === BOUNDARY)
    .map((a) => `${a}${round(c, a)}`)
    .join(",");
}
function posKey(c: Cubie): string {
  return `${round(c, "x")},${round(c, "y")},${round(c, "z")}`;
}
function colorKey(c: Cubie): string {
  return c.stickers
    .map((s) => s.color)
    .slice()
    .sort()
    .join("");
}

function faceTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const layer = outerLayerCoordinate(face, 5);
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const out: Move[] = [];
  for (let i = 0; i < Math.abs(times); i++) out.push([def.axis, layer, sign]);
  return out;
}
function wideTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const outerLayer = outerLayerCoordinate(face, 5);
  const innerLayer = outerLayer > 0 ? 1 : -1;
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const out: Move[] = [];
  for (let i = 0; i < Math.abs(times); i++) {
    out.push([def.axis, outerLayer, sign]);
    out.push([def.axis, innerLayer, sign]);
  }
  return out;
}

// --- Wing-swap algorithm -----------------------------------------------
// Uw' R U R' F R' F' R Uw -- the exact same move shape as fourByFourEdges.ts's
// flip-trick, found to also work cleanly on a 5x5x5 (verified by direct
// simulation, see git history for the verification script, not assumed from
// the 4x4x4 case): of the pieces it touches, 4 edge-region slots move as
// fully intact rigid 3-piece groups (2 wings + their own true edge,
// together -- this can never break whatever pairing state that slot had,
// exactly like fourByFourEdges.ts's "8 pairing-safe collateral movers"),
// while exactly 2 slots undergo a genuine ISOLATED SWAP: one wing from each
// of those 2 slots trades places directly, and -- critically -- both
// slots' own true edges stay completely untouched. This is a cleaner
// situation than 4x4x4's own wing pairing: there, a wrong wing's needed
// partner could be anywhere and had no fixed target color; here, a wrong
// wing's target is well-defined (whatever color its OWN slot's true edge
// already shows), and swapping in a same-colored wing from elsewhere fixes
// it outright without disturbing that true edge.
const BASE_ALG: Move[] = [
  ...wideTurn("U", -1),
  ...faceTurn("R", 1),
  ...faceTurn("U", 1),
  ...faceTurn("R", -1),
  ...faceTurn("F", 1),
  ...faceTurn("R", -1),
  ...faceTurn("F", -1),
  ...faceTurn("R", 1),
  ...wideTurn("U", 1),
];

function wholeCubeRotation(axis: Axis, sign: 1 | -1): Move[] {
  return ([-2, -1, 0, 1, 2] as const).map((layer) => [axis, layer, sign] as Move);
}
function invertSeq(seq: readonly Move[]): Move[] {
  return [...seq].reverse().map(([axis, layer, sign]) => [axis, layer, -sign as 1 | -1] as Move);
}

function axisSign(axis: Axis, sign: 1 | -1, v: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = v;
  if (axis === "x") return sign === 1 ? [x, -z, y] : [x, z, -y];
  if (axis === "y") return sign === 1 ? [z, y, -x] : [-z, y, x];
  return sign === 1 ? [-y, x, z] : [y, -x, z];
}

const ROTATIONS: Move[][] = (() => {
  const bases: Move[][] = [
    [],
    wholeCubeRotation("z", 1),
    wholeCubeRotation("x", 1),
    wholeCubeRotation("z", -1),
    wholeCubeRotation("x", -1),
    [...wholeCubeRotation("x", 1), ...wholeCubeRotation("x", 1)],
  ];
  const ySteps: Move[][] = [
    [],
    wholeCubeRotation("y", 1),
    [...wholeCubeRotation("y", 1), ...wholeCubeRotation("y", 1)],
    wholeCubeRotation("y", -1),
  ];
  const out: Move[][] = [];
  for (const b of bases) for (const y of ySteps) out.push([...b, ...y]);
  return out;
})();

interface LibraryEntry {
  seq: Move[];
  legs: { from: string; to: string }[];
}

interface WingLibrary {
  posLookup: Map<string, { entry: LibraryEntry; legIndex: number }[]>;
}

// Extracts wing pieces that moved SOLO out of their origin slot (their
// sibling wing stayed behind) -- always exactly 2 for BASE_ALG's rotations
// (the isolated swap), see module comment above.
function computeSoloWingLegs(before: readonly Cubie[], after: readonly Cubie[]): { from: string; to: string }[] {
  const moved: { from: string; to: string; fromSlot: string }[] = [];
  for (let i = 0; i < before.length; i++) {
    if (pieceType5(before[i]) !== "wingEdge") continue;
    if (before[i].position.distanceToSquared(after[i].position) > 1e-9) {
      moved.push({ from: posKey(before[i]), to: posKey(after[i]), fromSlot: slotKey(before[i]) });
    }
  }
  const bySlot = new Map<string, typeof moved>();
  for (const m of moved) {
    const list = bySlot.get(m.fromSlot) ?? [];
    list.push(m);
    bySlot.set(m.fromSlot, list);
  }
  const legs: { from: string; to: string }[] = [];
  for (const group of bySlot.values()) {
    if (group.length === 1) legs.push({ from: group[0].from, to: group[0].to });
  }
  return legs;
}

let cachedLibrary: WingLibrary | null = null;
function buildWingLibrary(): WingLibrary {
  if (cachedLibrary) return cachedLibrary;
  const solvedRef = buildSolvedCube(5);
  const posLookup = new Map<string, { entry: LibraryEntry; legIndex: number }[]>();
  const seen = new Set<string>();
  for (const rot of ROTATIONS) {
    const variant = [...rot, ...BASE_ALG, ...invertSeq(rot)];
    const before = cloneCubies(solvedRef);
    const after = cloneCubies(before);
    applySeq(after, variant);
    const legs = computeSoloWingLegs(before, after);
    if (legs.length !== 2) continue;
    const key = legs
      .map((l) => `${l.from}>${l.to}`)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const entry: LibraryEntry = { seq: variant, legs };
    legs.forEach((leg, legIndex) => {
      const list = posLookup.get(leg.from) ?? [];
      list.push({ entry, legIndex });
      posLookup.set(leg.from, list);
    });
  }
  cachedLibrary = { posLookup };
  return cachedLibrary;
}

/** Number of wing pieces that don't match their own edge-slot's true edge. */
export function wrongWingCount5(cubies: Cubie[]): number {
  return wrongWings5(cubies).length;
}

function wrongWings5(cubies: Cubie[]): Cubie[] {
  const bySlot = new Map<string, { wings: Cubie[]; trueEdge: Cubie | null }>();
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t !== "wingEdge" && t !== "trueEdge") continue;
    const key = slotKey(c);
    const entry = bySlot.get(key) ?? { wings: [], trueEdge: null };
    if (t === "wingEdge") entry.wings.push(c);
    else entry.trueEdge = c;
    bySlot.set(key, entry);
  }
  const wrong: Cubie[] = [];
  for (const { wings, trueEdge } of bySlot.values()) {
    if (!trueEdge) continue;
    const target = colorKey(trueEdge);
    for (const w of wings) if (colorKey(w) !== target) wrong.push(w);
  }
  return wrong;
}

function allOuterMoves(): Move[][] {
  const moves: Move[][] = [];
  for (const f of ALL_FACES) for (const t of [1, -1]) moves.push(faceTurn(f, t));
  return moves;
}

// Lightweight edge-region-only state for the setup search below (same
// rationale as fourByFourEdges.ts's LiteEdge: full Cubie clones with
// THREE.js position/orientation objects are far more expensive than plain
// numbers, and this BFS explores many candidate states per call).
interface LiteEdge5 {
  id: number;
  type: "wingEdge" | "trueEdge";
  color: string;
  x: number;
  y: number;
  z: number;
}
function toLiteEdges(cubies: readonly Cubie[]): LiteEdge5[] {
  return cubies
    .filter((c) => pieceType5(c) === "wingEdge" || pieceType5(c) === "trueEdge")
    .map((c) => ({
      id: c.id,
      type: pieceType5(c) as "wingEdge" | "trueEdge",
      color: colorKey(c),
      x: round(c, "x"),
      y: round(c, "y"),
      z: round(c, "z"),
    }));
}
function liteSlotKey(e: LiteEdge5): string {
  return AXES.filter((a) => Math.abs(e[a]) === BOUNDARY)
    .map((a) => `${a}${e[a]}`)
    .join(",");
}
function litePosKey(e: LiteEdge5): string {
  return `${e.x},${e.y},${e.z}`;
}
function liteApplyMove(edges: readonly LiteEdge5[], move: Move): LiteEdge5[] {
  const [axis, layer, sign] = move;
  return edges.map((e) => {
    if (e[axis] !== layer) return e;
    const [x, y, z] = axisSign(axis, sign, [e.x, e.y, e.z]);
    return { id: e.id, type: e.type, color: e.color, x, y, z };
  });
}
function liteApplySeq(edges: readonly LiteEdge5[], seq: readonly Move[]): LiteEdge5[] {
  let cur: LiteEdge5[] = [...edges];
  for (const m of seq) cur = liteApplyMove(cur, m);
  return cur;
}

function liteWrongWingCount(edges: readonly LiteEdge5[]): number {
  const bySlot = new Map<string, { wings: LiteEdge5[]; trueEdge: LiteEdge5 | null }>();
  for (const e of edges) {
    const key = liteSlotKey(e);
    const entry = bySlot.get(key) ?? { wings: [], trueEdge: null };
    if (e.type === "wingEdge") entry.wings.push(e);
    else entry.trueEdge = e;
    bySlot.set(key, entry);
  }
  let wrong = 0;
  for (const { wings, trueEdge } of bySlot.values()) {
    if (!trueEdge) continue;
    for (const w of wings) if (w.color !== trueEdge.color) wrong++;
  }
  return wrong;
}

// Same joint-search shape as fourByFourEdges.ts's prepareAndApply, but the
// "partner" to bring into position isn't a single fixed id -- it's ANY
// wing whose color matches the wrong wing W's own slot's true edge (since
// that's the color W needs to become, and exactly one *other* wing besides
// W could already show it, or none, in which case this candidate can't
// help and correctly reports no path within maxDepth). targetPos is the
// position the OTHER swap participant needs to reach; W's own position
// must return to its start (same convention as 4x4).
//
// Unlike 4x4x4's version, this doesn't exclude the algorithm's own faces
// from the setup search: this algorithm's 2 swap slots always span an
// entire opposite-face pair (verified across several structural variants,
// see git history for the exploration script -- seemingly unavoidable for
// this move shape on a 5x5x5), which would freeze 10 of the 12 edge slots
// if those 3 faces were excluded, making most setups unreachable. Instead
// this uses every face and leans on the caller (tryFixWing/bestFixOverall)
// to reject any setup+algorithm combination that doesn't net-improve
// overall wrongness -- the same safety net centers-style solvers already
// use, just applied to the setup phase here too.
function prepareAndApply(cubies: Cubie[], w: Cubie, targetColor: string, targetPos: string, maxDepth: number): Move[] | null {
  const safe = allOuterMoves();
  const wStartPos = posKey(w);
  const startEdges = toLiteEdges(cubies);
  const baselineWrong = liteWrongWingCount(startEdges);

  function state(edges: readonly LiteEdge5[]) {
    const wNow = edges.find((e) => e.id === w.id)!;
    const targetOccupant = edges.find((e) => litePosKey(e) === targetPos);
    return {
      targetMatches: targetOccupant !== undefined && targetOccupant.type === "wingEdge" && targetOccupant.color === targetColor,
      wPos: litePosKey(wNow),
      wrongCount: liteWrongWingCount(edges),
    };
  }
  const start = state(startEdges);
  if (start.targetMatches && start.wPos === wStartPos) return [];

  let frontier: { edges: LiteEdge5[]; path: Move[] }[] = [{ edges: startEdges, path: [] }];
  const seen = new Set<string>([JSON.stringify(start)]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: { edges: LiteEdge5[]; path: Move[] }[] = [];
    for (const node of frontier) {
      for (const move of safe) {
        const nextEdges = liteApplySeq(node.edges, move);
        const st = state(nextEdges);
        const key = JSON.stringify(st);
        if (seen.has(key)) continue;
        seen.add(key);
        const path = [...node.path, ...move];
        if (st.targetMatches && st.wPos === wStartPos && st.wrongCount <= baselineWrong) return path;
        next.push({ edges: nextEdges, path });
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return null;
}

function* iterFixesForWing(
  cubies: Cubie[],
  w: Cubie,
  lib: WingLibrary,
  maxSetupDepth: number,
  order: readonly { entry: LibraryEntry; legIndex: number }[],
): Generator<Move[]> {
  const wSlot = slotKey(w);
  const trueEdgeAtSlot = cubies.find((c) => pieceType5(c) === "trueEdge" && slotKey(c) === wSlot);
  if (!trueEdgeAtSlot) return;
  const targetColor = colorKey(trueEdgeAtSlot);

  for (const { entry, legIndex } of order) {
    const otherLeg = entry.legs[1 - legIndex];
    const setup = prepareAndApply(cubies, w, targetColor, otherLeg.from, maxSetupDepth);
    if (setup === null) continue;
    yield [...setup, ...entry.seq];
  }
}

function candidatesForWing(lib: WingLibrary, w: Cubie): readonly { entry: LibraryEntry; legIndex: number }[] {
  return lib.posLookup.get(posKey(w)) ?? [];
}

function tryFixWing(cubies: Cubie[], w: Cubie, lib: WingLibrary, maxSetupDepth: number): Move[] | null {
  const before = wrongWingCount5(cubies);
  for (const fix of iterFixesForWing(cubies, w, lib, maxSetupDepth, candidatesForWing(lib, w))) {
    const clone = cloneCubies(cubies);
    applySeq(clone, fix);
    if (wrongWingCount5(clone) < before) return fix;
  }
  return null;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PLIES = 4;
const BRANCH_CAP = 6;
function bestFixOverall(cubies: Cubie[], lib: WingLibrary, plies: number, deadline: number): Move[] | null {
  if (Date.now() > deadline) return null;
  const baseline = wrongWingCount5(cubies);
  if (baseline === 0) return [];
  for (const w of shuffle(wrongWings5(cubies))) {
    const fix = tryFixWing(cubies, w, lib, 6);
    if (fix) return fix;
  }
  if (plies <= 1) return null;
  for (const w of shuffle(wrongWings5(cubies))) {
    if (Date.now() > deadline) return null;
    let branchCount = 0;
    for (const fix of iterFixesForWing(cubies, w, lib, 6, shuffle(candidatesForWing(lib, w)))) {
      if (branchCount >= BRANCH_CAP) break;
      branchCount++;
      const clone = cloneCubies(cubies);
      applySeq(clone, fix);
      const rest = bestFixOverall(clone, lib, plies - 1, deadline);
      if (rest === null) continue;
      const combined = [...fix, ...rest];
      const finalClone = cloneCubies(cubies);
      applySeq(finalClone, combined);
      if (wrongWingCount5(finalClone) < baseline) return combined;
    }
  }
  return null;
}

function solveWingsOneAttempt(cubies: Cubie[], lib: WingLibrary, deadline: number): { solved: boolean; moves: Move[] } {
  let guard = 0;
  const moves: Move[] = [];
  while (wrongWingCount5(cubies) > 0 && guard < 40 && Date.now() < deadline) {
    guard++;
    const fix = bestFixOverall(cubies, lib, PLIES, deadline);
    if (!fix || fix.length === 0) break;
    applySeq(cubies, fix);
    moves.push(...fix);
  }
  return { solved: wrongWingCount5(cubies) === 0, moves };
}

const FRAME_BUDGET_MS = 14;
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface SolveWingPairing5Result {
  solved: boolean;
  movesApplied: number;
  moves: Move[];
}

/**
 * Pairs all 24 wing pieces to match their own edge-slot's true edge (unlike
 * 4x4x4, where wings just need to match each other -- a 5x5x5's true edge
 * is a fixed reference, like a 3x3x3 edge, so wings have a specific,
 * pre-existing target color rather than a free choice). Restarts with
 * shuffled ordering on plateau, mirroring fourByFourEdges.ts's own
 * restart-based scheduler.
 */
export async function solveWingPairing5(cubies: Cubie[], timeBudgetMs = 100000, maxRestarts = 40, perAttemptMs = 3000): Promise<SolveWingPairing5Result> {
  const lib = buildWingLibrary();
  const overallDeadline = Date.now() + timeBudgetMs;
  let lastYield = Date.now();

  for (let attempt = 0; attempt < maxRestarts && Date.now() < overallDeadline; attempt++) {
    const attemptCubies = cloneCubies(cubies);
    const attemptDeadline = Math.min(Date.now() + perAttemptMs, overallDeadline);
    const result = solveWingsOneAttempt(attemptCubies, lib, attemptDeadline);
    if (result.solved) {
      for (let i = 0; i < cubies.length; i++) {
        cubies[i].position.copy(attemptCubies[i].position);
        cubies[i].orientation.copy(attemptCubies[i].orientation);
      }
      return { solved: true, movesApplied: result.moves.length, moves: result.moves };
    }
    if (Date.now() - lastYield > FRAME_BUDGET_MS) {
      await yieldToEventLoop();
      lastYield = Date.now();
    }
  }

  return { solved: false, movesApplied: 0, moves: [] };
}
