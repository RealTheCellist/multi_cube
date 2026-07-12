import type { Axis } from "./cubeMath";
import {
  buildSolvedCube,
  type Cubie,
  type Face,
  applyRawQuarterTurn,
  cloneCubies,
  FACE_TURNS,
  outerLayerCoordinate,
  roundedComponent,
} from "./cubeState";
import { pieceType } from "./fourByFourCenters";

type Move = readonly [Axis, number, 1 | -1];

const AXES: Axis[] = ["x", "y", "z"];
const ALL_FACES: Face[] = ["U", "D", "L", "R", "F", "B"];

function applySeq(cubies: Cubie[], seq: readonly Move[]): void {
  for (const [axis, layer, sign] of seq) applyRawQuarterTurn(cubies, axis, layer, sign);
}
function slotKey(c: Cubie): string {
  return AXES.filter((a) => Math.abs(roundedComponent(c.position, a)) === 1.5)
    .map((a) => `${a}${roundedComponent(c.position, a)}`)
    .join(",");
}
function posKey(c: Cubie): string {
  return `${roundedComponent(c.position, "x")},${roundedComponent(c.position, "y")},${roundedComponent(c.position, "z")}`;
}
function colorKey(c: Cubie): string {
  return c.stickers
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
function goodSlots(cubies: Cubie[]): Set<string> {
  const edges = cubies.filter((c) => pieceType(c) === "edge");
  const bySlot = new Map<string, Cubie[]>();
  for (const e of edges) {
    const key = slotKey(e);
    const list = bySlot.get(key) ?? [];
    list.push(e);
    bySlot.set(key, list);
  }
  const good = new Set<string>();
  for (const [key, pair] of bySlot) if (pair.length === 2 && colorKey(pair[0]) === colorKey(pair[1])) good.add(key);
  return good;
}

function faceTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const layer = outerLayerCoordinate(face, 4);
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const n = Math.abs(times);
  const out: Move[] = [];
  for (let i = 0; i < n; i++) out.push([def.axis, layer, sign]);
  return out;
}
function wideTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const outerLayer = outerLayerCoordinate(face, 4);
  const innerLayer = outerLayer > 0 ? 0.5 : -0.5;
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const n = Math.abs(times);
  const out: Move[] = [];
  for (let i = 0; i < n; i++) {
    out.push([def.axis, outerLayer, sign]);
    out.push([def.axis, innerLayer, sign]);
  }
  return out;
}
function bareInnerTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const outerLayer = outerLayerCoordinate(face, 4);
  const innerLayer = outerLayer > 0 ? 0.5 : -0.5;
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const n = Math.abs(times);
  const out: Move[] = [];
  for (let i = 0; i < n; i++) out.push([def.axis, innerLayer, sign]);
  return out;
}

// --- 3-cycle algorithm library -------------------------------------------
// R U R' Uw F U' F' Uw' cycles exactly 3 wings (one from each of 3 different
// dedge slots) while scrambling corners freely -- fine, since corners get
// solved later during the reduction phase. Found via brute-force DFS over
// {R,R',U,U',Uw,Uw',F,F'} up to depth 8 (see git history for the search
// script), specifically looking for a small, clean 3-cycle. Conjugating this
// base algorithm by all 24 whole-cube rotations gives a library entry usable
// on any 3 slots, since the underlying dedge geometry is rotation-symmetric.
const BASE_ALG: Move[] = [
  ...faceTurn("R", 1),
  ...faceTurn("U", 1),
  ...faceTurn("R", -1),
  ...wideTurn("U", 1),
  ...faceTurn("F", 1),
  ...faceTurn("U", -1),
  ...faceTurn("F", -1),
  ...wideTurn("U", -1),
];
const BASE_FACES: ReadonlySet<Face> = new Set(["R", "U", "F"]);

function wholeCubeRotation(axis: Axis, sign: 1 | -1): Move[] {
  return ([-1.5, -0.5, 0.5, 1.5] as const).map((layer) => [axis, layer, sign] as Move);
}
function invertSeq(seq: readonly Move[]): Move[] {
  return [...seq].reverse().map(([axis, layer, sign]) => [axis, layer, -sign as 1 | -1] as Move);
}

