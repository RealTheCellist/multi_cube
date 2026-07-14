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

// The net effect of applying `seq` in full, precomputed once per starting
// position rather than replayed move-by-move against a live state every
// time. A single library entry's raw move sequence can run to 30+ moves
// (rot + BASE_ALG + invertSeq(rot)) -- since the sequence's effect on any
// position is fixed (doesn't depend on what piece or colors are currently
// there), it's computed once as {finalPosition, orderedSubsequenceOfMovesThatActuallyApplied}
// for each of the 36 edge-region positions, then reused as an O(1) lookup
// (tryFixWing reads entry.effect.get(p1).pos directly to know exactly
// which position a wrong wing's swap-partner needs to reach) plus a much
// shorter replay (only the moves that actually touched that position,
// typically well under the full sequence length) instead of the full
// sequence every time.
interface EntryEffect {
  pos: readonly [number, number, number];
  rotationSteps: readonly Move[];
}

interface LibraryEntry {
  seq: Move[];
  effect: Map<string, EntryEffect>;
}

function computeEntryEffect(seq: readonly Move[]): Map<string, EntryEffect> {
  const solvedRef = buildSolvedCube(5);
  const effect = new Map<string, EntryEffect>();
  for (const c of solvedRef) {
    const t = pieceType5(c);
    if (t !== "wingEdge" && t !== "trueEdge") continue;
    const startKey = posKey(c);
    if (effect.has(startKey)) continue;
    let cur: [number, number, number] = [round(c, "x"), round(c, "y"), round(c, "z")];
    const rotationSteps: Move[] = [];
    for (const move of seq) {
      const [axis, layer, sign] = move;
      const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      if (cur[axisIndex] !== layer) continue;
      cur = axisSign(axis, sign, cur);
      rotationSteps.push(move);
    }
    effect.set(startKey, { pos: cur, rotationSteps });
  }
  return effect;
}

