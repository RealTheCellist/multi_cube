// --- PopulationReplay (Multi-Component Merge Production Validation Sprint
// v1, STEP2) --------------------------------------------------------------------
// Real end-to-end FiveByFiveEdgeSolverEngine.solve() over the full 142-case
// Hole Dataset (N=142 >= this Sprint's own N>=30 requirement -- case-count
// N, matching every prior Sprint's own Category B/C production-stage minN
// convention in ChangeClassification.ts, not 30 repeated full-population
// passes, disclosed explicitly in this Sprint's own docs).
import { cloneCubies } from "../cubeState";
import { endToEndSolveProbe, type EndToEndSolveResult } from "./EndToEndSolveProbe";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export function runPopulationReplay(holes: readonly HoleCase[]): EndToEndSolveResult[] {
  return holes.map((h) => endToEndSolveProbe(cloneCubies(h.cubies), h.label));
}
