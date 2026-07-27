// --- PrimitiveCoverageMatrix (Solver Primitive Set Completeness Validation
// Sprint v1, RQ-1/RQ-2, Required Analysis #1) --------------------------------
// Tests each of the Directive's named 5 primitives (BASE/FLIP/CASE/PARITY/
// CCR) independently against a scratch clone of every one of the 142 Hole
// Dataset cases, at a single uniform extended budget (5000ms -- this whole
// research arc's own established "extended budget" convention, e.g.
// NecessityGroundTruth.ts's EXTENDED_BUDGET_MS). CCR here means exactly
// what production's own genCCR calls -- runCCRPrototype(..., "singleCycle")
// directly -- not the full Recovery generator stack (DISRUPT/SETUP/REPAIR),
// since Recovery Necessity Validation Sprint v1 already found those
// contribute ~nothing and CCR Completeness Validation Sprint v1 already
// isolated CCR as the one mechanism worth measuring on its own terms.
import { cloneCubies, type Cubie } from "../cubeState";
import { testPrimitiveCapability } from "../capabilityAnalysis/primitiveCapabilityTester";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";

export const COVERAGE_TEST_BUDGET_MS = 5000;

// Production pipeline order: BASE -> FLIP -> CASE -> PARITY run inside the
// ordinary wing-pairing loop before Recovery/CCR ever gets a turn -- this
// is also exactly the order the Directive's own Union Capability Map
// requests (BASE -> +FLIP -> +CASE -> +PARITY -> +CCR).
export const PRIMITIVE_ORDER = ["BASE", "FLIP", "CASE", "PARITY", "CCR"] as const;
export type CoveragePrimitiveName = (typeof PRIMITIVE_ORDER)[number];

export interface PrimitiveCoverageRow {
  label: string;
  succeededBy: Record<CoveragePrimitiveName, boolean>;
  firstSuccessfulPrimitive: CoveragePrimitiveName | null; // per PRIMITIVE_ORDER
  unionCovered: boolean; // true if ANY of the 5 succeeded
}

function testCcr(cubies: readonly Cubie[], libs: ExecutorLibraries, budgetMs: number): boolean {
  const clone = cloneCubies(cubies as Cubie[]);
  const deadline = Date.now() + budgetMs;
  const result = runCCRPrototype(clone, libs.lib, deadline, "singleCycle");
  return !!result.moves;
}

export function buildCoverageRow(cubies: Cubie[], label: string, libs: ExecutorLibraries, budgetMs: number = COVERAGE_TEST_BUDGET_MS): PrimitiveCoverageRow {
  const succeededBy: Record<CoveragePrimitiveName, boolean> = {
    BASE: testPrimitiveCapability(cubies, "BASE", libs, budgetMs).succeeded,
    FLIP: testPrimitiveCapability(cubies, "FLIP", libs, budgetMs).succeeded,
    CASE: testPrimitiveCapability(cubies, "CASE", libs, budgetMs).succeeded,
    PARITY: testPrimitiveCapability(cubies, "PARITY", libs, budgetMs).succeeded,
    CCR: testCcr(cubies, libs, budgetMs),
  };
  const firstSuccessfulPrimitive = PRIMITIVE_ORDER.find((p) => succeededBy[p]) ?? null;
  const unionCovered = firstSuccessfulPrimitive !== null;
  return { label, succeededBy, firstSuccessfulPrimitive, unionCovered };
}

export interface PrimitiveCoverageSummary {
  totalCases: number;
  perPrimitiveSuccessCount: Record<CoveragePrimitiveName, number>;
  unionCoveredCount: number;
  residualCount: number; // no primitive succeeded -- a genuine hole even at extended budget
}

export function summarizeCoverage(rows: PrimitiveCoverageRow[]): PrimitiveCoverageSummary {
  const perPrimitiveSuccessCount: Record<CoveragePrimitiveName, number> = { BASE: 0, FLIP: 0, CASE: 0, PARITY: 0, CCR: 0 };
  for (const r of rows) for (const p of PRIMITIVE_ORDER) if (r.succeededBy[p]) perPrimitiveSuccessCount[p]++;
  const unionCoveredCount = rows.filter((r) => r.unionCovered).length;
  return {
    totalCases: rows.length,
    perPrimitiveSuccessCount,
    unionCoveredCount,
    residualCount: rows.length - unionCoveredCount,
  };
}