interface WingLibrary {
  entries: LibraryEntry[];
  // Indexes entries by each leg's origin position, so a specific wrong
  // wing only has to try the handful of entries that actually move a wing
  // out of its own slot -- trying all entries for every wrong wing (BFS
  // setup search included) turned out to be far too slow in practice (a
  // single wing-pairing pass regressed from ~300ms to not completing at
  // all within a 60s budget once this filtering was removed -- restored
  // after measuring the regression directly).
  posLookup: Map<string, LibraryEntry[]>;
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

// A compound (two base entries concatenated) is registered as a usable
// tool purely by its POSITION-permutation pattern (computeSoloWingLegs),
// exactly like a base entry -- NOT by whether it preserves "solved-ness"
// on a reference cube. Swapping/cycling wings between DIFFERENT slots on
// an ALREADY-SOLVED cube is EXPECTED to look "wrong" there (each slot's
// wing only matches its own slot's colors on a solved cube by definition,
// so relocating it elsewhere necessarily looks mismatched) -- that's not a
// defect, it's simply the wrong test. A first attempt at a "safety" check
// required wrongWingCount5 to return to 0 on a solved reference and
// rejected every single one of 552 candidate pairs, which is exactly what
// this reasoning predicts. The REAL correctness check happens live, per
// solving attempt, via tryFixWing's own verification (does applying this
// tool to the ACTUAL current scrambled state reduce wrongness) -- this
// function only needs to confirm the tool doesn't relocate a true
// center (which would corrupt the position-defines-color convention every
// other check relies on; nothing in this solver's move vocabulary should
// ever do that, so a pair that does indicates a translation bug).
function doesNotMoveTrueCenters(seq: readonly Move[]): boolean {
  const solvedRef = buildSolvedCube(5);
  const after = cloneCubies(solvedRef);
  applySeq(after, seq);
  for (let i = 0; i < solvedRef.length; i++) {
    if (pieceType5(solvedRef[i]) !== "trueCenter") continue;
    if (solvedRef[i].position.distanceToSquared(after[i].position) > 1e-9) return false;
  }
  return true;
}

let cachedLibrary: WingLibrary | null = null;
function buildWingLibrary(): WingLibrary {
  if (cachedLibrary) return cachedLibrary;
  const solvedRef = buildSolvedCube(5);
  const entries: LibraryEntry[] = [];
  const posLookup = new Map<string, LibraryEntry[]>();
  const seen = new Set<string>();

  function addEntry(variant: Move[], legs: { from: string; to: string }[]): void {
    const key = legs
      .map((l) => `${l.from}>${l.to}`)
      .sort()
      .join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const entry: LibraryEntry = { seq: variant, effect: computeEntryEffect(variant) };
    entries.push(entry);
    for (const leg of legs) {
      const list = posLookup.get(leg.from) ?? [];
      list.push(entry);
      posLookup.set(leg.from, list);
    }
  }

  const baseVariants: Move[][] = [];
  for (const rot of ROTATIONS) {
    const variant = [...rot, ...BASE_ALG, ...invertSeq(rot)];
    const before = cloneCubies(solvedRef);
    const after = cloneCubies(before);
    applySeq(after, variant);
    const legs = computeSoloWingLegs(before, after);
    if (legs.length !== 2) continue;
    baseVariants.push(variant);
    addEntry(variant, legs);
  }

  // Multi-tool step: compose PAIRS of the verified 2-wing-swap variants.
  // When variant A swaps wings at slots {P1,P2} and variant B swaps wings
  // at slots {P2,P3} (sharing exactly one slot), applying A then B is a
  // standard group-theory move -- composing two overlapping transpositions
  // yields a 3-cycle (P1 P3 P2) -- giving the solver a genuinely different
  // tool (a 3-cycle among wings) instead of just more rotations of the same
  // 2-swap shape. This was the concrete gap after the single-swap tool
  // alone plateaued at a residual of ~6-11 wrong wings out of ~24 no matter
  // how much search budget or how many restart kicks were thrown at it
  // (see git history) -- a pure 2-swap can't reach every permutation a
  // 3-cycle can. Registered exactly like a base entry (by its position-
  // permutation pattern via computeSoloWingLegs, not by any "stays solved"
  // property -- see doesNotMoveTrueCenters's comment for why that's the
  // wrong test); actual usefulness for a given scramble is decided live by
  // tryFixWing, same as for every other entry.
  for (const a of baseVariants) {
    for (const b of baseVariants) {
      if (a === b) continue;
      const combined = [...a, ...b];
      const before = cloneCubies(solvedRef);
      const after = cloneCubies(before);
      applySeq(after, combined);
      const legs = computeSoloWingLegs(before, after);
      if (legs.length < 2) continue;
      if (!doesNotMoveTrueCenters(combined)) continue;
      addEntry(combined, legs);
    }
  }

  cachedLibrary = { entries, posLookup };
  return cachedLibrary;
}

// A wing "matching" its slot's true edge means more than sharing the same
// unordered pair of colors (colorKey) -- it must show the SAME color
// facing each of the slot's 2 boundary directions individually. A wing
// whose 2 stickers are correctly-colored but swapped (flipped) passes the
// unordered check while looking visibly wrong (this was an actual bug
// found via testing, not a hypothetical -- see git history: it slipped
// through as "paired" and only surfaced once the true-center-position bug
// above was fixed and stopped masking it).
function colorFacing(c: Cubie, axis: Axis, sign: 1 | -1): Face | undefined {
  return c.stickers.find((s) => {
    const d = s.direction.clone().applyQuaternion(c.orientation).round();
    return Math.abs(d[axis] - sign) < 0.01 && d.length() > 0.5;
  })?.color;
}
function boundaryAxes(c: Cubie): { axis: Axis; sign: 1 | -1 }[] {
  return AXES.filter((a) => Math.abs(round(c, a)) === BOUNDARY).map((a) => ({ axis: a, sign: Math.sign(round(c, a)) as 1 | -1 }));
}
function matchesTrueEdge(wing: Cubie, trueEdge: Cubie): boolean {
  return boundaryAxes(wing).every(({ axis, sign }) => colorFacing(wing, axis, sign) === colorFacing(trueEdge, axis, sign));
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
    for (const w of wings) if (!matchesTrueEdge(w, trueEdge)) wrong.push(w);
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
// numbers, and this BFS explores many candidate states per call). Unlike
// an earlier version, this tracks each sticker's CURRENT facing direction
// (not just an unordered color pair) -- rotated in lockstep with position
// via the same axisSign math -- since "matching" a true edge depends on
// orientation, not just which 2 colors are present (see matchesTrueEdge
// above; the exact same bug existed here as a live BFS state, not just in
// the final scoring check, and was just as wrong for the same reason).
interface LiteSticker5 {
  dx: number;
  dy: number;
  dz: number;
  color: Face;
}
interface LiteEdge5 {
  id: number;
  type: "wingEdge" | "trueEdge";
  x: number;
  y: number;
  z: number;
  stickers: readonly LiteSticker5[];
}
function toLiteEdges(cubies: readonly Cubie[]): LiteEdge5[] {
  return cubies
    .filter((c) => pieceType5(c) === "wingEdge" || pieceType5(c) === "trueEdge")
    .map((c) => ({
      id: c.id,
      type: pieceType5(c) as "wingEdge" | "trueEdge",
      x: round(c, "x"),
      y: round(c, "y"),
      z: round(c, "z"),
      stickers: c.stickers.map((s) => {
        const d = s.direction.clone().applyQuaternion(c.orientation).round();
        return { dx: d.x, dy: d.y, dz: d.z, color: s.color };
      }),
    }));
}
function liteStateKey(edges: readonly LiteEdge5[]): string {
  return edges
    .map((e) => `${e.id}:${e.x},${e.y},${e.z}:${e.stickers.map((s) => `${s.dx}${s.dy}${s.dz}${s.color}`).join(",")}`)
    .sort()
    .join("|");
}
function liteApplyMove(edges: readonly LiteEdge5[], move: Move): LiteEdge5[] {
  const [axis, layer, sign] = move;
  return edges.map((e) => {
    if (e[axis] !== layer) return e;
    const [x, y, z] = axisSign(axis, sign, [e.x, e.y, e.z]);
    const stickers = e.stickers.map((s) => {
      const [dx, dy, dz] = axisSign(axis, sign, [s.dx, s.dy, s.dz]);
      return { dx, dy, dz, color: s.color };
    });
    return { id: e.id, type: e.type, x, y, z, stickers };
  });
}
function candidatesForWing(lib: WingLibrary, w: Cubie): readonly LibraryEntry[] {
  return lib.posLookup.get(posKey(w)) ?? [];
}

function colorKeyOf(c: Cubie): string {
  return c.stickers
    .map((s) => s.color)
    .slice()
    .sort()
    .join("");
}
function liteColorKeyOf(e: LiteEdge5): string {
  return e.stickers
    .map((s) => s.color)
    .slice()
    .sort()
    .join("");
}
function litePosKeyOf(e: LiteEdge5): string {
  return `${e.x},${e.y},${e.z}`;
}

// Deterministic, piece-tracking replacement for the earlier blind-search
// setup (see git history): rather than searching for "any setup moves such
// that this fixed algorithm happens to help" (which has no guaranteed
// solution -- a wrong wing's needed partner might not be reachable via any
// of the library's precomputed swap patterns from wherever it currently
// sits relative to THIS specific setup search), this identifies the EXACT
// piece needed (by its color identity, tracked via id) and searches only
// for "bring THIS SPECIFIC piece to THIS SPECIFIC target position" -- a
// well-defined reachability problem that's essentially always solvable on
// a connected puzzle, mirroring how the real "Freeslice" technique works
// (find the matching piece, bring it over, insert) rather than "search
// blindly and hope something matches." The multi-tool library's compound
// entries plateaued at a residual of ~6-11 wrong wings out of ~24 despite
// much more search budget (see git history) precisely because that search
// had no notion of "the piece I actually need" -- it could only recognize
// wrongness improving after the fact, never aim for a specific known-good
// outcome.
const MAX_TRACK_NODES = 8000;
// `pin` keeps a second, specific piece nailed to a specific position for the
// whole search -- without it, a setup path is free to relocate whatever
// wrong wing the caller is trying to fix as an incidental side effect of the
// very moves used to bring the match piece into place (single-outer-layer
// turns move a wide net of pieces at once). By the time the caller's fixed
// swap-algorithm runs, the wrong wing may no longer be where the caller
// computed its target from, so the "swap" ends up trading two unrelated
// pieces and the net wrongness count never improves -- confirmed directly
// via instrumentation (every candidate reported setupFails=0 but
// noImprove=50, i.e. a setup was always found but never actually helped).
function bfsMoveWingToPosition(
  edges: readonly LiteEdge5[],
  pieceId: number,
  targetPosKey: string,
  maxDepth: number,
  pin?: { id: number; posKey: string }
): Move[] | null {
  const startPiece = edges.find((e) => e.id === pieceId);
  if (!startPiece) return null;
  if (litePosKeyOf(startPiece) === targetPosKey) return [];

  const safe = allOuterMoves().flat();
  let frontier: { edges: readonly LiteEdge5[]; path: Move[] }[] = [{ edges, path: [] }];
  const seen = new Set<string>([liteStateKey(edges)]);
  let nodesExplored = 0;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: { edges: readonly LiteEdge5[]; path: Move[] }[] = [];
    for (const node of frontier) {
      for (const move of safe) {
        if (nodesExplored++ > MAX_TRACK_NODES) return null;
        const nextEdges = liteApplyMove(node.edges, move);
        if (pin) {
          const pinnedPiece = nextEdges.find((e) => e.id === pin.id)!;
          if (litePosKeyOf(pinnedPiece) !== pin.posKey) continue;
        }
        const path = [...node.path, move];
        const piece = nextEdges.find((e) => e.id === pieceId)!;
        if (litePosKeyOf(piece) === targetPosKey) return path;
        const key = liteStateKey(nextEdges);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ edges: nextEdges, path });
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return null;
}

function tryFixWing(cubies: Cubie[], w: Cubie, lib: WingLibrary, deadline: number): Move[] | null {
  const before = wrongWingCount5(cubies);
  const p1 = posKey(w);
  const wSlot = slotKey(w);
  const trueEdge = cubies.find((c) => pieceType5(c) === "trueEdge" && slotKey(c) === wSlot);
  if (!trueEdge) return null;
  const neededColorKey = colorKeyOf(trueEdge);
  const edges = toLiteEdges(cubies);
  // Only ever pull a match from wings that are ALREADY wrong: they're the
  // only pieces genuinely "free" to relocate. A wing that's currently
  // correctly paired at its own slot has nothing to gain from being yanked
  // out to help w -- doing so fixes w's slot but breaks the one it came
  // from, which is a wash (or worse) for the overall wrongWingCount, not a
  // real improvement. This was the actual cause of a long-standing plateau
  // (confirmed via instrumentation: setup always succeeded, but applying it
  // never helped -- p1 would become correct while some other,
  // previously-correct slot broke elsewhere, net flat or negative).
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));

