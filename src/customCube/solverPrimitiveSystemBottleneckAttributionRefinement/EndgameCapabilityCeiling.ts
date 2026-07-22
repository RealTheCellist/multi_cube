// --- EndgameCapabilityCeiling (Solver System Bottleneck Attribution
// Refinement Sprint v1, STEP2) -----------------------------------------------
// READ-ONLY. For every "Reachable" snapshot (STEP1), replays up to (but not
// including) the queued ENDGAME task to get the REAL intermediate cube
// state ENDGAME would actually see in production, then measures ENDGAME's
// own improvement at 5 budgets (120/250/500/1000/5000ms -- 5000ms as the
// "Unlimited" proxy, since ENDGAME's own guard<50 loop bound plus
// bfsMoveWingToPosition's own MAX_TRACK_NODES cap already terminate any
// single call well within that) via mirrorRunPrimaryPipeline, called
// directly with a synthetic ENDGAME task on the SAME real captured state
// for every budget (fair, apples-to-apples, holding the starting position
// fixed across all 5 budgets).
//
// Disclosed stochasticity note: ENDGAME's own bestFixOverall/
// tryEndgameMultiPly use shuffle() internally (real, unmodified) --a SINGLE
// measurement per snapshot per budget is a real, single realization, not a
// repeated-trial average; STEP4 aggregates across the full Reachable
// population (typically 150+ real snapshots) to average out this
// per-snapshot noise, rather than repeating each snapshot N times (matching
// this whole research arc's population-averaging precedent when population
// size is large enough).
import { cloneCubies, type Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { SolveTask } from "../fiveByFiveEdgeSolverTypes";
import { mirrorRunPrimaryPipeline, type StageEvent } from "../solverPrimitiveSystemBottleneckAttribution/StageInstrumentedMirror";
import type { ReachabilityRecord } from "./PlannerReachabilityAnalysis";

export const CEILING_BUDGETS_MS = [120, 250, 500, 1000, 5000] as const;
export type CeilingBudget = (typeof CEILING_BUDGETS_MS)[number];

function endgameTask(id: number): SolveTask {
  return { id, type: "ENDGAME", description: "Endgame Capability Ceiling probe", targetEdge: -1, score: 0 };
}

export interface CeilingProbeRecord {
  hash: string;
  budgetMs: number;
  wrongBefore: number;
  wrongAfter: number;
  improvement: number;
  solved: boolean;
  runtimeMs: number;
}

export function probeEndgameCeiling(record: ReachabilityRecord, libs: ExecutorLibraries): CeilingProbeRecord[] {
  if (!record.preEndgameCubies) return [];
  const results: CeilingProbeRecord[] = [];
  for (const budgetMs of CEILING_BUDGETS_MS) {
    const working = cloneCubies(record.preEndgameCubies);
    const wrongBefore = wrongWingCount5(working);
    const start = Date.now();
    const deadline = start + budgetMs;
    const events: StageEvent[] = [];
    mirrorRunPrimaryPipeline(record.hash, working, endgameTask(record.endgameTaskIndex), libs, deadline, events);
    const runtimeMs = Date.now() - start;
    const wrongAfter = wrongWingCount5(working);
    results.push({
      hash: record.hash,
      budgetMs,
      wrongBefore,
      wrongAfter,
      improvement: wrongBefore - wrongAfter,
      solved: wrongAfter === 0,
      runtimeMs,
    });
  }
  return results;
}

export function probeAllEndgameCeilings(records: readonly ReachabilityRecord[], libs: ExecutorLibraries): CeilingProbeRecord[] {
  return records.filter((r) => r.case === "Reachable").flatMap((r) => probeEndgameCeiling(r, libs));
}

export type { Cubie };
