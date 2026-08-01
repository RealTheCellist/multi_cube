// --- RootCauseAnalysis (Multi-Component Merge Production Integration
// Sprint v1, STEP6) -----------------------------------------------------------
// Quantifies, per the Directive's own explicit factor list (Gate Miss /
// Budget / Scheduler Ordering / Primitive Failure / Dataset Coverage), why
// MCM did or didn't provide new Capability on each of the 142 real cases --
// mirroring the classification precedent of
// solverPrimitiveParityGatedCycleIntegrationArchitecture/RootCauseMatrix.ts.
//
// Methodology disclosure: componentCount (Gate Miss check) is recomputed
// directly via computeStructuralFeatures (deterministic, no wall-clock
// dependency) rather than joined from STEP2's separate ContractAudit run,
// to avoid conflating two independently-timed real invocations at the
// per-case level (attemptRecovery() does not expose a SchedulingEvent hook
// the way generateRecoveryStrategies() does -- its internal call always
// passes onEvent=undefined -- so per-case Budget-clamp data cannot be
// threaded through the SAME real attemptRecovery() run STEP3 already
// used). Scheduler Ordering / Primitive Failure classification instead
// uses STEP3's own real candidatesOffered/chosenType trace fields (the
// SAME single Integrated-arm attemptRecovery() call, self-consistent).
// Budget Starvation's precise per-case share within Gate-matched-but-empty
// cases is reported using STEP2's own separate, aggregate
// ContractAuditSummary (avgActualBudgetAvailableMs/budgetStarvedCount) as
// the best available population-level evidence -- disclosed as a
// methodology limitation, not asserted as per-case ground truth.
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import type { CapabilityValidationRow } from "./CapabilityValidation";
import type { ContractAuditSummary } from "./ContractAudit";

export type RootCauseBucket = "GATE_MISS" | "RESOLVED" | "DUPLICATE" | "SCHEDULER_ORDERING" | "PRIMITIVE_FAILURE_OR_BUDGET";

export interface RootCauseRow {
  label: string;
  componentCount: number;
  gateMatched: boolean;
  bucket: RootCauseBucket;
}

export function classifyRootCause(holes: readonly HoleCase[], validationRows: readonly CapabilityValidationRow[]): RootCauseRow[] {
  const validationByLabel = new Map(validationRows.map((r) => [r.label, r]));
  return holes.map((h) => {
    const componentCount = computeStructuralFeatures(h.cubies, h.label).componentCount;
    const gateMatched = componentCount >= 3;
    const v = validationByLabel.get(h.label);

    let bucket: RootCauseBucket;
    if (!gateMatched) {
      bucket = "GATE_MISS";
    } else if (!v) {
      bucket = "PRIMITIVE_FAILURE_OR_BUDGET";
    } else if (v.newCapability) {
      bucket = "RESOLVED";
    } else if (v.duplicate) {
      bucket = "DUPLICATE";
    } else if (v.integrated.candidatesOffered.includes("MULTI_COMPONENT_MERGE") && v.integrated.chosenType !== "MULTI_COMPONENT_MERGE" && v.integrated.chosenType !== "none") {
      bucket = "SCHEDULER_ORDERING";
    } else {
      bucket = "PRIMITIVE_FAILURE_OR_BUDGET";
    }

    return { label: h.label, componentCount, gateMatched, bucket };
  });
}

export interface RootCauseSummary {
  n: number;
  gateMissCount: number;
  gateMissRate: number; // Dataset Coverage's own structural ceiling: 1 - this is the absolute max any Gate-based approach could ever address on this population
  resolvedCount: number;
  duplicateCount: number;
  schedulerOrderingCount: number;
  primitiveFailureOrBudgetCount: number;
  datasetCoverageCeiling: number; // gateMatchedRate = 1 - gateMissRate, cited for clarity as its own named metric
  budgetStarvationEvidence: {
    avgActualBudgetAvailableMsAmongGateMatched: number; // from STEP2's own separate ContractAudit run
    budgetStarvedRateAmongGateMatched: number;
  };
}

export function summarizeRootCause(rows: readonly RootCauseRow[], auditSummary: ContractAuditSummary): RootCauseSummary {
  const n = rows.length;
  const gateMiss = rows.filter((r) => r.bucket === "GATE_MISS");
  const gateMatchedCount = n - gateMiss.length;
  return {
    n,
    gateMissCount: gateMiss.length,
    gateMissRate: n ? gateMiss.length / n : 0,
    resolvedCount: rows.filter((r) => r.bucket === "RESOLVED").length,
    duplicateCount: rows.filter((r) => r.bucket === "DUPLICATE").length,
    schedulerOrderingCount: rows.filter((r) => r.bucket === "SCHEDULER_ORDERING").length,
    primitiveFailureOrBudgetCount: rows.filter((r) => r.bucket === "PRIMITIVE_FAILURE_OR_BUDGET").length,
    datasetCoverageCeiling: n ? gateMatchedCount / n : 0,
    budgetStarvationEvidence: {
      avgActualBudgetAvailableMsAmongGateMatched: auditSummary.avgActualBudgetAvailableMs,
      budgetStarvedRateAmongGateMatched: auditSummary.gateMatchedCount ? auditSummary.budgetStarvedCount / auditSummary.gateMatchedCount : 0,
    },
  };
}
