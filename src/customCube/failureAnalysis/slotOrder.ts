// Canonical 0-11 numbering for the 12 true-edge slots -- independently
// derived here (NOT imported from fiveByFiveEdgePlanner.ts's own private
// slotOrder/slotIndex, which aren't exported and which this whole directory
// is forbidden from modifying to export). Same derivation Planner uses
// internally (sort the 12 slot keys from a solved reference cube), so the
// numbering is stable and consistent across every module in this directory
// even though it's computed independently from the solver's own copy.
import { buildSolvedCube } from "../cubeState";
import { analyzeEdgeSlots } from "../fiveByFiveHumanEdges";

let cached: string[] | null = null;
function order(): string[] {
  if (cached) return cached;
  const solved = buildSolvedCube(5);
  cached = analyzeEdgeSlots(solved)
    .map((s) => s.slot)
    .sort();
  return cached;
}

export function slotToIndex(slot: string): number {
  return order().indexOf(slot);
}

export function slotToIndexReverse(index: number): string {
  return order()[index] ?? `unknown-${index}`;
}
