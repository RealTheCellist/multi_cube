// --- ContractStability (Solver Long-term Reliability Validation Sprint
// v1, STEP4) --------------------------------------------------------------
// Re-reads the real production source NOW and compares every constant
// against the values the Solver Research Closeout Sprint v1 already
// captured and committed (solverResearchCloseoutV1/data/
// solver-research-closeout-v1-result.json's own operatingContractCatalog).
// Read-only on both sides -- proves (or disproves) zero silent drift since
// Closeout, without re-deriving the catalog from scratch.
import * as fs from "fs";

const RECOVERY_TS_PATH = "src/customCube/fiveByFiveEdgeRecovery.ts";
const EXECUTOR_TS_PATH = "src/customCube/fiveByFiveEdgeExecutor.ts";
const SOLVER_ENGINE_TS_PATH = "src/customCube/fiveByFiveEdgeSolverEngine.ts";
const CLOSEOUT_RESULT_PATH = "src/customCube/solverResearchCloseoutV1/data/solver-research-closeout-v1-result.json";

function readConst(source: string, name: string): number | null {
  const m = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(source);
  return m ? Number(m[1]) : null;
}

export interface ContractStabilityRow {
  constant: string;
  closeoutValue: number | null;
  currentValue: number | null;
  drifted: boolean;
}

export interface ContractStabilityResult {
  rows: ContractStabilityRow[];
  anyDrift: boolean;
}

export function auditContractStability(): ContractStabilityResult {
  const recoverySource: string = fs.readFileSync(RECOVERY_TS_PATH, "utf-8");
  const executorSource: string = fs.readFileSync(EXECUTOR_TS_PATH, "utf-8");
  const solverEngineSource: string = fs.readFileSync(SOLVER_ENGINE_TS_PATH, "utf-8");
  const closeoutResult = JSON.parse(fs.readFileSync(CLOSEOUT_RESULT_PATH, "utf-8"));

  const currentValues: Record<string, number | null> = {
    PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS: readConst(executorSource, "PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS"),
    FIXED_BUDGET_MS: readConst(executorSource, "FIXED_BUDGET_MS"),
    REPAIR_RESERVED_SLICE_MS: readConst(recoverySource, "REPAIR_RESERVED_SLICE_MS"),
    MIXED_COMMUTATOR_RESERVED_SLICE_MS: readConst(recoverySource, "MIXED_COMMUTATOR_RESERVED_SLICE_MS"),
    SETUP_RESERVED_SLICE_MS: readConst(recoverySource, "SETUP_RESERVED_SLICE_MS"),
    PARITY_GATED_CYCLE_RESERVED_SLICE_MS: readConst(recoverySource, "PARITY_GATED_CYCLE_RESERVED_SLICE_MS"),
    MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS: readConst(recoverySource, "MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS"),
    PLAN_TIME_BUDGET_MS: readConst(solverEngineSource, "PLAN_TIME_BUDGET_MS"),
  };

  // Closeout's own real captured values, extracted from its own
  // FinalArchitecture/OperatingContractCatalog JSON dump (parsed from the
  // real value strings it already wrote, e.g. "250ms" -> 250).
  const closeoutOuterDeadlines: { component: string; valueMs: number }[] = closeoutResult.finalArchitecture.outerDeadlines;
  const closeoutContracts: { contract: string; currentValue: string }[] = closeoutResult.operatingContractCatalog;
  const extractMs = (s: string): number | null => {
    const m = /(\d+)ms/.exec(s);
    return m ? Number(m[1]) : null;
  };
  const closeoutValues: Record<string, number | null> = {
    PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS: extractMs(closeoutContracts.find((c) => c.contract.includes("ENDGAME Recovery Reserve"))?.currentValue ?? ""),
    FIXED_BUDGET_MS: extractMs(closeoutContracts.find((c) => c.contract.includes("tryFixWing Fixed Budget"))?.currentValue ?? ""),
    REPAIR_RESERVED_SLICE_MS: extractMs(closeoutContracts.find((c) => c.contract.includes("REPAIR Reserved Slice"))?.currentValue ?? ""),
    MIXED_COMMUTATOR_RESERVED_SLICE_MS: extractMs(closeoutContracts.find((c) => c.contract.includes("MIXED_COMMUTATOR Reserved Slice"))?.currentValue ?? ""),
    SETUP_RESERVED_SLICE_MS: extractMs(closeoutContracts.find((c) => c.contract.includes("SETUP Reserved Slice"))?.currentValue ?? ""),
    PARITY_GATED_CYCLE_RESERVED_SLICE_MS: extractMs(closeoutContracts.find((c) => c.contract.includes("PARITY_GATED_CYCLE Reserved Slice"))?.currentValue ?? ""),
    MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS: extractMs(closeoutContracts.find((c) => c.contract.includes("MULTI_COMPONENT_MERGE Reserved Slice"))?.currentValue ?? ""),
    PLAN_TIME_BUDGET_MS: closeoutOuterDeadlines.find((d) => d.component.includes("PLAN_TIME_BUDGET_MS"))?.valueMs ?? null,
  };

  const rows: ContractStabilityRow[] = Object.keys(currentValues).map((constant) => {
    const closeoutValue = closeoutValues[constant];
    const currentValue = currentValues[constant];
    return { constant, closeoutValue, currentValue, drifted: closeoutValue !== currentValue };
  });

  return { rows, anyDrift: rows.some((r) => r.drifted) };
}
