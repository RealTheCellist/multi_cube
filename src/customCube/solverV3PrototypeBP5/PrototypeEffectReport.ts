// --- PrototypeEffectReport (Solver v3 Primitive Prototype Sprint v1 / BP-5)
// STEP5: "Contract를 만족하는 경우에만 실제 Hard Gap 개선률 측정" -- the
// driver only calls this when ContractCostProfiler.ts's verdict is PASS.
// Reuses STEP3's own BoundedLookaheadResult[] (already-computed moves,
// already Deferred-Validated) rather than re-running the search.
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { BoundedLookaheadResult } from "./BoundedLookaheadPrototype";

export interface EffectRecord {
  hash: string;
  activated: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
  improved: boolean;
}

export interface EffectSummary {
  totalCandidates: number;
  activatedCount: number;
  coverage: number; // activatedCount / totalCandidates
  improvedCount: number;
  improvedRate: number; // improvedCount / totalCandidates -- the real "Hard Gap 개선률" over BP-5's own target population
  avgWrongWingDelta: number;
}

export interface PrototypeEffectReport {
  records: EffectRecord[];
  summary: EffectSummary;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function buildEffectReport(snapshots: readonly FailureSnapshot[], results: readonly BoundedLookaheadResult[]): PrototypeEffectReport {
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  const records: EffectRecord[] = [];

  for (const result of results) {
    const snapshot = byHash.get(result.hash);
    if (!snapshot) continue;
    const cubies = deserializeCube(snapshot.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);

    if (!result.moves || result.moves.length === 0) {
      records.push({ hash: result.hash, activated: false, wrongWingBefore, wrongWingAfter: wrongWingBefore, improved: false });
      continue;
    }

    applySeq(cubies, result.moves);
    const wrongWingAfter = wrongWingCount5(cubies);
    records.push({ hash: result.hash, activated: true, wrongWingBefore, wrongWingAfter, improved: wrongWingAfter < wrongWingBefore });
  }

  const activated = records.filter((r) => r.activated);
  const improved = records.filter((r) => r.improved);

  const summary: EffectSummary = {
    totalCandidates: records.length,
    activatedCount: activated.length,
    coverage: records.length ? activated.length / records.length : 0,
    improvedCount: improved.length,
    improvedRate: records.length ? improved.length / records.length : 0,
    avgWrongWingDelta: avg(activated.map((r) => r.wrongWingAfter - r.wrongWingBefore)),
  };

  return { records, summary };
}
