// --- ValidationStandard (Solver Research Closeout Sprint v1, STEP4)
// -------------------------------------------------------------------------
// Consolidates the current Validation Standard by reading the real,
// already-committed solverPostReleaseValidationFramework/ source
// (ReleaseGates.ts, ChangeClassification.ts) directly -- the same
// disclosed-audit pattern (fs.readFileSync + regex) used throughout this
// arc's ContractAudit/CompatibilityAudit modules -- plus citing the two
// Dedicated Budget Primitive Validation Protocols by name. Read-only;
// the Validation Framework itself is not modified this Sprint.
import * as fs from "fs";

const RELEASE_GATES_PATH = "src/customCube/solverPostReleaseValidationFramework/ReleaseGates.ts";
const CHANGE_CLASSIFICATION_PATH = "src/customCube/solverPostReleaseValidationFramework/ChangeClassification.ts";

export interface GateRow {
  gate: string;
  name: string;
}

export interface CategoryRow {
  category: string;
  name: string;
  requiredGates: string;
  minNPrototype: number;
  minNProduction: number;
}

export interface ValidationStandardResult {
  gates: GateRow[];
  categories: CategoryRow[];
  decisionRule: string;
  dedicatedBudgetProtocols: { primitive: string; status: string; decisionSprint: string }[];
}

export function buildValidationStandard(): ValidationStandardResult {
  const gatesSource: string = fs.readFileSync(RELEASE_GATES_PATH, "utf-8");
  const classificationSource: string = fs.readFileSync(CHANGE_CLASSIFICATION_PATH, "utf-8");

  const gateMatches = [...gatesSource.matchAll(/\/\/ Gate ([A-E]): ([^\n(]+)/g)];
  const gates: GateRow[] = gateMatches.map((m) => ({ gate: m[1], name: m[2].trim() }));

  const categoryBlocks = [...classificationSource.matchAll(/category:\s*"([A-D])",\s*\n\s*name:\s*"([^"]+)",\s*\n\s*description:[^\n]+\n\s*requiredGates:\s*\[([^\]]*)\],\s*\n\s*minN:\s*\d+,\s*\n\s*minNByStage:\s*\{\s*prototype:\s*(\d+),\s*production:\s*(\d+)\s*\}/g)];
  const categories: CategoryRow[] = categoryBlocks.map((m) => ({
    category: m[1],
    name: m[2],
    requiredGates: m[3].replace(/["\s]/g, ""),
    minNPrototype: Number(m[4]),
    minNProduction: Number(m[5]),
  }));

  return {
    gates,
    categories,
    decisionRule: "ValidationPipeline.ts의 decideFromGates(): 모든 required Gate가 PASS면 Decision A, 하나라도 FAIL이면 Decision C, 그 외(OPEN_QUESTION 포함, FAIL 없음)는 Decision B.",
    dedicatedBudgetProtocols: [
      {
        primitive: "MULTI_COMPONENT_MERGE",
        status: "Validation Protocol 공식 채택 (Decision A)",
        decisionSprint: "Multi-Component Merge Validation Protocol Standardization Sprint v1",
      },
      {
        primitive: "PARITY_GATED_CYCLE",
        status: "Validation Protocol 공식 채택 (Decision A)",
        decisionSprint: "PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1",
      },
    ],
  };
}
