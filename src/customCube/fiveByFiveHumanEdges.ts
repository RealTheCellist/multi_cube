import type { Cubie } from "./cubeState";
import { pieceType5 } from "./fiveByFivePieces";
import {
  allOuterMoves,
  applySeq,
  bestFixOverall,
  buildCaseLibrary,
  buildFlipLibrary,
  buildWingLibrary,
  type CaseEntry,
  colorKeyOf,
  ENDGAME_MULTIPLY_THRESHOLD,
  faceForAxisValue,
  facesTouchingWrongWings,
  FRAME_BUDGET_MS,
  type Move,
  slotKey,
  tryEndgameMultiPly,
  tryEndgameThroughDisruption,
  tryExactCaseMatch,
  tryFixWing,
  tryFlipWingsInPlace,
  wrongWingCount5,
  wrongWings5,
  yieldToEventLoop,
  type WingLibrary,
} from "./fiveByFiveEdges";
import { cloneCubies } from "./cubeState";

// ============================================================================
// 5x5x5 "Human-Style" edge (wing-pairing) solver -- Stage 3 of the pasted
// design doc, following the same split as fiveByFiveHumanCenters.ts: the
// Move Engine (the wing/flip libraries, tryFixWing's setup-search, the
// proven bestFixOverall/tryEndgameMultiPly grinder) is entirely reused from
// fiveByFiveEdges.ts, which stays untouched as the reference/fallback.
// What's new here is the decision-making layer above it: a State Analyzer
// that reads each of the 12 true-edge slots' pairing progress, a Pattern
// Detector that names the shape of that progress, and a Goal Evaluator that
// scores candidate fixes by whether they finish an almost-done edge and
// whether they preserve edges that are already fully paired -- mirroring
// the design doc's edge strategy ("find the nearest wing pair, pair it,
// preserve the pair, repeat"), rather than fiveByFiveEdges.ts's plain
// "first improving fix, in shuffled order" pass.
// ============================================================================

// --- State Analyzer ----------------------------------------------------------
export interface EdgeSlotStats {
  slot: string;
  trueEdge: Cubie;
  wings: Cubie[];
  pairedCount: number; // 0, 1, or 2 -- how many of this slot's 2 wings match its true edge
}

export function analyzeEdgeSlots(cubies: Cubie[]): EdgeSlotStats[] {
  const bySlot = new Map<string, { trueEdge: Cubie | null; wings: Cubie[] }>();
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t !== "wingEdge" && t !== "trueEdge") continue;
    const key = slotKey(c);
    const entry = bySlot.get(key) ?? { trueEdge: null, wings: [] };
    if (t === "trueEdge") entry.trueEdge = c;
    else entry.wings.push(c);
    bySlot.set(key, entry);
  }
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const stats: EdgeSlotStats[] = [];
  for (const [slot, { trueEdge, wings }] of bySlot) {
    if (!trueEdge) continue;
    const pairedCount = wings.filter((w) => !wrongIds.has(w.id)).length;
    stats.push({ slot, trueEdge, wings, pairedCount });
  }
  return stats;
}

// --- Pattern Detector --------------------------------------------------------
// Named per the design doc's own edge-strategy vocabulary ("이미 짝지어진
// 것 유지" / preserve what's already paired, "가장 쉬운 것부터" / easiest
// first): a slot with pairedCount 0 whose 2 wings nonetheless already SHARE
// a color-key with their true edge (just flipped in place, see
// fiveByFiveEdges.ts's FLIP_ALG) is a genuinely easier, cheaper-to-finish
// case than a slot whose wings are colored for entirely different edges, so
// it gets its own name rather than being lumped in with "unpaired".
export type EdgeSlotPatternName = "unpaired" | "flipped-pair" | "half-paired" | "paired";

export function detectEdgeSlotPattern(stats: EdgeSlotStats): EdgeSlotPatternName {
  if (stats.pairedCount === 2) return "paired";
  if (stats.pairedCount === 1) return "half-paired";
  const bothColorKeyMatch = stats.wings.length === 2 && stats.wings.every((w) => colorKeyOf(w) === colorKeyOf(stats.trueEdge));
  return bothColorKeyMatch ? "flipped-pair" : "unpaired";
}

