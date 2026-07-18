// --- ShapeLookupTable (Solver v2 Primitive Prototype Sprint v4) ----------
// STEP 3: aggregates ShapeDatabaseRow[] into "Shape -> recommended
// Primitive". For each distinct Shape Key, whichever existing Primitive
// improved WrongWing on the LARGEST share of that shape's OTHER member
// Replays is recommended for that shape.
//
// Honesty note (important, and disclosed everywhere this table is built):
// this Sprint's whole dataset is the same 75 real Replays used to build
// the CycleChase/BP-1/BP-2/BP-3 track record AND to test BP-4's own
// generalization. Recommending "the primitive that already worked on this
// exact Replay" would be pure data leakage -- every group would trivially
// "solve" whatever any Primitive ever solved. `excludeHash` performs
// leave-one-out: when a specific Replay is being tested, its own row is
// removed from evidence BEFORE the recommendation is computed, so the
// recommendation for that Replay only ever comes from OTHER Replays that
// happen to share its exact Shape Key -- a standard, honest way to
// cross-validate on a small fixed dataset without a separate holdout set.
import type { PrimitiveName, ShapeDatabaseRow } from "./ShapeDatabaseBuilder";
import { PRIMITIVE_NAMES } from "./ShapeDatabaseBuilder";

export interface ShapeLookupEntry {
  shapeKey: string;
  memberCount: number;
  recommendedPrimitive: PrimitiveName | null; // null if no member of this shape group was ever improved by any Primitive
  perPrimitiveImprovedCount: Record<PrimitiveName, number>;
}

// Deterministic tie-break order when two Primitives tie on improved-count
// for a shape: ranked by this whole research track's own measured overall
// strength (BP-1 strongest across all three prior Sprints' benchmarks,
// then CycleChase, then BP-3, then BP-2 weakest) -- grounded in real prior
// results, not arbitrary. Matches PRIMITIVE_NAMES's own declared order.
const TIE_BREAK_ORDER: readonly PrimitiveName[] = PRIMITIVE_NAMES;

export function buildLookupTable(rows: readonly ShapeDatabaseRow[], excludeHash?: string): Map<string, ShapeLookupEntry> {
  const training = excludeHash ? rows.filter((r) => r.hash !== excludeHash) : rows;

  const byShape = new Map<string, ShapeDatabaseRow[]>();
  for (const row of training) {
    const list = byShape.get(row.shapeKey) ?? [];
    list.push(row);
    byShape.set(row.shapeKey, list);
  }

  const table = new Map<string, ShapeLookupEntry>();
  for (const [shapeKey, members] of byShape) {
    const perPrimitiveImprovedCount: Record<PrimitiveName, number> = { BP1: 0, CycleChase: 0, BP3: 0, BP2: 0 };
    for (const member of members) {
      for (const name of PRIMITIVE_NAMES) {
        if (member.outcomes[name].improved) perPrimitiveImprovedCount[name]++;
      }
    }

    let recommendedPrimitive: PrimitiveName | null = null;
    let bestCount = 0;
    for (const name of TIE_BREAK_ORDER) {
      const count = perPrimitiveImprovedCount[name];
      if (count > bestCount) {
        bestCount = count;
        recommendedPrimitive = name;
      }
    }

    table.set(shapeKey, { shapeKey, memberCount: members.length, recommendedPrimitive, perPrimitiveImprovedCount });
  }

  return table;
}
