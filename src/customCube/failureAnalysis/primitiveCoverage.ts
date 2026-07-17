// --- PrimitiveCoverage + Heat Map (Failure Analysis Engine v1) --------------
// "가장 중요한 모듈" per spec: for each failure, which primitive(s) were
// actually tried (from the stored Trace), and did any of them succeed at
// all before the residual was declared stuck? A failure where NO primitive
// ever recorded a success on the FINAL stuck slot(s) is exactly the
// "Unknown -- new Primitive가 필요한 영역" the spec asks to surface.
import type { FailureSnapshot, HeatMapReport, PrimitiveCoverageReport, PrimitiveName } from "./failureTypes";
import { slotToIndexReverse } from "./slotOrder";

const PRIMITIVES: PrimitiveName[] = ["BASE", "FLIP", "PARITY", "ENDGAME", "RECOVERY"];

/**
 * A snapshot "belongs" to whichever primitive most recently showed ANY
 * success anywhere in its trace (the last thing that made real progress
 * before the plan finally gave up) -- if NOTHING in the trace ever
 * succeeded, it counts as Unknown: the entire plan never got a single
 * primitive to work on this cube at all.
 */
function attributedPrimitive(s: FailureSnapshot): PrimitiveName | null {
  const successes = s.primitiveAttempts.filter((a) => a.succeeded);
  if (successes.length === 0) return null;
  return successes[successes.length - 1].primitive;
}

export function computeCoverage(snapshots: readonly FailureSnapshot[]): PrimitiveCoverageReport {
  const byPrimitive: Record<PrimitiveName, number> = { BASE: 0, FLIP: 0, PARITY: 0, ENDGAME: 0, RECOVERY: 0 };
  let unknownCount = 0;

  for (const s of snapshots) {
    const p = attributedPrimitive(s);
    if (p) byPrimitive[p]++;
    else unknownCount++;
  }

  const total = snapshots.length || 1;
  const byPrimitivePercent: Record<PrimitiveName, number> = { BASE: 0, FLIP: 0, PARITY: 0, ENDGAME: 0, RECOVERY: 0 };
  for (const p of PRIMITIVES) byPrimitivePercent[p] = Math.round((byPrimitive[p] / total) * 1000) / 10;

  return {
    totalFailures: snapshots.length,
    byPrimitive,
    byPrimitivePercent,
    unknownCount,
    unknownPercent: Math.round((unknownCount / total) * 1000) / 10,
  };
}

export function computeHeatMap(snapshots: readonly FailureSnapshot[]): HeatMapReport {
  const bySlot: Record<string, number> = {};
  for (const s of snapshots) {
    for (const edgeIndex of s.remainingEdges) {
      const label = slotToIndexReverse(edgeIndex);
      bySlot[label] = (bySlot[label] ?? 0) + 1;
    }
  }
  const maxCount = Math.max(0, ...Object.values(bySlot));
  return { bySlot, maxCount };
}

/** ASCII bar rendering for ReportGenerator (spec's own example uses solid
 * block characters scaled to frequency). */
export function renderHeatMapAscii(heatMap: HeatMapReport, width = 20): string {
  const lines: string[] = [];
  const entries = Object.entries(heatMap.bySlot).sort((a, b) => b[1] - a[1]);
  for (const [slot, count] of entries) {
    const bars = heatMap.maxCount > 0 ? Math.max(1, Math.round((count / heatMap.maxCount) * width)) : 0;
    lines.push(`${slot.padEnd(10)} ${"█".repeat(bars)} (${count})`);
  }
  return lines.join("\n");
}