const FACE_NORMALS: Record<Face, readonly [number, number, number]> = {
  R: [1, 0, 0],
  L: [-1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};
// Rotates a face-normal vector by one quarter turn, matching cubeMath.ts's
// rotateGridVector90 axis/sign convention.
function axisSign(axis: Axis, sign: 1 | -1, v: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = v;
  if (axis === "x") return sign === 1 ? [x, -z, y] : [x, z, -y];
  if (axis === "y") return sign === 1 ? [z, y, -x] : [-z, y, x];
  return sign === 1 ? [-y, x, z] : [y, -x, z];
}
function rotateFaceLabel(rotSeq: readonly Move[], face: Face): Face {
  let v = FACE_NORMALS[face];
  for (const [axis, , sign] of rotSeq) v = axisSign(axis, sign, v);
  for (const f of ALL_FACES) {
    const n = FACE_NORMALS[f];
    if (n[0] === v[0] && n[1] === v[1] && n[2] === v[2]) return f;
  }
  throw new Error("rotateFaceLabel: no matching face");
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
  faces: ReadonlySet<Face>;
  legs: { from: string; to: string }[];
}

interface EdgeLibrary {
  library: LibraryEntry[];
  posLookup: Map<string, { entry: LibraryEntry; legIndex: number }[]>;
  partnerById: Map<number, number>;
}

let cachedLibrary: EdgeLibrary | null = null;

// Building the library requires simulating all 24 rotation variants against
// a solved cube -- cheap (24 short applies) but only needs doing once, so
// it's memoized rather than rebuilt per solve call.
function buildEdgeLibrary(): EdgeLibrary {
  if (cachedLibrary) return cachedLibrary;

  const solvedRef = buildSolvedCube(4);
  const library: LibraryEntry[] = [];
  const seen = new Set<string>();
  for (const rot of ROTATIONS) {
    const variant = [...rot, ...BASE_ALG, ...invertSeq(rot)];
    const before = cloneCubies(solvedRef);
    const after = cloneCubies(before);
    applySeq(after, variant);
    const legs: { from: string; to: string }[] = [];
    for (let i = 0; i < before.length; i++) {
      if (pieceType(before[i]) !== "edge") continue;
      if (before[i].position.distanceToSquared(after[i].position) > 1e-9) {
        legs.push({ from: posKey(before[i]), to: posKey(after[i]) });
      }
    }
    if (legs.length !== 3) continue;
    const key = legs
      .map((l) => `${l.from}>${l.to}`)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const faces = new Set([...BASE_FACES].map((f) => rotateFaceLabel(rot, f)));
    library.push({ seq: variant, faces, legs });
  }

  const posLookup = new Map<string, { entry: LibraryEntry; legIndex: number }[]>();
  for (const entry of library) {
    entry.legs.forEach((leg, legIndex) => {
      const list = posLookup.get(leg.from) ?? [];
      list.push({ entry, legIndex });
      posLookup.set(leg.from, list);
    });
  }

  const partnerById = new Map<number, number>();
  const byColor = new Map<string, number[]>();
  for (const c of solvedRef) {
    if (pieceType(c) !== "edge") continue;
    const key = colorKey(c);
    const list = byColor.get(key) ?? [];
    list.push(c.id);
    byColor.set(key, list);
  }
  for (const ids of byColor.values()) {
    partnerById.set(ids[0], ids[1]);
    partnerById.set(ids[1], ids[0]);
  }

  cachedLibrary = { library, posLookup, partnerById };
  return cachedLibrary;
}

function wrongWings(cubies: Cubie[], partnerById: Map<number, number>): Cubie[] {
  const edges = cubies.filter((c) => pieceType(c) === "edge");
  const bySlot = new Map<string, Cubie[]>();
  for (const e of edges) {
    const key = slotKey(e);
    const list = bySlot.get(key) ?? [];
    list.push(e);
    bySlot.set(key, list);
  }
  const wrong: Cubie[] = [];
  for (const pair of bySlot.values()) {
    if (pair.length !== 2 || pair[0].id !== partnerById.get(pair[1].id)) wrong.push(...pair);
  }
  return wrong;
}

function safeMoves(usedFaces: ReadonlySet<Face>): Move[][] {
  const faces = ALL_FACES.filter((f) => !usedFaces.has(f));
  const moves: Move[][] = [];
  for (const f of faces) for (const t of [1, -1]) moves.push(faceTurn(f, t));
  return moves;
}
function riskSlotsFor(entry: LibraryEntry): Set<string> {
  return new Set(
    entry.legs.map((leg) => {
      const [x, y, z] = leg.from.split(",").map(Number);
      const v: Record<Axis, number> = { x, y, z };
      return AXES.filter((a) => Math.abs(v[a]) === 1.5)
        .map((a) => `${a}${v[a]}`)
        .join(",");
    }),
  );
}

// Joint search over (P's position, W's position, risk-zone conflict count)
// using only moves that exclude the algorithm's own faces (safe for
// already-paired dedges). W's own faces are deliberately NOT excluded from
// the move set -- that left too few safe faces (often just 1) to reach most
// targets. Instead W's position is tracked as part of the search state and
// required to have returned to its start position by the time a candidate
// path is accepted, so moves that only *temporarily* pass through W's layer
// (and later return it) are still explored.
function prepareAndApply(
  cubies: Cubie[],
  w: Cubie,
  entry: LibraryEntry,
  targetForP: string,
  partnerById: Map<number, number>,
  maxDepth: number,
): Move[] | null {
  const safe = safeMoves(entry.faces);
  const risk = riskSlotsFor(entry);
  const partnerId = partnerById.get(w.id);
  const wStartPos = posKey(w);

  function state(cubies2: Cubie[]) {
    const p = cubies2.find((c) => c.id === partnerId)!;
    const wNow = cubies2.find((c) => c.id === w.id)!;
    return {
      pPos: posKey(p),
      wPos: posKey(wNow),
      conflicts: [...goodSlots(cubies2)].filter((s) => risk.has(s)).length,
    };
  }
  const start = state(cubies);
  if (start.pPos === targetForP && start.wPos === wStartPos && start.conflicts === 0) return [];

  let frontier: { cubies: Cubie[]; path: Move[] }[] = [{ cubies, path: [] }];
  const seen = new Set<string>([JSON.stringify(start)]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: { cubies: Cubie[]; path: Move[] }[] = [];
    for (const node of frontier) {
      for (const move of safe) {
        const clone = cloneCubies(node.cubies);
        applySeq(clone, move);
        const st = state(clone);
        const key = JSON.stringify(st);
        if (seen.has(key)) continue;
        seen.add(key);
        const path = [...node.path, ...move];
        if (st.pPos === targetForP && st.wPos === wStartPos && st.conflicts === 0) return path;
        next.push({ cubies: clone, path });
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return null;
}

// Returns every valid (setup+algorithm) fix for wrong wing W, regardless of
// whether it immediately improves the pairing count -- used for multi-ply
// lookahead (some real fixes need a non-improving first step).
function candidateFixesForWing(cubies: Cubie[], w: Cubie, lib: EdgeLibrary, maxSetupDepth: number): Move[][] {
  const wPos = posKey(w);
  const candidates = lib.posLookup.get(wPos) ?? [];
  const fixes: Move[][] = [];
  for (const { entry, legIndex } of candidates) {
    const leg = entry.legs[legIndex];
    const [tx, ty, tz] = leg.to.split(",").map(Number);
    const tv: Record<Axis, number> = { x: tx, y: ty, z: tz };
    const freeAxis = AXES.find((a) => Math.abs(tv[a]) !== 1.5)!;
    const targetForP = { ...tv };
    targetForP[freeAxis] = -targetForP[freeAxis];
    const targetForPKey = `${targetForP.x},${targetForP.y},${targetForP.z}`;

    const setup = prepareAndApply(cubies, w, entry, targetForPKey, lib.partnerById, maxSetupDepth);
    if (setup === null) continue;
    fixes.push([...setup, ...entry.seq]);
  }
  return fixes;
}

function tryFixWing(cubies: Cubie[], w: Cubie, lib: EdgeLibrary, maxSetupDepth: number): Move[] | null {
  const before = unpairedWingCount(cubies);
  for (const fix of candidateFixesForWing(cubies, w, lib, maxSetupDepth)) {
    const clone = cloneCubies(cubies);
    applySeq(clone, fix);
    if (unpairedWingCount(clone) < before) return fix;
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

// Recursive shuffled lookahead: tries a single improving fix for each wrong
// wing (shuffled order) first; if none improves the score directly, tries a
// bounded number of non-improving candidate fixes and recurses, mirroring
// fourByFourCenters.ts's bestFixOverall. Measured (N=25, x2) at ~96% single-
// attempt-pool success with PLIES=4 vs ~92% for a flat 2-ply fallback, while
// also being faster on the typical case -- a deeper but still fully generic
// (not 4x4-specific) search escapes local minima more often than relying on
// restarts alone.
const PLIES = 4;
const BRANCH_CAP = 6;
function bestFixOverall(cubies: Cubie[], lib: EdgeLibrary, plies: number, deadline: number): Move[] | null {
  if (Date.now() > deadline) return null;
  const baseline = unpairedWingCount(cubies);
  if (baseline === 0) return [];
  for (const w of shuffle(wrongWings(cubies, lib.partnerById))) {
    const fix = tryFixWing(cubies, w, lib, 6);
    if (fix) return fix;
  }
  if (plies <= 1) return null;
  for (const w of shuffle(wrongWings(cubies, lib.partnerById))) {
    if (Date.now() > deadline) return null;
    for (const fix of shuffle(candidateFixesForWing(cubies, w, lib, 6)).slice(0, BRANCH_CAP)) {
      const clone = cloneCubies(cubies);
      applySeq(clone, fix);
      const rest = bestFixOverall(clone, lib, plies - 1, deadline);
      if (rest === null) continue;
      const combined = [...fix, ...rest];
      const finalClone = cloneCubies(cubies);
      applySeq(finalClone, combined);
      if (unpairedWingCount(finalClone) < baseline) return combined;
    }
  }
  return null;
}

function solveEdgesOneAttempt(cubies: Cubie[], lib: EdgeLibrary, deadline: number): { solved: boolean; movesApplied: number } {
  let guard = 0;
  let movesApplied = 0;
  while (unpairedWingCount(cubies) > 0 && guard < 40 && Date.now() < deadline) {
    guard++;
    const fix = bestFixOverall(cubies, lib, PLIES, deadline);
    if (!fix || fix.length === 0) break;
    applySeq(cubies, fix);
    movesApplied += fix.length;
  }
  return { solved: unpairedWingCount(cubies) === 0, movesApplied };
}

export interface SolveEdgePairingResult {
  solved: boolean;
  movesApplied: number;
}

// Cooperative yielding: each restart attempt is fast (typically well under
// 2s), but a run of many restarts back-to-back can still add up to several
// seconds of unbroken synchronous work, which would freeze the tab.
const FRAME_BUDGET_MS = 14;
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Raw moves for the residual fallback below: outer, wide, and bare-inner
// turns, each as single/prime/double. Double turns are included as an
// atomic move deliberately -- a double turn's own single-90 half-step
// usually scores worse than the start, so a search that only explores
// forward from improving states would discard it before completing the
// second half and finding the real gain (see git history for the earlier
// search-based solver, which had the same requirement).
const RESIDUAL_RAW_MOVES: Move[][] = [];
for (const face of ALL_FACES) {
  for (const times of [1, -1, 2]) {
    RESIDUAL_RAW_MOVES.push(faceTurn(face, times));
    RESIDUAL_RAW_MOVES.push(wideTurn(face, times));
    RESIDUAL_RAW_MOVES.push(bareInnerTurn(face, times));
  }
}
const RESIDUAL_FRONTIER_CAP = 200000;

// Last-resort fallback for when every restart attempt above still gets
// stuck: a plain BFS over raw moves, NOT restricted to the 3-cycle
// library's "one clean conjugate application at a time" structure. Verified
// empirically (see git history for the diagnostic scripts) that scheduler
// "stuck" states are NOT true dead ends -- they just require passing
// through a state the library-based search never explores (since every
// library application must return the setup to a clean, fully-paired-
// except-for-the-fix state; a raw move sequence has no such constraint).
// Only invoked on the small residual left after restarts are exhausted
// (typically 4-8 wrong wings out of 24), so despite being unrestricted
// search, it stays cheap relative to running this over the full board.
async function residualRawMoveBFS(cubies: Cubie[], maxDepth: number, deadline: number): Promise<Move[] | null> {
  if (unpairedWingCount(cubies) === 0) return [];
  type Node = { cubies: Cubie[]; path: Move[] };
  let frontier: Node[] = [{ cubies: cloneCubies(cubies), path: [] }];
  const seen = new Set<string>();
  let lastYield = Date.now();
  for (let depth = 0; depth < maxDepth && Date.now() < deadline; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (Date.now() > deadline) return null;
      for (const move of RESIDUAL_RAW_MOVES) {
        const clone = cloneCubies(node.cubies);
        applySeq(clone, move);
        const key = clone
          .filter((c) => pieceType(c) === "edge")
          .map((c) => `${c.id}:${posKey(c)}`)
          .join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        const path = [...node.path, ...move];
        if (unpairedWingCount(clone) === 0) return path;
        if (next.length < RESIDUAL_FRONTIER_CAP) next.push({ cubies: clone, path });
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

/**
 * Pairs up all 24 wing pieces into their 12 same-colored pairs, in place.
 * Position of each pair doesn't matter (see unpairedWingCount) -- the
 * reduction-to-3x3x3 solve afterward handles final placement. Centers are
 * not protected here (the algorithm's own R/U/F legs disturb them) --
 * solveCenters is safe to run again afterward since its own moves never
 * touch edges.
 *
 * Built on a deterministic 3-cycle algorithm (R U R' Uw F U' F' Uw',
 * conjugated by all 24 whole-cube rotations into a lookup library) plus a
 * risk-zone-aware setup search, rather than blind search -- each attempt
 * typically finishes in low single-digit seconds. A single attempt can still
 * plateau in a local minimum, so failed attempts restart from the original
 * scramble with shuffled fix ordering (measured ~90%+ success across
 * restarts, worst case well under a minute, vs. the old search-based
 * approach's 55-60% success at 25-100+ seconds).
 *
 * If every restart still gets stuck, this falls back once to
 * residualRawMoveBFS on whichever attempt left the smallest residual --
 * confirmed by testing that a "stuck" scheduler state is not a true dead
 * end, just one the library-application structure can't escape on its own.
 */
export async function solveEdgePairing(
  cubies: Cubie[],
  timeBudgetMs = 100000,
  maxRestarts = 60,
  perAttemptMs = 2000,
): Promise<SolveEdgePairingResult> {
  const lib = buildEdgeLibrary();
  const overallDeadline = Date.now() + timeBudgetMs;
  let lastYield = Date.now();

  let bestCubies: Cubie[] | null = null;
  let bestWrong = Infinity;

  for (let attempt = 0; attempt < maxRestarts && Date.now() < overallDeadline; attempt++) {
    const attemptCubies = cloneCubies(cubies);
    const attemptDeadline = Math.min(Date.now() + perAttemptMs, overallDeadline);
    const result = solveEdgesOneAttempt(attemptCubies, lib, attemptDeadline);
    if (result.solved) {
      for (let i = 0; i < cubies.length; i++) {
        cubies[i].position.copy(attemptCubies[i].position);
        cubies[i].orientation.copy(attemptCubies[i].orientation);
      }
      return { solved: true, movesApplied: result.movesApplied };
    }
    const wrong = unpairedWingCount(attemptCubies);
    if (wrong < bestWrong) {
      bestWrong = wrong;
      bestCubies = attemptCubies;
    }
    if (Date.now() - lastYield > FRAME_BUDGET_MS) {
      await yieldToEventLoop();
      lastYield = Date.now();
    }
  }

  if (bestCubies && Date.now() < overallDeadline) {
    const fix = await residualRawMoveBFS(bestCubies, 6, overallDeadline);
    if (fix) {
      applySeq(bestCubies, fix);
      for (let i = 0; i < cubies.length; i++) {
        cubies[i].position.copy(bestCubies[i].position);
        cubies[i].orientation.copy(bestCubies[i].orientation);
      }
      return { solved: true, movesApplied: fix.length };
    }
  }

  return { solved: false, movesApplied: 0 };
}
