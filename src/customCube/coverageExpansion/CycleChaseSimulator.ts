// --- CycleChaseSimulator (Coverage Expansion Sprint v1) ---------------------
// Spec STEP 4/5: hypothetical Coverage expansion, WITHOUT touching
// primitivePrototype/CycleChasePrototype.ts at all. This is a NEW, parallel
// function living entirely in coverageExpansion/, parameterized by the 3
// expansion levers ExpansionAnalysis.ts identified as worth testing
// (minimumCycleLength, alternateStart, parityPreTry) -- never wired into
// the real Solver, purely for measuring "what if" against the same 75 real
// Replays.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, slotKey, tryFixWing, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { tryApplyPrimitive } from "../goalPlanner/GoalAnalyzer";
import { pickLongestCycle } from "./cycleUtil";

export interface SimulationOptions {
  minimumCycleLength: number; // real Prototype hardcodes 4
  alternateStart: boolean; // real Prototype always starts at the cycle's own lexicographically-first member
  parityPreTry: boolean; // real Prototype never tries PARITY before chasing
}

// Reproduces the REAL Prototype's own exact behavior -- used as a sanity
// check that the simulator agrees with CycleChasePrototype.ts before trusting
// any "expanded" variant's numbers.
export const BASELINE_OPTIONS: SimulationOptions = { minimumCycleLength: 4, alternateStart: false, parityPreTry: false };

function chaseCycleFrom(working: Cubie[], cycle: readonly string[], lib: WingLibrary, deadline: number): Move[] {
  const applied: Move[] = [];
  for (const slot of cycle) {
    if (Date.now() > deadline) break;
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) continue;
    const fix = tryFixWing(working, wrongHere, lib, deadline);
    if (!fix || fix.length === 0) break;
    applySeq(working, fix);
    applied.push(...fix);
  }
  return applied;
}

export function simulateCycleChase(cubies: Cubie[], libs: ExecutorLibraries, deadline: number, options: SimulationOptions): Move[] | null {
  const before = wrongWingCount5(cubies);

  const prefixMoves: Move[] = [];
  let stateAfterPrefix = cloneCubies(cubies);

  if (options.parityPreTry) {
    const clone = cloneCubies(stateAfterPrefix);
    const parityFix = tryApplyPrimitive(clone, "PARITY", libs, deadline);
    if (parityFix && parityFix.length > 0) {
      prefixMoves.push(...parityFix);
      stateAfterPrefix = clone;
    }
  }

  const cycle = pickLongestCycle(buildStateGraph(stateAfterPrefix).cycles);
  if (!cycle || cycle.length < options.minimumCycleLength) return null;

  const rotationCount = options.alternateStart ? cycle.length : 1;
  for (let r = 0; r < rotationCount; r++) {
    if (Date.now() > deadline) break;
    const rotated = [...cycle.slice(r), ...cycle.slice(0, r)];
    const working = cloneCubies(stateAfterPrefix);
    const chaseMoves = chaseCycleFrom(working, rotated, libs.lib, deadline);
    if (chaseMoves.length === 0) continue;
    if (wrongWingCount5(working) < before) {
      return [...prefixMoves, ...chaseMoves];
    }
  }

  return null;
}
