// --- CoverageMatrixV2 (Solver Primitive Set Completeness Validation Sprint
// v2, RQ-1/RQ-5) -------------------------------------------------------------
// Extends v1's own PrimitiveCoverageMatrix.ts (reused UNMODIFIED -- BASE/
// FLIP/CASE/PARITY/CCR, same COVERAGE_TEST_BUDGET_MS=5000 budget, same
// independent-of-Gate/independent-of-Recovery-stack methodology) with
// MIXED_COMMUTATOR as a 6th independently-tested primitive, via the SAME
// tryMixedCommutatorPrototype() the real production Gate C calls -- but
// tested here WITHOUT any Gate (unconditionally), exactly matching how CCR
// is already tested in v1 (testCcr calls runCCRPrototype directly, bypassing
// CCR's own production Gate). This isolates "what can the Primitive itself
// do" (RQ-1's intended decoupled-from-budget/Gate residual definition) from
// "what does the current Gate C actually admit" (which RecoveryAttemptProbe.ts
// measures separately, via the real unmodified generateRecoveryStrategies()).
//
// A "Residual" in this Sprint (v2) = unionCovered===false across ALL 6 of
// BASE/FLIP/CASE/PARITY/CCR/MIXED_COMMUTATOR -- directly comparable to v1's
// own 53/142 Residual count (identical methodology, +1 primitive column).
import { cloneCubies, type Cubie } from "../cubeState";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { WingLibrary } from "../fiveByFiveEdges";
import { buildCoverageRow, COVERAGE_TEST_BUDGET_MS, PRIMITIVE_ORDER, type CoveragePrimitiveName, type PrimitiveCoverageRow } from "../primitiveSetCompleteness/PrimitiveCoverageMatrix";
import { tryMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";

export { COVERAGE_TEST_BUDGET_MS };

export const PRIMITIVE_ORDER_V2 = [...PRIMITIVE_ORDER, "MIXED_COMMUTATOR"] as const;
export type CoveragePrimitiveNameV2 = (typeof PRIMITIVE_ORDER_V2)[number];

export interface PrimitiveCoverageRowV2 {
  label: string;
  succeededBy: Record<CoveragePrimitiveNameV2, boolean>;
  firstSuccessfulPrimitive: CoveragePrimitiveNameV2 | null;
  unionCovered: boolean;
}

function testMixed(cubies: readonly Cubie[], lib: WingLibrary, budgetMs: number): boolean {
  const clone = cloneCubies(cubies as Cubie[]);
  const deadline = Date.now() + budgetMs;
  const moves = tryMixedCommutatorPrototype(clone, lib, deadline);
  return !!moves && moves.length > 0;
}

export function buildCoverageRowV2(cubies: Cubie[], label: string, libs: ExecutorLibraries, budgetMs: number = COVERAGE_TEST_BUDGET_MS): PrimitiveCoverageRowV2 {
  const v1Row: PrimitiveCoverageRow = buildCoverageRow(cubies, label, libs, budgetMs);
  const succeededBy: Record<CoveragePrimitiveNameV2, boolean> = {
    ...(v1Row.succeededBy as Record<CoveragePrimitiveName, boolean>),
    MIXED_COMMUTATOR: testMixed(cubies, libs.lib, budgetMs),
  };
  const firstSuccessfulPrimitive = PRIMITIVE_ORDER_V2.find((p) => succeededBy[p]) ?? null;
  const unionCovered = firstSuccessfulPrimitive !== null;
  return { label, succeededBy, firstSuccessfulPrimitive, unionCovered };
}

export interface PrimitiveCoverageSummaryV2 {
  totalCases: number;
  perPrimitiveSuccessCount: Record<CoveragePrimitiveNameV2, number>;
  unionCoveredCount: number;
  residualCount: number;
}

export function summarizeCoverageV2(rows: PrimitiveCoverageRowV2[]): PrimitiveCoverageSummaryV2 {
  const perPrimitiveSuccessCount = { BASE: 0, FLIP: 0, CASE: 0, PARITY: 0, CCR: 0, MIXED_COMMUTATOR: 0 } as Record<CoveragePrimitiveNameV2, number>;
  for (const r of rows) for (const p of PRIMITIVE_ORDER_V2) if (r.succeededBy[p]) perPrimitiveSuccessCount[p]++;
  const unionCoveredCount = rows.filter((r) => r.unionCovered).length;
  return {
    totalCases: rows.length,
    perPrimitiveSuccessCount,
    unionCoveredCount,
    residualCount: rows.length - unionCoveredCount,
  };
}
