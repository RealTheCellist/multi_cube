// --- Capability Matrix (Capability Analysis Engine v1) ----------------------
// Converts real PrimitiveTestResults into the spec's own O/△/X matrix.
// Every cell is derived from an actual measured before/after (see
// PrimitiveCapabilityTester) -- never a placeholder.
import type { CapabilityLevel, CapabilityMatrix, CapabilityRowName, PrimitiveTestResult } from "./capabilityTypes";

const ROWS: CapabilityRowName[] = ["PairCreation", "PairPreservation", "CycleRemoval", "ConflictReduction", "MultiSwap"];

function levelFor(row: CapabilityRowName, r: PrimitiveTestResult, hasMultiSwapCycle: boolean): CapabilityLevel {
  switch (row) {
    case "PairCreation":
      if (!r.succeeded) return "X";
      return r.wrongWingAfter < r.wrongWingBefore ? "O" : "△";
    case "PairPreservation":
      if (!r.applicable) return "X";
      if (r.wrongWingAfter > r.wrongWingBefore) return "X"; // made things worse -- didn't preserve anything
      return r.succeeded ? "O" : "△"; // no collateral damage, whether or not it made progress
    case "CycleRemoval":
      if (r.cycleAfter < r.cycleBefore) return "O";
      return r.succeeded ? "△" : "X";
    case "ConflictReduction":
      if (r.conflictAfter < r.conflictBefore) return "O";
      return r.succeeded ? "△" : "X";
    case "MultiSwap":
      // None of BASE/FLIP/CASE/PARITY/RECOVERY were DESIGNED to resolve a
      // 3+-length cycle in one shot -- this row is expected to read X
      // across the board whenever such a cycle exists, which is exactly
      // the gap the spec's own worked example calls out. Reads X
      // (not applicable) when no multi-swap cycle exists in this state at
      // all, since there's nothing here to test the claim against.
      if (!hasMultiSwapCycle) return "X";
      return r.cycleAfter < r.cycleBefore ? "O" : "X";
  }
}

export function buildCapabilityMatrix(clusterId: number, testResults: PrimitiveTestResult[], hasMultiSwapCycle: boolean): CapabilityMatrix {
  const rows = {} as CapabilityMatrix["rows"];
  for (const row of ROWS) {
    const byPrimitive = {} as Record<PrimitiveTestResult["primitive"], CapabilityLevel>;
    for (const r of testResults) byPrimitive[r.primitive] = levelFor(row, r, hasMultiSwapCycle);
    rows[row] = byPrimitive;
  }
  return { clusterId, rows, testResults, hasMultiSwapCycle };
}
