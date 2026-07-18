// --- RepresentationPrimitiveSelector (Solver Representation Prototype
// Sprint v1) --------------------------------------------------------------
// STEP3: builds Representation-keyed PRIORITY POLICIES over the 5 allowed
// existing Primitives (BASE/FLIP/CASE/PARITY/BP-1 -- no RECOVERY/
// CYCLECHASE/BP-2/BP-3 per this Sprint's own scope, and no new Primitive).
// "우선순위 결정" is operationalized as: for each Representation group,
// rank the 5 primitives by their real single-shot success rate among OTHER
// replays sharing that group's key (leave-one-out, same discipline
// solverV2PrototypeBP4/CycleShapeResolver.ts's own excludeHash already
// established for this project) -- a genuinely measured, not guessed,
// priority order.
//
// `tryPrimitiveOn` re-implements each primitive's existing dispatch logic
// exactly as capabilityAnalysis/primitiveCapabilityTester.ts's own
// testPrimitiveCapability already does per-branch (BASE/FLIP/CASE/PARITY)
// plus BP-1's own established net-improvement-gated usage pattern (see
// solverV2PrototypeBP3/ReplayBenchmark.ts's runBoundedResolverOn) -- but,
// unlike testPrimitiveCapability, operates on a CALLER-OWNED clone so a
// multi-round orchestration can keep mutating the SAME state across
// primitives (testPrimitiveCapability clones internally and never exposes
// the mutated result, so it cannot be reused here). This is a disclosed
// duplication of already-existing logic, not a new Primitive -- exactly the
// same "recompute a private helper locally" pattern
// solverRepresentationReview/CapabilityFingerprintReview.ts already used.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, bestFixOverall, tryEndgameMultiPly, tryExactCaseMatch, tryFixWing, tryFlipWingsInPlace, wrongWingCount5, wrongWings5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";

export type AllowedPrimitive = "BASE" | "FLIP" | "CASE" | "PARITY" | "BP1";
export const ALLOWED_PRIMITIVES: readonly AllowedPrimitive[] = ["BASE", "FLIP", "CASE", "PARITY", "BP1"];

// The existing/canonical order these primitives are already tried in
// throughout this project (capabilityAnalysis/primitiveCapabilityTester.ts's
// own ALL_PRIMITIVES = BASE/FLIP/CASE/PARITY, BP-1 appended last as the
// newest/most expensive addition). Used both as the "기존 Solver" baseline
// condition (no Representation-based reordering) AND as the tie-break order
// when two primitives share an equal group success rate.
export const FIXED_BASELINE_ORDER: readonly AllowedPrimitive[] = ["BASE", "FLIP", "CASE", "PARITY", "BP1"];

export function tryPrimitiveOn(primitive: AllowedPrimitive, clone: Cubie[], libs: ExecutorLibraries, deadline: number): boolean {
  if (primitive === "BASE") {
    for (const w of wrongWings5(clone)) {
      const fix = tryFixWing(clone, w, libs.lib, deadline);
      if (fix && fix.length > 0) {
        applySeq(clone, fix);
        return true;
      }
    }
    return false;
  }
  if (primitive === "FLIP") {
    for (const w of wrongWings5(clone)) {
      const fix = tryFlipWingsInPlace(clone, w, libs.flipLib, wrongWingCount5(clone));
      if (fix && fix.length > 0) {
        applySeq(clone, fix);
        return true;
      }
    }
    return false;
  }
  if (primitive === "CASE") {
    const fix = tryExactCaseMatch(clone, libs.caseLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(clone, fix);
      return true;
    }
    return false;
  }
  if (primitive === "PARITY") {
    let fix = bestFixOverall(clone, libs.lib, libs.flipLib, deadline);
    if (!fix || fix.length === 0) fix = tryEndgameMultiPly(clone, libs.lib, libs.flipLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(clone, fix);
      return true;
    }
    return false;
  }
  // BP1 -- net-improvement gated, matching every other caller of
  // tryBoundedMultiCycleResolver in this project (it returns an unapplied
  // candidate; a caller always checks wrongWingCount decreased before
  // accepting it).
  const before = wrongWingCount5(clone);
  const fix = tryBoundedMultiCycleResolver(clone, libs.lib, deadline);
  if (fix && fix.length > 0) {
    applySeq(clone, fix);
    return wrongWingCount5(clone) < before;
  }
  return false;
}

