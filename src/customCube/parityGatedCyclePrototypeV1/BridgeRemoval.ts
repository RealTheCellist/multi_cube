// --- BridgeRemoval (Parity-Gated Cycle Prototype Sprint v1, STEP1
// "bridge 제거") ------------------------------------------------------------
// Best-effort cleanup pass after the bridge+traversal steps -- same
// discipline solverPrimitivePrototype/ConflictDominantSacrificePrototype.ts's
// own "RESTORE (best-effort)" step already established: try tryFixWing
// (fiveByFiveEdges.ts, unmodified) exactly once on whatever wrong wing is
// left (which may be the bridge wing itself, now sitting in a slot it
// doesn't belong in), only keeping the attempt if it net-improves.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, tryFixWing, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";

export function bestEffortCleanup(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] {
  const wrong = wrongWings5(cubies);
  if (wrong.length === 0) return [];

  const before = wrongWingCount5(cubies);
  const fix = tryFixWing(cloneCubies(cubies), wrong[0], lib, deadline);
  if (!fix) return [];

  const after = cloneCubies(cubies);
  applySeq(after, fix);
  return wrongWingCount5(after) < before ? fix : [];
}