// --- Goal Generator + Evaluator ----------------------------------------------
// A "goal" is a single candidate fix for one specific wrong wing, generated
// via fiveByFiveEdges.ts's own proven Move Engine (tryFlipWingsInPlace's O(1)
// lookup first, then tryFixWing's setup-search) -- only the FIRST improving
// fix per wrong wing is taken (not every candidate tryFixWing could
// produce), since that search is itself a BFS and scoring every possible
// candidate for every wrong wing was measured, on the centers file's
// equivalent mistake, to be far too slow to finish in reasonable time. The
// Evaluator's judgment is about WHICH wrong wing to fix next, not about
// exhaustively picking among that wing's own fix options.
export interface EdgeGoal {
  wing: Cubie;
  moves: Move[];
  netImprovement: number; // wrongWingCount5 before - after, can be <=0
  completesSlot: boolean; // this wing's own slot goes from <2 to 2 paired
  disruptsOtherPairedSlot: boolean; // some OTHER already-fully-paired slot becomes not fully paired
  score: number;
  resultState: Cubie[];
}

function pairedSlotSet(cubies: Cubie[]): Set<string> {
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const bySlot = new Map<string, Cubie[]>();
  for (const c of cubies) {
    if (pieceType5(c) !== "wingEdge") continue;
    const key = slotKey(c);
    const list = bySlot.get(key) ?? [];
    list.push(c);
    bySlot.set(key, list);
  }
  const paired = new Set<string>();
  for (const [slot, wings] of bySlot) {
    if (wings.length === 2 && wings.every((w) => !wrongIds.has(w.id))) paired.add(slot);
  }
  return paired;
}

const W_NET_IMPROVEMENT = 100;
const W_COMPLETION_BONUS = 150;
const W_COLLATERAL_PENALTY = 400;
const W_COST = 2;

// Only the wrong wings belonging to an already-half-paired or flipped-pair
// slot are considered -- i.e. wings whose fix would FINISH an edge that's
// already mostly done, exactly the design doc's own "find the piece that
// completes what's nearly there" priority. This is also what makes the
// scoring tractable at all: tryFixWing's own setup search is a genuine BFS
// (thousands of nodes per call, see fiveByFiveEdges.ts), and scoring every
// one of the ~20+ wrong wings on a fresh scramble (as an earlier version of
// this function did) was measured directly to spend 32+ seconds fixing only
// 2 wings -- almost all of it burned on tryFixWing calls for wrong wings
// that had no special reason to be tried first. Restricting to nearly-done
// slots keeps this candidate set small (usually 0-4 wings) while still
// doing genuinely useful, human-plausible prioritization; the general case
// (nothing yet half-paired) is left entirely to the proven bestFixOverall
// fallback below, which is fast because it stops at the first working fix
// instead of scoring every option.
function priorityWrongWings(cubies: Cubie[]): Cubie[] {
  const stats = analyzeEdgeSlots(cubies);
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const priority: Cubie[] = [];
  for (const s of stats) {
    if (s.pairedCount === 0 && detectEdgeSlotPattern(s) !== "flipped-pair") continue;
    for (const w of s.wings) if (wrongIds.has(w.id)) priority.push(w);
  }
  return priority;
}

// tryFixWing's own setup search still runs its FULL BFS budget even when it
// ultimately fails to find a fix for a given wing (see fiveByFiveEdges.ts) --
// measured directly that calling it for every priority wing on every
// drainHumanStyle iteration, with no cap of its own, could burn nearly the
// entire time budget on repeated failed searches before ever falling back to
// the proven bestFixOverall (a scramble that made almost no progress in 30s
// despite the fallback being fast on its own). Capping each priority pass to
// a short local sub-deadline means a few unproductive tryFixWing calls defer
// to that fallback quickly instead of eating the whole iteration.
const PRIORITY_PASS_BUDGET_MS = 150;

export function generateEdgeGoals(cubies: Cubie[], lib: WingLibrary, flipLib: Map<string, Move[]>, deadline: number): EdgeGoal[] {
  const beforeWrong = wrongWingCount5(cubies);
  const beforePaired = pairedSlotSet(cubies);
  const goals: EdgeGoal[] = [];
  const localDeadline = Math.min(deadline, Date.now() + PRIORITY_PASS_BUDGET_MS);

  for (const w of priorityWrongWings(cubies)) {
    if (Date.now() > localDeadline) break;
    const moves = tryFlipWingsInPlace(cubies, w, flipLib, beforeWrong) ?? tryFixWing(cubies, w, lib, localDeadline);
    if (!moves) continue;

    const clone = cloneCubies(cubies);
    applySeq(clone, moves);
    const afterWrong = wrongWingCount5(clone);
    const netImprovement = beforeWrong - afterWrong;

    const wSlot = slotKey(w);
    const afterPaired = pairedSlotSet(clone);
    const completesSlot = !beforePaired.has(wSlot) && afterPaired.has(wSlot);
    let disruptsOtherPairedSlot = false;
    for (const s of beforePaired) {
      if (s !== wSlot && !afterPaired.has(s)) {
        disruptsOtherPairedSlot = true;
        break;
      }
    }

    const score =
      netImprovement * W_NET_IMPROVEMENT + (completesSlot ? W_COMPLETION_BONUS : 0) - (disruptsOtherPairedSlot ? W_COLLATERAL_PENALTY : 0) - moves.length * W_COST;

    goals.push({ wing: w, moves, netImprovement, completesSlot, disruptsOtherPairedSlot, score, resultState: clone });
  }

  goals.sort((a, b) => b.score - a.score);
  return goals;
}

