// --- RawDataCollector (CCR Prototype Sprint v1) ----------------------------
// STEP5. Collects ONE shared raw dataset per run across all 335
// current-failure snapshots (the same dataset every Sprint in this arc
// has used), following the exact "collect once per run, share across all
// downstream STEPs" discipline solverPrimitiveIntegrationV2/
// RawDataCollector.ts already established. Baseline = REPAIR alone (the
// REAL, unmodified production runSuccessV2/W2_WIDER_HOP, called directly
// against the snapshot's raw state -- no full solve()/Recovery wiring
// needed since REPAIR's own Gate/search is being tested in isolation,
// exactly like every prior Sprint's own capability benchmark). Candidate
// = REPAIR first, then (only if REPAIR didn't net-improve) the CCR
// Prototype -- since REPAIR's Gate (cycleLength 2~4) and CCR's Gate
// (cycleLength 5~6, conflictEdgeCount=0) are disjoint by construction
// (Blueprint section 7), at most one of the two ever actually fires per
// snapshot; trying REPAIR first mirrors Recovery's own real dispatch
// order without needing to touch fiveByFiveEdgeRecovery.ts.
import { cloneCubies, type Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";
import { runCCRPrototype, type CCRStrategy } from "./CCRPrototype";
import { analyzeCcrGate } from "./CCRGate";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { countConflictEdges } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;
const REPAIR_DEADLINE_MS = 400; // matches this arc's own GATE_VARIANT_DEADLINE_MS convention

export interface PerReplayRunRecord {
  hash: string;
  primitiveSuccess: Record<AllowedPrimitive, boolean>;
  wasExistingGap: boolean;
  cycleLength: number;
  conflictEdgeCount: number;
  isCcrTarget: boolean; // cycleLength 5~6, conflictEdgeCount=0 (CCR's own Gate)
  baselineMatched: boolean; // REPAIR's own Gate accepted
  baselineSucceeded: boolean;
  baselineRegressed: boolean;
  candidateMatched: boolean; // REPAIR OR CCR's own Gate accepted
  candidateSucceeded: boolean;
  candidateRegressed: boolean;
  candidateSource: "REPAIR" | "CCR" | "none"; // which of the two actually produced the candidate result
}

export type RunRecord = PerReplayRunRecord[];

interface Outcome {
  matched: boolean;
  succeeded: boolean;
  regressed: boolean;
}

function evalMoves(wrongWingBefore: number, matched: boolean, moves: Move[] | null, cubies: Cubie[]): Outcome {
  if (!matched || !moves) return { matched, succeeded: false, regressed: false };
  const clone = cloneCubies(cubies);
  applySeq(clone, moves);
  const wrongWingAfter = wrongWingCount5(clone);
  return { matched: true, succeeded: wrongWingAfter < wrongWingBefore, regressed: wrongWingAfter > wrongWingBefore };
}

export function collectRun(
  snapshots: readonly FailureSnapshot[],
  lib: WingLibrary,
  libs: ExecutorLibraries,
  ccrBudgetMs: number,
  ccrStrategy: CCRStrategy,
): RunRecord {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const primitiveSuccess = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
    const wasExistingGap = (Object.keys(primitiveSuccess) as AllowedPrimitive[]).every((p) => !primitiveSuccess[p]);

    const cycleAnalysis = analyzeMultiCycle(cubies);
    const conflictEdgeCount = countConflictEdges(cubies);
    const isCcrTarget = analyzeCcrGate(cubies).eligible;

    const repairResult = runSuccessV2(cubies, lib, Date.now() + REPAIR_DEADLINE_MS, W2_WIDER_HOP);
    const baseline = evalMoves(wrongWingBefore, repairResult.matched, repairResult.moves, cubies);

    let candidate: Outcome;
    let candidateSource: "REPAIR" | "CCR" | "none";
    if (baseline.succeeded) {
      candidate = baseline;
      candidateSource = "REPAIR";
    } else {
      const ccrResult = runCCRPrototype(cubies, lib, Date.now() + ccrBudgetMs, ccrStrategy);
      const ccrOutcome = evalMoves(wrongWingBefore, ccrResult.matched, ccrResult.moves, cubies);
      if (ccrOutcome.succeeded) {
        candidate = ccrOutcome;
        candidateSource = "CCR";
      } else {
        // neither succeeded -- report whichever matched (for coverage/precision bookkeeping), preferring REPAIR's own match flag if either matched
        candidate = baseline.matched ? baseline : ccrOutcome;
        candidateSource = baseline.matched ? "REPAIR" : ccrResult.matched ? "CCR" : "none";
      }
    }

    return {
      hash: s.hash,
      primitiveSuccess,
      wasExistingGap,
      cycleLength: cycleAnalysis?.cycleLength ?? 0,
      conflictEdgeCount,
      isCcrTarget,
      baselineMatched: baseline.matched,
      baselineSucceeded: baseline.succeeded,
      baselineRegressed: baseline.regressed,
      candidateMatched: candidate.matched,
      candidateSucceeded: candidate.succeeded,
      candidateRegressed: candidate.regressed,
      candidateSource,
    };
  });
}

export function collectMultipleRuns(
  snapshots: readonly FailureSnapshot[],
  lib: WingLibrary,
  libs: ExecutorLibraries,
  ccrBudgetMs: number,
  ccrStrategy: CCRStrategy,
  times: number,
): RunRecord[] {
  const runs: RunRecord[] = [];
  for (let i = 0; i < times; i++) runs.push(collectRun(snapshots, lib, libs, ccrBudgetMs, ccrStrategy));
  return runs;
}
