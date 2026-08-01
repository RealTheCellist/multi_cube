// --- ContractAudit (Multi-Component Merge Short-Circuit Production
// Integration Sprint v1, STEP1) ------------------------------------------------
// Confirms MULTI_COMPONENT_MERGE was added to attemptRecovery()'s own
// shortCircuitRepair condition (fiveByFiveEdgeRecovery.ts) with the EXACT
// same treatment as REPAIR/CCR/MIXED_COMMUTATOR/PARITY_GATED_CYCLE --
// reads the real production source text directly rather than re-deriving
// behavior indirectly, since this is a static structural property of one
// line of code.
import * as fs from "fs";

const PRODUCTION_FILE = "src/customCube/fiveByFiveEdgeRecovery.ts";
const REQUIRED_TYPES = ["REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE", "MULTI_COMPONENT_MERGE"] as const;

export interface ContractAuditResult {
  matchedLine: string | null;
  allTypesPresent: boolean;
  presentTypes: string[];
  missingTypes: string[];
}

export function auditShortCircuitContract(readFile: (path: string) => string = (p) => fs.readFileSync(p, "utf-8")): ContractAuditResult {
  const source = readFile(PRODUCTION_FILE);
  const lines = source.split("\n");
  const matchedLine = lines.find((l) => l.includes("shortCircuitRepair") && l.includes("afterDisrupt < originalBaseline")) ?? null;

  const presentTypes = matchedLine ? REQUIRED_TYPES.filter((t) => matchedLine.includes(`best.type === "${t}"`)) : [];
  const missingTypes = REQUIRED_TYPES.filter((t) => !presentTypes.includes(t));

  return {
    matchedLine,
    allTypesPresent: missingTypes.length === 0,
    presentTypes,
    missingTypes,
  };
}