// --- Planner -----------------------------------------------------------------
// Primary pass: take the best-scoring goal that both improves and doesn't
// disrupt an already-fully-paired slot, finishing nearly-done edges before
// starting fresh ones and never trading one paired edge for another. When
// no such goal exists, fall through to fiveByFiveEdges.ts's own proven
// bestFixOverall + endgame multi-ply search -- reused directly rather than
// reimplemented, for the exact same reason fiveByFiveHumanCenters.ts reuses
// that file's bestFixOverall/idaFallback: a from-scratch equivalent search
// with this file's scoring bolted on was measurably much slower on the
// centers file's version of this problem, and there is no reason to expect
// a different result here (both files share the same "clone + rescan on
// every candidate" cost shape).
const FRAME_YIELD_MS = FRAME_BUDGET_MS;

function pickBestGoal(cubies: Cubie[], lib: WingLibrary, flipLib: Map<string, Move[]>, deadline: number): Move[] | null {
  const goals = generateEdgeGoals(cubies, lib, flipLib, deadline);
  const best = goals.find((g) => g.netImprovement > 0 && !g.disruptsOtherPairedSlot) ?? goals.find((g) => g.netImprovement > 0);
  return best ? best.moves : null;
}

// Deliberately does NOT include tryEndgameThroughDisruption here -- see
// fiveByFiveEdges.ts's own drainFixes comment: calling that search on every
// kick was measured to slow the outer kick loop enough to actually reduce
// the overall solve rate (too few kicks fit in the same time budget). It's
// tried once, as a final attempt, after the kick loop gives up -- see
// solveEdgePairingHumanStyle.
function drainHumanStyle(
  cubies: Cubie[],
  lib: WingLibrary,
  flipLib: Map<string, Move[]>,
  caseLib: readonly CaseEntry[],
  moves: Move[],
  deadline: number
): void {
  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline) {
    // Checked first, ahead of the goal-scoring pass: if the residual is
    // exactly a recognized Last-2-Edges case (see tryExactCaseMatch in
    // fiveByFiveEdges.ts), its own dedicated algorithm resolves it in one
    // clean shot -- cheaper and more complete than the generic goal/grinder
    // fallbacks below, which can't reach a cross-class ("diagonal") wing
    // swap at all.
    let fix: Move[] | null = tryExactCaseMatch(cubies, caseLib, deadline);
    if (!fix) fix = pickBestGoal(cubies, lib, flipLib, deadline);
    if (!fix) fix = bestFixOverall(cubies, lib, flipLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      moves.push(...fix);
      continue;
    }
    if (wrongWingCount5(cubies) <= ENDGAME_MULTIPLY_THRESHOLD) {
      const endgameFix = tryEndgameMultiPly(cubies, lib, flipLib, deadline);
      if (endgameFix && endgameFix.length > 0) {
        applySeq(cubies, endgameFix);
        moves.push(...endgameFix);
        continue;
      }
    }
    return;
  }
}

export interface HumanEdgeSolveResult {
  solved: boolean;
  movesApplied: number;
  moves: Move[];
  patternLog: { slot: string; pattern: EdgeSlotPatternName }[];
}

/**
 * Pairs all 24 wing pieces using the Human-Style Solver architecture: State
 * Analyzer (per-slot pairing progress) -> Pattern Detector (named pairing
 * shapes) -> Goal Generator/Evaluator (score every candidate fix by global
 * progress + slot-completion bonus - other-slot-disruption penalty - move
 * cost) -> Planner (best single goal, else fiveByFiveEdges.ts's proven
 * grinder) -> Move Generator/Execute. Uses the same persistent-state-plus-
 * kick strategy as solveWingPairing5 when the drain plateaus completely
 * (restarting from scratch on every plateau was already measured, in that
 * file's own history, to throw away real progress).
 */