export function singleShotTest(primitive: AllowedPrimitive, cubies: readonly Cubie[], libs: ExecutorLibraries, deadline: number): boolean {
  const clone = cloneCubies(cubies as Cubie[]);
  return tryPrimitiveOn(primitive, clone, libs, deadline);
}

export function testAllAllowedSingleShot(cubies: readonly Cubie[], libs: ExecutorLibraries, deadlineMs: number): Record<AllowedPrimitive, boolean> {
  const result = {} as Record<AllowedPrimitive, boolean>;
  for (const p of ALLOWED_PRIMITIVES) result[p] = singleShotTest(p, cubies, libs, Date.now() + deadlineMs);
  return result;
}

type Tally = Record<AllowedPrimitive, { successes: number; total: number }>;

function freshTally(): Tally {
  return Object.fromEntries(ALLOWED_PRIMITIVES.map((p) => [p, { successes: 0, total: 0 }])) as Tally;
}

function rankByRate(tally: Tally): AllowedPrimitive[] {
  return [...ALLOWED_PRIMITIVES].sort((a, b) => {
    const rateA = tally[a].total ? tally[a].successes / tally[a].total : 0;
    const rateB = tally[b].total ? tally[b].successes / tally[b].total : 0;
    if (rateB !== rateA) return rateB - rateA;
    return FIXED_BASELINE_ORDER.indexOf(a) - FIXED_BASELINE_ORDER.indexOf(b);
  });
}

export interface PriorityPolicy {
  representationName: string;
  groupTally: Map<string, Tally>;
  globalOrder: AllowedPrimitive[]; // fallback for a key never observed in the corpus
}

export function buildPriorityPolicy(representationName: string, keyOf: (hash: string) => string, singleShot: ReadonlyMap<string, Record<AllowedPrimitive, boolean>>): PriorityPolicy {
  const groupTally = new Map<string, Tally>();
  const globalTally = freshTally();

  for (const [hash, result] of singleShot.entries()) {
    const key = keyOf(hash);
    if (!groupTally.has(key)) groupTally.set(key, freshTally());
    const tally = groupTally.get(key)!;
    for (const p of ALLOWED_PRIMITIVES) {
      tally[p].total++;
      globalTally[p].total++;
      if (result[p]) {
        tally[p].successes++;
        globalTally[p].successes++;
      }
    }
  }

  return { representationName, groupTally, globalOrder: rankByRate(globalTally) };
}

// Leave-one-out priority lookup: subtracts `selfHash`'s own single-shot
// vote from its group's tally before ranking, so a replay's priority is
// never learned from itself.
export function priorityFor(policy: PriorityPolicy, key: string, selfHash: string, singleShot: ReadonlyMap<string, Record<AllowedPrimitive, boolean>>): AllowedPrimitive[] {
  const tally = policy.groupTally.get(key);
  if (!tally) return policy.globalOrder;

  const self = singleShot.get(selfHash);
  if (!self) return rankByRate(tally);

  const adjusted = freshTally();
  let adjustedTotal = 0;
  for (const p of ALLOWED_PRIMITIVES) {
    adjusted[p] = { successes: tally[p].successes - (self[p] ? 1 : 0), total: tally[p].total - 1 };
    adjustedTotal += adjusted[p].total;
  }
  if (adjustedTotal <= 0) return policy.globalOrder; // group had only this replay -- nothing left to learn from
  return rankByRate(adjusted);
}
