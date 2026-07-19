// --- SuccessFailureClassification (Solver Primitive Prototype Sprint v3) -
// STEP3: runs the deployed tryMultiHopBridgeV3 (full gate) across the
// 150-replay Dataset and classifies each outcome as Success / Deferred
// Reject / Gate Rejected, matching the work order's own STEP3 breakdown
// request ("Success / Failure / Deferred Reject").
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { tryMultiHopBridgeV3 } from "./MultiHopBridgePrototypeV3";

export type ClassificationLabel = "success" | "deferred_reject" | "gate_rejected";

export interface ClassifiedRecord {
  hash: string;
  label: ClassificationLabel;
  wrongWingBefore: number;
  wrongWingAfter: number;
}

export interface SuccessFailureSummary {
  totalReplays: number;
  successCount: number;
  deferredRejectCount: number;
  gateRejectedCount: number;
  matchedCount: number; // successCount + deferredRejectCount (gate_matched)
  successRateOverall: number;
  successRateAmongMatched: number;
}

export function classifyOutcomes(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): { records: ClassifiedRecord[]; summary: SuccessFailureSummary } {
  const records: ClassifiedRecord[] = snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const result = tryMultiHopBridgeV3(cubies, lib, Date.now() + deadlineMs);

    if (result.gateOutcome !== "gate_matched") {
      return { hash: s.hash, label: "gate_rejected" as const, wrongWingBefore, wrongWingAfter: wrongWingBefore };
    }
    if (!result.moves) {
      return { hash: s.hash, label: "deferred_reject" as const, wrongWingBefore, wrongWingAfter: wrongWingBefore };
    }
    const clone = cloneCubies(cubies);
    applySeq(clone, result.moves);
    const wrongWingAfter = wrongWingCount5(clone);
    return { hash: s.hash, label: "success" as const, wrongWingBefore, wrongWingAfter };
  });

  const totalReplays = records.length;
  const successCount = records.filter((r) => r.label === "success").length;
  const deferredRejectCount = records.filter((r) => r.label === "deferred_reject").length;
  const gateRejectedCount = records.filter((r) => r.label === "gate_rejected").length;
  const matchedCount = successCount + deferredRejectCount;

  return {
    records,
    summary: {
      totalReplays,
      successCount,
      deferredRejectCount,
      gateRejectedCount,
      matchedCount,
      successRateOverall: totalReplays ? successCount / totalReplays : 0,
      successRateAmongMatched: matchedCount ? successCount / matchedCount : 0,
    },
  };
}