export async function solveEdgePairingHumanStyle(cubies: Cubie[], timeBudgetMs = 100000, maxKicks = 200): Promise<HumanEdgeSolveResult> {
  const lib = buildWingLibrary();
  const flipLib = buildFlipLibrary();
  const caseLib = buildCaseLibrary();
  const deadline = Date.now() + timeBudgetMs;
  // The kick loop below gets only PART of the total budget -- see
  // solveWingPairing5's matching comment: a residual that sporadically
  // improves by 1 without ever reaching a full solve keeps resetting
  // kicksSinceImprovement, so the stuck-kick early exit often doesn't fire
  // in time to leave the through-disruption attempt any real time budget.
  const kickDeadline = Date.now() + Math.floor(timeBudgetMs * 0.7);
  const working = cloneCubies(cubies);
  const moves: Move[] = [];
  const allKickMoves = allOuterMoves().flat();
  let lastYield = Date.now();

  // NOTE: drainHumanStyle already falls all the way through to
  // fiveByFiveEdges.ts's own bestFixOverall/tryEndgameMultiPly internally
  // (see its own comment) -- an earlier version of this function ALSO called
  // drainFixes right after, meaning to "double-check" with the proven
  // grinder, but drainFixes calls those exact same two functions itself.
  // Since drainHumanStyle only ever stops once both have already failed on
  // the current state, that second call was pure repeated work: it re-runs
  // the identical failed searches (including tryFixWing's own BFS) before
  // giving up again. Measured directly that removing it meaningfully speeds
  // up every kick iteration with zero change in what gets found, since
  // nothing the plain grinder can do was ever actually being skipped.
  drainHumanStyle(working, lib, flipLib, caseLib, moves, kickDeadline);

  // Kicking past a stuck residual has already been measured (see
  // fiveByFiveEdges.ts's own solveWingPairing5WithRetries) to often be a
  // genuine invariant of the scramble, not a matter of luck -- so once a
  // string of kicks in a row fails to beat the best residual seen so far,
  // further kicks are very unlikely to help and just burn the time budget.
  // Bailing out early here is what actually shortens the common "this
  // scramble can't fully pair" case; the maxKicks cap alone doesn't help
  // when the whole budget gets spent on kicks that were never going to work.
  const STUCK_KICK_LIMIT = 10;
  let bestResidual = wrongWingCount5(working);
  let kicksSinceImprovement = 0;

  for (
    let kick = 0;
    kick < maxKicks && wrongWingCount5(working) > 0 && kicksSinceImprovement < STUCK_KICK_LIMIT && Date.now() < kickDeadline;
    kick++
  ) {
    const relevantFaces = facesTouchingWrongWings(working);
    const kickMoves = allKickMoves.filter(([axis, layer]) => relevantFaces.has(faceForAxisValue(axis, layer)));
    const pool = kickMoves.length > 0 ? kickMoves : allKickMoves;
    const move = pool[Math.floor(Math.random() * pool.length)];
    applySeq(working, [move]);
    moves.push(move);
    drainHumanStyle(working, lib, flipLib, caseLib, moves, kickDeadline);

    const residual = wrongWingCount5(working);
    if (residual < bestResidual) {
      bestResidual = residual;
      kicksSinceImprovement = 0;
    } else {
      kicksSinceImprovement++;
    }

    if (Date.now() - lastYield > FRAME_YIELD_MS) {
      await yieldToEventLoop();
      lastYield = Date.now();
    }
  }

  // One last attempt, tried only once (not on every kick, see drainHumanStyle's
  // own comment on why): deliberately go through already-solved territory.
  // Measured directly that this resolves a real fraction (3 of 5 captured
  // stuck states) of the residuals the safe-only tiers above never reach,
  // though not all of them -- it narrows, but doesn't close, the parity gap.
  if (wrongWingCount5(working) > 0 && wrongWingCount5(working) <= ENDGAME_MULTIPLY_THRESHOLD && Date.now() < deadline) {
    const disruptionFix = tryEndgameThroughDisruption(working, lib, flipLib, deadline, undefined, undefined, caseLib);
    if (disruptionFix && disruptionFix.length > 0) {
      applySeq(working, disruptionFix);
      moves.push(...disruptionFix);
    }
  }

  for (let i = 0; i < cubies.length; i++) {
    cubies[i].position.copy(working[i].position);
    cubies[i].orientation.copy(working[i].orientation);
  }

  const patternLog = analyzeEdgeSlots(working).map((s) => ({ slot: s.slot, pattern: detectEdgeSlotPattern(s) }));
  return { solved: wrongWingCount5(working) === 0, movesApplied: moves.length, moves, patternLog };
}
