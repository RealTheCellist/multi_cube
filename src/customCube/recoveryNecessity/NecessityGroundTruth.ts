// --- NecessityGroundTruth (Recovery Necessity Validation Sprint v1, STEP1)
// -------------------------------------------------------------------------
// Establishes, for every case in the 142-case Hole Dataset, whether
// Recovery is genuinely the ONLY path to progress (requiresRecovery),
// merely one of several working paths (recoveryOptional), or not needed at
// all (the main pipeline -- BASE/FLIP/CASE/PARITY -- already covers it).
//
// Deliberately re-runs a FRESH, uniform extended-budget (5000ms, 12.5x the
// capability tester's 400ms baseline) capability test across the WHOLE
// population that failed at baseline, rather than merging the partial
// extended-budget data State Taxonomy Sprint v2 already collected --
// that data has inconsistent coverage (Cycle Isolation: all 56 tested
// unconditionally; Parity-Gated: only the baseline-failed subset tested;
// Conflict Dominant: never extended-tested at all, since that Sprint's
// STEP2 was cause-vs-effect analysis, not a capability retest). A single
// uniform pass here avoids subtly mismatched methodology across taxonomy
// classes for this Sprint's population-wide necessity claim.
import { testAllCapabilities } from "../capabilityAnalysis/primitiveCapabilityTester";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import type { PrimitiveTestResult } from "../capabilityAnalysis/capabilityTypes";

export const EXTENDED_BUDGET_MS = 5000;
const NON_RECOVERY_PRIMITIVES = ["BASE", "FLIP", "CASE", "PARITY"] as const;

export interface NecessityGroundTruthRow {
  label: string;
  baselineNonRecoverySucceeded: boolean; // any of BASE/FLIP/CASE/PARITY succeeded at the tester's 400ms default
  extendedTestRun: boolean; // false if baseline already succeeded (extended test is moot, skipped)
  extendedNonRecoverySucceeded: boolean;
  extendedRecoverySucceeded: boolean;
  reachableWithoutRecovery: boolean;
  reachableWithRecovery: boolean;
  requiresRecovery: boolean; // Recovery is the ONLY path found (baseline+extended, all budgets)
  recoveryOptional: boolean; // Recovery succeeds AND at least one non-recovery primitive also succeeds
}

export async function computeGroundTruthForHole(hole: HoleCase, libs: ExecutorLibraries): Promise<NecessityGroundTruthRow> {
  const baselineNonRecoverySucceeded = hole.capabilityResults.some((r) => (NON_RECOVERY_PRIMITIVES as readonly string[]).includes(r.primitive) && r.succeeded);

  if (baselineNonRecoverySucceeded) {
    return {
      label: hole.label,
      baselineNonRecoverySucceeded: true,
      extendedTestRun: false,
      extendedNonRecoverySucceeded: false,
      extendedRecoverySucceeded: false,
      reachableWithoutRecovery: true,
      reachableWithRecovery: true,
      requiresRecovery: false,
      recoveryOptional: false,
    };
  }

  const extended: PrimitiveTestResult[] = testAllCapabilities(hole.cubies, libs, EXTENDED_BUDGET_MS);
  const extendedNonRecoverySucceeded = extended.some((r) => (NON_RECOVERY_PRIMITIVES as readonly string[]).includes(r.primitive) && r.succeeded);
  const extendedRecoverySucceeded = !!extended.find((r) => r.primitive === "RECOVERY")?.succeeded;

  const reachableWithoutRecovery = extendedNonRecoverySucceeded;
  const reachableWithRecovery = reachableWithoutRecovery || extendedRecoverySucceeded;
  const requiresRecovery = !reachableWithoutRecovery && extendedRecoverySucceeded;
  const recoveryOptional = reachableWithoutRecovery && extendedRecoverySucceeded;

  return {
    label: hole.label,
    baselineNonRecoverySucceeded: false,
    extendedTestRun: true,
    extendedNonRecoverySucceeded,
    extendedRecoverySucceeded,
    reachableWithoutRecovery,
    reachableWithRecovery,
    requiresRecovery,
    recoveryOptional,
  };
}

export interface NecessityGroundTruthSummary {
  totalCases: number;
  reachableWithoutRecoveryCount: number;
  requiresRecoveryCount: number;
  recoveryOptionalCount: number;
  recoveryUnnecessaryCount: number; // total - requiresRecovery - recoveryOptional (includes reachableWithoutRecovery and true-gap-for-everything cases)
}

export function summarizeGroundTruth(rows: NecessityGroundTruthRow[]): NecessityGroundTruthSummary {
  const requiresRecoveryCount = rows.filter((r) => r.requiresRecovery).length;
  const recoveryOptionalCount = rows.filter((r) => r.recoveryOptional).length;
  return {
    totalCases: rows.length,
    reachableWithoutRecoveryCount: rows.filter((r) => r.reachableWithoutRecovery).length,
    requiresRecoveryCount,
    recoveryOptionalCount,
    recoveryUnnecessaryCount: rows.length - requiresRecoveryCount - recoveryOptionalCount,
  };
}
