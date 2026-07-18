// --- CycleShapeResolver (Solver v2 Primitive Prototype Sprint v4) --------
// STEP 4: "새 Replay가 들어오면 Shape만 조회하여 추천 Primitive Sequence를
// 적용한다. 런타임 탐색은 수행하지 않는다." -- computes the current state's
// Shape Key, looks up the ONE recommended existing Primitive for that shape
// (ShapeLookupTable.ts), and calls that real Primitive exactly once. If it
// declines (returns null, e.g. its own internal Deferred Validation
// rejects), BP-4 does NOT fall back to trying another Primitive -- that
// would be runtime search, which this Blueprint specifically forgoes.
//
// "Primitive Sequence" here means WHICH existing Primitive function to
// invoke, not a literal cached Move[] list: two Replays with the same
// Shape Key can still have completely different colors sitting in those
// slots, so a literally-cached move sequence from one would be wrong on
// the other. What IS precomputed and reused offline is the ROUTING
// decision (Shape -> best Primitive); the actual moves are still produced
// live by that Primitive's own real, already-validated logic.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { tryCycleChase } from "../primitivePrototype/CycleChasePrototype";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";
import { computeCycleShape } from "./CycleShapeHasher";
import type { ShapeDatabaseRow, PrimitiveName } from "./ShapeDatabaseBuilder";
import { buildLookupTable } from "./ShapeLookupTable";

function dispatch(name: PrimitiveName, cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  switch (name) {
    case "BP1":
      return tryBoundedMultiCycleResolver(cloneCubies(cubies), lib, deadline);
    case "CycleChase":
      return tryCycleChase(cloneCubies(cubies), lib, deadline);
    case "BP3":
      return tryNonParityStructuralFix(cloneCubies(cubies), lib, deadline);
    case "BP2":
      return tryParityAwareCycleBreaker(cloneCubies(cubies), lib, deadline);
  }
}

/**
 * `rows` is the offline-built Shape Database (ShapeDatabaseBuilder.ts,
 * built once from all real Replays). `excludeHash`, when given, performs
 * leave-one-out so this Replay's own outcome can never leak into its own
 * recommendation -- see ShapeLookupTable.ts's own header for why this
 * matters.
 */
export function tryCycleShapeLookup(
  cubies: Cubie[],
  lib: WingLibrary,
  deadline: number,
  rows: readonly ShapeDatabaseRow[],
  excludeHash?: string,
): Move[] | null {
  const shape = computeCycleShape(cubies);
  const table = buildLookupTable(rows, excludeHash);
  const entry = table.get(shape.shapeKey);
  if (!entry || !entry.recommendedPrimitive) return null; // no evidence for this shape -- decline, no search

  return dispatch(entry.recommendedPrimitive, cubies, lib, deadline);
}
