// --- ContractAudit (Multi-Component Merge Production Validation Sprint v1,
// STEP1) ----------------------------------------------------------------------
// Confirms the Operating Contract established by the Short-Circuit
// Production Integration Sprint is still intact and that NOTHING else has
// changed since -- this is a Product Validation Sprint (no production
// change of its own), so the audit is purely a read of the real on-disk
// source plus a git diff against that prior Sprint's own commit.
import * as fs from "fs";
import { execSync } from "child_process";

const PRODUCTION_FILE = "src/customCube/fiveByFiveEdgeRecovery.ts";
const REQUIRED_SHORT_CIRCUIT_TYPES = ["REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE", "MULTI_COMPONENT_MERGE"] as const;
// The commit the Short-Circuit Production Integration Sprint v1 landed its
// one-line fix in -- the reference point this audit diffs against to prove
// "nothing else changed" (protected files AND the fix itself, both).
const SHORT_CIRCUIT_FIX_COMMIT = "e386da8";
const PROTECTED_FILES = [
  "src/customCube/fiveByFiveEdgeRecovery.ts",
  "src/customCube/fiveByFiveEdgePlanner.ts",
  "src/customCube/fiveByFiveEdgeExecutor.ts",
  "src/customCube/fiveByFiveEdgeSolverEngine.ts",
  "src/customCube/fiveByFiveEdges.ts",
];

export interface ContractAuditResult {
  matchedLine: string | null;
  allShortCircuitTypesPresent: boolean;
  presentTypes: string[];
  missingTypes: string[];
  diffSinceFixCommit: string; // empty string = zero drift
  noDriftSinceFix: boolean;
}

export function auditOperatingContract(readFile: (path: string) => string = (p) => fs.readFileSync(p, "utf-8")): ContractAuditResult {
  const source = readFile(PRODUCTION_FILE);
  const lines = source.split("\n");
  const matchedLine = lines.find((l) => l.includes("shortCircuitRepair") && l.includes("afterDisrupt < originalBaseline")) ?? null;
  const presentTypes = matchedLine ? REQUIRED_SHORT_CIRCUIT_TYPES.filter((t) => matchedLine.includes(`best.type === "${t}"`)) : [];
  const missingTypes = REQUIRED_SHORT_CIRCUIT_TYPES.filter((t) => !presentTypes.includes(t));

  const diffSinceFixCommit = execSync(`git diff --stat ${SHORT_CIRCUIT_FIX_COMMIT} -- ${PROTECTED_FILES.join(" ")}`, { cwd: process.cwd() }).toString().trim();

  return {
    matchedLine,
    allShortCircuitTypesPresent: missingTypes.length === 0,
    presentTypes,
    missingTypes,
    diffSinceFixCommit,
    noDriftSinceFix: diffSinceFixCommit.length === 0,
  };
}
