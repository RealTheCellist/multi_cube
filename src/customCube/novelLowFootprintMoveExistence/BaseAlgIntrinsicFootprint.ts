// --- BaseAlgIntrinsicFootprint (Novel Low-Footprint Move Existence
// Validation Sprint v1, RQ-3 groundwork) -------------------------------------
// Measures the ONE currently-known "clean isolated swap" building block
// (BASE_ALG) -- plus FLIP_ALG/PARITY_ALG for completeness -- applied
// standalone from a solved reference, to get its REAL intrinsic
// affectedWingCount (how many Cubie slotKeys change) and move length. This
// is the hard empirical "atomic disruption unit" every library entry in
// enumerateWingCandidates() inherits: no composition built from these can
// ever have LESS footprint than what its own components carry, only
// (at best) cancel some of it via genuine bracket-commutator structure.
import { buildSolvedCube, cloneCubies, type Cubie } from "../cubeState";
import { applySeq, slotKey, BASE_ALG, FLIP_ALG, PARITY_ALG, type Move } from "../fiveByFiveEdges";

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

export interface IntrinsicFootprint {
  name: string;
  moveLength: number;
  affectedWingCount: number;
}

export function measureIntrinsicFootprints(): IntrinsicFootprint[] {
  const solved = buildSolvedCube(5);
  const patterns: { name: string; seq: readonly Move[] }[] = [
    { name: "BASE_ALG", seq: BASE_ALG },
    { name: "FLIP_ALG", seq: FLIP_ALG },
    { name: "PARITY_ALG", seq: PARITY_ALG },
  ];
  return patterns.map(({ name, seq }) => {
    const after = cloneCubies(solved);
    applySeq(after, seq);
    return { name, moveLength: seq.length, affectedWingCount: countAffectedWings(solved, after) };
  });
}
