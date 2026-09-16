// N=6 (Royal Pyraminx) solver, Phase 2 -- baseline. Meet-in-the-middle
// search over the raw 40-move set, exactly the same algorithm shape as
// customTetra/masterTetraminxSolver.ts's meetInMiddleSolve (which this
// module still doesn't import, per Phase 1's independence requirement --
// the shape is reused, not the code).
//
// This is a FIRST PASS, not the final solver: it searches the combined
// state (tips+edges+axial+centers together) with no subgroup decomposition
// or heuristic pruning. N=5 needed that kind of decomposition (axial+center
// first via a safe-generator split, then edges via EDGE_SAFE_GENERATORS) to
// get real scrambles under control, and N=6's piece counts are larger in
// every orbit that matters for search cost (60 axial vs 40, 24 edges vs 18
// physical edge pieces) -- so the numbers this produces are the baseline to
// decide how much of that same investigation N=6 needs, not a claim that
// this is fast enough to ship.
//
// Measured (real browser, meet-in-the-middle over ALL 40 moves at once, no
// decomposition): random scrambles up to 12 moves solve in well under 10s
// (4mv=3.9ms, 6mv=0.9ms, 8mv=11ms, 10mv=2.1s, 12mv=9.7s), but cost explodes
// past that -- a 15-move scramble did not finish within 180s. Real N=6
// scrambles (like N=5's, typically 15-30 moves) are not solvable this way;
// decomposition work (analogous to N=5's) is the next step, tracked
// separately.
import { applyRoyalMove, ALL_ROYAL_MOVE_NAMES } from "./royalPyraminxMoves";
import { createSolvedRoyalState, isSolvedRoyal, type RoyalPyraminxState } from "./royalPyraminxState";

function invertMoveName(move: string): string {
  return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

function stateKey(s: RoyalPyraminxState): string {
  const chars: number[] = [];
  for (const arr of [s.tips, s.tipOri, s.edges, s.edgeOri, s.axial, s.centers]) {
    for (let i = 0; i < arr.length; i++) chars.push(arr[i] + 32);
  }
  return String.fromCharCode(...chars);
}

interface Entry {
  state: RoyalPyraminxState;
  move: string | null;
  parent: Entry | null;
}

function pathFromEntry(entry: Entry): string[] {
  const path: string[] = [];
  let cur: Entry | null = entry;
  while (cur && cur.move !== null) {
    path.push(cur.move);
    cur = cur.parent;
  }
  path.reverse();
  return path;
}

/**
 * Meet-in-the-middle search from `start` to solved, over all 40 raw moves,
 * no decomposition. Returns a move sequence that solves `start`, or null if
 * none was found within `maxDepthEachSide`/`maxStates`. See this file's own
 * comment for why this is a baseline, not the final solver.
 */
export function solveRoyalBaseline(start: RoyalPyraminxState, maxDepthEachSide: number, maxStates: number): string[] | null {
  if (isSolvedRoyal(start)) return [];

  const fwdVisited = new Map<string, Entry>();
  const startEntry: Entry = { state: start, move: null, parent: null };
  fwdVisited.set(stateKey(start), startEntry);
  let fwdFrontier: Entry[] = [startEntry];

  const solved = createSolvedRoyalState();
  const bwdVisited = new Map<string, Entry>();
  const solvedEntry: Entry = { state: solved, move: null, parent: null };
  bwdVisited.set(stateKey(solved), solvedEntry);
  let bwdFrontier: Entry[] = [solvedEntry];

  const totalVisited = () => fwdVisited.size + bwdVisited.size;
  const buildPath = (fwdEntry: Entry, bwdEntry: Entry): string[] => [...pathFromEntry(fwdEntry), ...pathFromEntry(bwdEntry).reverse().map(invertMoveName)];

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd: Entry[] = [];
    for (const parentEntry of fwdFrontier) {
      for (const move of ALL_ROYAL_MOVE_NAMES) {
        const nextState = applyRoyalMove(parentEntry.state, move);
        const k = stateKey(nextState);
        if (!fwdVisited.has(k)) {
          const entry: Entry = { state: nextState, move, parent: parentEntry };
          fwdVisited.set(k, entry);
          newFwd.push(entry);
          if (totalVisited() > maxStates) return null;
          const hit = bwdVisited.get(k);
          if (hit) return buildPath(entry, hit);
        }
      }
    }
    fwdFrontier = newFwd;

    const newBwd: Entry[] = [];
    for (const parentEntry of bwdFrontier) {
      for (const move of ALL_ROYAL_MOVE_NAMES) {
        const nextState = applyRoyalMove(parentEntry.state, move);
        const k = stateKey(nextState);
        if (!bwdVisited.has(k)) {
          const entry: Entry = { state: nextState, move, parent: parentEntry };
          bwdVisited.set(k, entry);
          newBwd.push(entry);
          if (totalVisited() > maxStates) return null;
          const hit = fwdVisited.get(k);
          if (hit) return buildPath(hit, entry);
        }
      }
    }
    bwdFrontier = newBwd;
  }
  return null;
}
