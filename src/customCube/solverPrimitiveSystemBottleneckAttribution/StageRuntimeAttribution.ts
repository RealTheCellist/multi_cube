// --- StageRuntimeAttribution (Solver System Bottleneck Attribution
// Sprint v1, STEP1) ----------------------------------------------------------
// Aggregates StageInstrumentedMirror.ts's real per-stage timing across many
// real solve() calls: call count, avg/max runtime, % of total runtime.
import type { StageEvent, StageName } from "./StageInstrumentedMirror";

export interface StageRuntimeRow {
  stage: StageName;
  callCount: number; // number of solve() calls in which this stage fired at least once
  invocationCount: number; // number of individual StageEvent entries (>= callCount, since ENDGAME_BESTFIX/MULTIPLY can fire on every loop iteration... actually here 1 summed event per runPrimaryPipeline call, so equals callCount for those; kept distinct for clarity)
  totalRuntimeMs: number;
  avgRuntimeMs: number;
  maxRuntimeMs: number;
  pctOfTotalRuntime: number;
}

export function attributeStageRuntime(allEvents: readonly StageEvent[]): StageRuntimeRow[] {
  const byStage = new Map<StageName, StageEvent[]>();
  for (const e of allEvents) {
    if (!byStage.has(e.stage)) byStage.set(e.stage, []);
    byStage.get(e.stage)!.push(e);
  }
  const grandTotal = allEvents.reduce((a, e) => a + e.runtimeMs, 0);

  const rows: StageRuntimeRow[] = [];
  for (const [stage, events] of byStage) {
    const totalRuntimeMs = events.reduce((a, e) => a + e.runtimeMs, 0);
    rows.push({
      stage,
      callCount: events.length,
      invocationCount: events.length,
      totalRuntimeMs,
      avgRuntimeMs: events.length ? totalRuntimeMs / events.length : 0,
      maxRuntimeMs: events.length ? Math.max(...events.map((e) => e.runtimeMs)) : 0,
      pctOfTotalRuntime: grandTotal > 0 ? (totalRuntimeMs / grandTotal) * 100 : 0,
    });
  }
  return rows.sort((a, b) => b.totalRuntimeMs - a.totalRuntimeMs);
}
