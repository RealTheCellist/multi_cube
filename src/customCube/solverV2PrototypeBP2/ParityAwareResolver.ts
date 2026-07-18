// --- ParityAwareResolver (Solver v2 Primitive Prototype Sprint v2) --------
// STEP 3: ties Parity Structure Analysis + Entry Selection + Deferred
// Validation into one callable Primitive, matching CycleChasePrototype.ts's
// and BoundedResolver's own `(cubies, lib, deadline) -> Move[] | null`
// shape exactly, so ReplayBenchmark.ts can compare all three as drop-in
// alternatives.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { analyzeParityStructure } from "./ParityStructureAnalyzer";
import { selectBestParityEntry } from "./ParityEntrySelector";

/**
 * Only activates on states that actually show Parity (spec's own scope:
 * this Blueprint is specifically about Parity-Cycle interaction, not a
 * general-purpose replacement for BASE/CycleChase). Selects the single
 * best-scoring conjugated-PARITY_ALG entry (ParityEntrySelector.ts), applies
 * it for real, and ONLY THEN checks whether it net-improved WrongWing vs
 * the ORIGINAL starting state (Deferred Validation -- no per-step gate,
 * since there IS no multi-step chain here, just one atomic application
 * judged once).
 */
// `_lib` is accepted-but-unused, purely so this matches CycleChasePrototype.ts's
// and BoundedResolver's own `(cubies, lib, deadline) -> Move[] | null` shape
// for ReplayBenchmark.ts's drop-in comparison -- this Blueprint's entries
// are built entirely from PARITY_ALG + atomic setup fragments, no
// WingLibrary lookup is needed.
export function tryParityAwareCycleBreaker(cubies: Cubie[], _lib: WingLibrary, deadline: number): Move[] | null {
  const before = wrongWingCount5(cubies);
  const structure = analyzeParityStructure(cubies);
  if (!structure.hasParity) return null;

  const bestEntry = selectBestParityEntry(cubies, structure.cycleLength, deadline);
  if (!bestEntry) return null;

  const clone = cloneCubies(cubies);
  applySeq(clone, bestEntry.moves);
  if (wrongWingCount5(clone) >= before) return null; // Deferred Validation

  return bestEntry.moves;
}