  for (const entry of candidatesForWing(lib, w)) {
    if (Date.now() > deadline) return null;
    const eff = entry.effect.get(p1);
    if (!eff) continue;
    const p2Key = `${eff.pos[0]},${eff.pos[1]},${eff.pos[2]}`;
    if (p2Key === p1) continue;

    const matches = edges.filter(
      (e) => e.type === "wingEdge" && e.id !== w.id && wrongIds.has(e.id) && liteColorKeyOf(e) === neededColorKey
    );
    for (const match of matches) {
      // Pin w at p1 for the whole setup search -- without this, the setup
      // moves (which relocate a wide net of pieces per turn) are free to
      // carry w itself away from p1 as a side effect, so by the time
      // entry.seq runs, the "swap" trades two positions that no longer hold
      // the pieces this whole operation was computed for (also confirmed
      // via instrumentation: setup always found a path, but the fixed swap
      // then acted on the wrong pieces).
      const setup =
        litePosKeyOf(match) === p2Key ? [] : bfsMoveWingToPosition(edges, match.id, p2Key, 6, { id: w.id, posKey: p1 });
      if (setup === null) continue;
      const fullSeq = [...setup, ...entry.seq];
      const clone = cloneCubies(cubies);
      applySeq(clone, fullSeq);
      if (wrongWingCount5(clone) < before) return fullSeq;
    }
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

// Deliberately just the single-ply pass: for each wrong wing, look for one
// library entry (plus setup) that improves things right now. No multi-ply
// recursive fallback -- get this basic pass working reliably first (relying
// on the outer restart-based scheduler in solveWingPairing5 for coverage
// across attempts) before layering any deeper/branchier search back in.
function bestFixOverall(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  if (Date.now() > deadline) return null;
  const baseline = wrongWingCount5(cubies);
  if (baseline === 0) return [];
  for (const w of shuffle(wrongWings5(cubies))) {
    if (Date.now() > deadline) return null;
    const fix = tryFixWing(cubies, w, lib, deadline);
    if (fix) return fix;
  }
  return null;
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

// Applies fixes until stuck (bestFixOverall finds nothing more) or solved.
function drainFixes(cubies: Cubie[], lib: WingLibrary, moves: Move[], deadline: number): void {
  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline) {
    const fix = bestFixOverall(cubies, lib, deadline);
    if (!fix || fix.length === 0) return;
    applySeq(cubies, fix);
    moves.push(...fix);
  }
}

function faceForAxisValue(axis: Axis, value: number): Face {
  if (axis === "x") return value > 0 ? "R" : "L";
  if (axis === "y") return value > 0 ? "U" : "D";
  return value > 0 ? "F" : "B";
}

// Faces touching at least one currently-wrong wing's own slot -- a kick
// drawn from these is far more likely to actually shuffle the stuck
// residual than a uniformly random face turn, which mostly lands on
// already-correct wings elsewhere and wastes the kick.
function facesTouchingWrongWings(cubies: Cubie[]): Set<Face> {
  const faces = new Set<Face>();
  for (const w of wrongWings5(cubies)) {
    for (const { axis, sign } of boundaryAxes(w)) faces.add(faceForAxisValue(axis, sign));
  }
  return faces;
}

/**
 * Pairs all 24 wing pieces to match their own edge-slot's true edge (unlike
 * 4x4x4, where wings just need to match each other -- a 5x5x5's true edge
 * is a fixed reference, like a 3x3x3 edge, so wings have a specific,
 * pre-existing target color rather than a free choice).
 *
 * Works on a single persistent state rather than discarding-and-restarting
 * from the original scramble on every plateau: an earlier restart-based
 * version cloned a fresh copy of the ORIGINAL scramble for every attempt and
 * only kept an attempt's progress if it fully completed, which threw away
 * an attempt's real, correct partial progress (confirmed directly: a single
 * attempt would often fix a majority of wings before plateauing on a
 * residual few, and every one of those fixes was discarded because the
 * attempt itself never fully finished). Instead, when stuck, this applies
 * a "kick" -- a random safe outer move -- to perturb out of the plateau and
 * keeps going from there, so already-correct wings stay correct across
 * kicks instead of being re-solved from scratch every time. The kick is
 * biased toward faces that actually touch a currently-wrong wing's own
 * slot (rather than picked uniformly from all 12 outer moves), since a
 * kick that only disturbs already-correct wings elsewhere wastes the
 * attempt without giving the stuck residual any new opportunity to resolve.
 */
export async function solveWingPairing5(cubies: Cubie[], timeBudgetMs = 100000, maxKicks = 200): Promise<SolveWingPairing5Result> {
  const lib = buildWingLibrary();
  const overallDeadline = Date.now() + timeBudgetMs;
  const working = cloneCubies(cubies);
  const moves: Move[] = [];
  // allOuterMoves() returns Move[][] (each face turn wrapped in its own
  // 1-element sequence) -- flattened here since the filter below needs to
  // destructure each entry as a single [axis, layer, sign] Move. Leaving it
  // unflattened silently destructured the wrapper array itself instead
  // (axis would be the whole Move tuple, layer undefined), making the
  // "targeted kick" filter effectively broken/random rather than actually
  // biasing toward faces touching a wrong wing.
  const allKickMoves = allOuterMoves().flat();
  let lastYield = Date.now();

  drainFixes(working, lib, moves, overallDeadline);

  for (let kick = 0; kick < maxKicks && wrongWingCount5(working) > 0 && Date.now() < overallDeadline; kick++) {
    const relevantFaces = facesTouchingWrongWings(working);
    const kickMoves = allKickMoves.filter(([axis, layer]) => relevantFaces.has(faceForAxisValue(axis, layer)));
    const pool = kickMoves.length > 0 ? kickMoves : allKickMoves;
    const move = pool[Math.floor(Math.random() * pool.length)];
    applySeq(working, [move]);
    moves.push(move);
    drainFixes(working, lib, moves, overallDeadline);

    if (Date.now() - lastYield > FRAME_BUDGET_MS) {
      await yieldToEventLoop();
      lastYield = Date.now();
    }
  }

  // Always reflect whatever progress was actually made, solved or not --
  // an all-or-nothing "revert everything on failure" contract is exactly
  // what discarded real progress before (see comment above).
  for (let i = 0; i < cubies.length; i++) {
    cubies[i].position.copy(working[i].position);
    cubies[i].orientation.copy(working[i].orientation);
  }
  return { solved: wrongWingCount5(working) === 0, movesApplied: moves.length, moves };
}
