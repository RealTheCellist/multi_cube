// --- TraversalInterruptibilityCore (Incremental Recovery Architecture
// Prototype Sprint v1) -----------------------------------------------------
// STEP1. This Sprint's ONLY production change: fiveByFiveEdges.ts's
// bfsMoveWingToPosition() gained an OPTIONAL deadline/granularity/
// checkEveryNodes parameter set (all default to prior behavior exactly --
// see that function's own comment). This module builds REAL test cases
// from real captured cube snapshots to exercise it, and compares the 3
// requested check-placement granularities (nodeCount/queuePop/
// levelTransition).
//
// Test-case construction note (disclosed simplification): the REAL
// enumerateWingCandidates()/tryFixWing() choose bfsMoveWingToPosition's
// target position from a WingLibrary entry's own effect mapping, which
// this Sprint's protected scope (only bfsMoveWingToPosition + related
// instrumentation may change) does not expose without additional Production
// exports beyond this Sprint's own minimal footprint. Instead, this uses
// the SAME real color-matching selection criterion tryFixWing itself uses
// (slotKey/colorKeyOf/pieceType5, all EXISTING exports, unmodified) --
// "move wrong wing A to wherever a same-needed-color wrong wing B
// currently sits, pinning a third wrong wing in place" -- a structurally
// faithful stand-in for the real target selection, using real cube states,
// without needing the private library-entry machinery. Full end-to-end
// wiring through enumerateWingCandidates/tryFixWing themselves is
// explicitly out of this Sprint's scope (both are protected) and is the
// subject of the follow-on Production Integration Sprint.
import type { Cubie } from "../cubeState";
import { pieceType5 } from "../fiveByFivePieces";
import {
  wrongWings5,
  colorKeyOf,
  slotKey,
  toLiteEdges,
  bfsMoveWingToPosition,
  type LiteEdge5,
  type DeadlineCheckGranularity,
  type Move,
} from "../fiveByFiveEdges";

export const REAL_MAX_DEPTH = 6; // matches every real call site's own maxDepth argument exactly

export interface InterruptibilityTestCase {
  hash: string;
  edges: LiteEdge5[];
  pieceId: number;
  targetPosKey: string;
  pins?: { id: number; posKey: string }[];
}

function neededColorFor(cubies: Cubie[], w: Cubie): string | null {
  const wSlot = slotKey(w);
  const trueEdge = cubies.find((c) => pieceType5(c) === "trueEdge" && slotKey(c) === wSlot);
  return trueEdge ? colorKeyOf(trueEdge) : null;
}

/** One real test case per wrong wing that has a same-needed-color match among the OTHER wrong wings in this snapshot. */
export function buildTestCasesForSnapshot(hash: string, cubies: Cubie[]): InterruptibilityTestCase[] {
  const wrongs = wrongWings5(cubies);
  const edges = toLiteEdges(cubies);
  const cases: InterruptibilityTestCase[] = [];

  for (const w of wrongs) {
    const neededColor = neededColorFor(cubies, w);
    if (!neededColor) continue;
    const matches = wrongs.filter((m) => m.id !== w.id && colorKeyOf(m) === neededColor);
    if (matches.length === 0) continue;
    const match = matches[0];
    const targetEdge = edges.find((e) => e.id === match.id);
    if (!targetEdge) continue;

    const pinCandidate = wrongs.find((p) => p.id !== w.id && p.id !== match.id);
    const pinEdge = pinCandidate ? edges.find((e) => e.id === pinCandidate.id) : undefined;

    cases.push({
      hash,
      edges,
      pieceId: w.id,
      targetPosKey: `${targetEdge.x},${targetEdge.y},${targetEdge.z}`,
      pins: pinEdge ? [{ id: pinEdge.id, posKey: `${pinEdge.x},${pinEdge.y},${pinEdge.z}` }] : undefined,
    });
  }
  return cases;
}

export function buildTestCases(snapshots: readonly { hash: string; cubies: Cubie[] }[]): InterruptibilityTestCase[] {
  return snapshots.flatMap((s) => buildTestCasesForSnapshot(s.hash, s.cubies));
}

export interface GranularityProbeResult {
  granularity: DeadlineCheckGranularity;
  n: number;
  avgOvershootMs: number; // actual wall time consumed AFTER the deadline before returning, average
  maxOvershootMs: number;
  abortedCount: number; // how many actually got interrupted (rather than finishing naturally before the tight deadline)
}

/** Runs every test case with a deliberately-tight deadline (already-passed) to measure how quickly/precisely each granularity mode detects and returns. */
export function compareGranularities(cases: readonly InterruptibilityTestCase[]): GranularityProbeResult[] {
  const granularities: DeadlineCheckGranularity[] = ["nodeCount", "queuePop", "levelTransition"];
  return granularities.map((granularity) => {
    const overshoots: number[] = [];
    let abortedCount = 0;
    for (const c of cases) {
      const start = Date.now();
      const deadline = start; // already expired -- forces the search to abort at its very first check
      bfsMoveWingToPosition(c.edges, c.pieceId, c.targetPosKey, REAL_MAX_DEPTH, c.pins, deadline, granularity, 50);
      const elapsed = Date.now() - start;
      overshoots.push(elapsed);
      if (elapsed < 50) abortedCount++; // a fast return strongly suggests the check fired rather than the search running to natural completion
    }
    const n = overshoots.length;
    return {
      granularity,
      n,
      avgOvershootMs: n ? overshoots.reduce((a, b) => a + b, 0) / n : 0,
      maxOvershootMs: n ? Math.max(...overshoots) : 0,
      abortedCount,
    };
  });
}

export interface RegressionSafetyCheck {
  n: number;
  identicalResultCount: number; // deadline=undefined vs deadline=now+generous, same granularity irrelevant -- both should ALWAYS match structurally
  mismatchCount: number;
}

/** Smoke check: calling the modified function with NO deadline (every existing real caller's own behavior) must match calling it with a deadline so generous it can never fire -- confirms the added guards are inert when unused, and harmless when the deadline just happens to never trigger. */
export function verifyRegressionSafety(cases: readonly InterruptibilityTestCase[]): RegressionSafetyCheck {
  let identicalResultCount = 0;
  let mismatchCount = 0;
  for (const c of cases) {
    const withoutDeadline = bfsMoveWingToPosition(c.edges, c.pieceId, c.targetPosKey, REAL_MAX_DEPTH, c.pins);
    const withGenerousDeadline = bfsMoveWingToPosition(c.edges, c.pieceId, c.targetPosKey, REAL_MAX_DEPTH, c.pins, Date.now() + 60000, "nodeCount", 50);
    const same = JSON.stringify(withoutDeadline) === JSON.stringify(withGenerousDeadline);
    if (same) identicalResultCount++;
    else mismatchCount++;
  }
  return { n: cases.length, identicalResultCount, mismatchCount };
}

export type { Move };
