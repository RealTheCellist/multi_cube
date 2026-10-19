import { applyRawQuarterTurn, cloneCubies, type Cubie } from "./cubeState";
import { solveTrueCenterPositions5, wrongCenterCount, type Move } from "./fiveByFiveCenters";
import { solveCentersByCommutator5 } from "./fiveByFiveCentersCommutator";
import { wrongWingCount5 } from "./fiveByFiveEdges";
import { solveWingsByCommutator5, WING_MOVES } from "./fiveByFiveWings";

// Inner-layer quarter turns (layers +-1) that change the parity of the wing target permutation
// (found by trying every move on random scrambles: always exactly these twelve). A 3-cycle sort
// reaches only even permutations, so when the target is odd one of these is played first and the
// centers are re-solved afterwards.
const PARITY_FIXERS: readonly number[] = [2, 3, 4, 5, 10, 11, 12, 13, 18, 19, 20, 21];

function applyAll(cubies: Cubie[], moves: readonly Move[]): void {
  for (const [axis, layer, sign] of moves) applyRawQuarterTurn(cubies, axis, layer, sign);
}

/** Cancels adjacent inverse quarter turns left where two parts of the plan meet. */
function simplify(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last[0] === m[0] && last[1] === m[1] && last[2] === -m[2]) out.pop();
    else out.push(m);
  }
  return out;
}

/**
 * Whole pre-3x3 plan for a 5x5x5: true centers, X/T-centers, then wing pairing (with a parity fix and a
 * center re-solve in between when the wing target is odd). Returns null if it cannot reach a state with every
 * center solved and every wing paired. Does not mutate `cubies`.
 */
export function planPairing5(cubies: readonly Cubie[]): Move[] | null {
  const work = cloneCubies(cubies as Cubie[]);
  const plan: Move[] = [];
  const trueCenters = solveTrueCenterPositions5(work);
  plan.push(...trueCenters.moves);
  const centers = solveCentersByCommutator5(work);
  applyAll(work, centers);
  plan.push(...centers);

  let wings = solveWingsByCommutator5(work);
  if (!wings) {
    for (const f of PARITY_FIXERS) {
      const trial = cloneCubies(work);
      const fix = WING_MOVES[f];
      applyAll(trial, [fix]);
      const recenter = solveCentersByCommutator5(trial);
      applyAll(trial, recenter);
      const afterFix = solveWingsByCommutator5(trial);
      if (!afterFix) continue;
      plan.push(fix, ...recenter);
      applyAll(work, [fix, ...recenter]);
      wings = afterFix;
      break;
    }
  }
  if (!wings) return null;
  applyAll(work, wings);
  plan.push(...wings);
  if (wrongCenterCount(work) !== 0 || wrongWingCount5(work) !== 0) return null;
  return simplify(plan);
}
