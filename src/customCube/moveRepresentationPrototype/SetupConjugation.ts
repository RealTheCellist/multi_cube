// --- SetupConjugation (Move Representation Prototype Sprint v1, "Setup
// 생성, Undo Setup 생성") -----------------------------------------------------
// Wraps a Core move sequence in Setup -> Core -> Undo-Setup, exactly the
// conjugation composition solverV2PrototypeBP2/ParityEntrySelector.ts
// already established for PARITY_ALG (reusing the SAME exported building
// blocks: buildAtomicFragments() for the 48 fixed, deterministic setup
// candidates, invertSequence() for the exact undo-setup half). "No
// setup" (identity) is included as one of the tried options, so a
// worse-with-setup outcome never forces a setup to be used.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, slotKey, type Move } from "../fiveByFiveEdges";
import { buildAtomicFragments, type MoveFragment } from "../primitiveDiscovery/PrimitiveSearch";
import { invertSequence } from "../primitiveDiscovery/PrimitiveEvaluator";

const IDENTITY_FRAGMENT: MoveFragment = { type: "quarter", moves: [], label: "IDENTITY(no setup)" };

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

export interface ConjugatedResult {
  moves: Move[];
  setupLabel: string;
  wrongWingAfter: number;
  affectedWingCount: number;
}

/**
 * Tries the Core sequence bare (IDENTITY setup) plus conjugated by each of
 * the 48 atomic fragments, and returns whichever composition yields the
 * lowest wrongWingCount (primary) then lowest affectedWingCount
 * (secondary, this Prototype's own low-footprint objective) -- same
 * "simulate every one, keep the best-scoring" discipline
 * ParityEntrySelector.ts already established, just applied to this
 * Sprint's own Core sequence instead of PARITY_ALG.
 */
export function findBestConjugation(cubies: Cubie[], coreMoves: Move[], deadline: number): ConjugatedResult | null {
  const fragments: MoveFragment[] = [IDENTITY_FRAGMENT, ...buildAtomicFragments()];
  let best: ConjugatedResult | null = null;

  for (const fragment of fragments) {
    if (Date.now() > deadline) break;
    const moves: Move[] = fragment.moves.length > 0 ? [...fragment.moves, ...coreMoves, ...invertSequence(fragment.moves)] : [...coreMoves];

    const clone = cloneCubies(cubies);
    applySeq(clone, moves);
    const wrongWingAfter = wrongWingCount5(clone);
    const affectedWingCount = countAffectedWings(cubies, clone);

    if (!best || wrongWingAfter < best.wrongWingAfter || (wrongWingAfter === best.wrongWingAfter && affectedWingCount < best.affectedWingCount)) {
      best = { moves, setupLabel: fragment.label, wrongWingAfter, affectedWingCount };
    }
  }

  return best;
}
