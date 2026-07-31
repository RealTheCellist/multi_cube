// --- CandidateGenerationAudit (Parity-Gated Cycle Primitive Prototype
// Refinement Sprint v1, STEP2) -------------------------------------------------
// generateBridgeCandidates() (BridgeCandidateGeneration.ts, unmodified)
// only ever returns candidates that ALREADY passed its own internal
// success check -- rejected attempts are silently dropped. To measure
// "attempted / unique / duplicate / rejected / valid" this Sprint needs
// visibility INTO that internal loop, which lives in a private
// (non-exported) function (`candidatesForDirection`). This file is a
// disclosed duplicate: the SAME source/target enumeration order and the
// SAME exported building blocks (wrongWings5/slotKey/toLiteEdges/
// bfsMoveWingToPosition from fiveByFiveEdges.ts, detectComponents from
// ComponentDetection.ts, and BridgeCandidateGeneration.ts's own exported
// bounded constants) are reused verbatim -- only instrumentation counters
// are added. `targetedComponentsMerged` (the real success check) is also
// reimplemented here identically (it is only 6 lines and itself only
// calls the already-exported detectComponents -- no new logic).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bfsMoveWingToPosition, slotKey, toLiteEdges, wrongWings5, type Move } from "../fiveByFiveEdges";
import { detectComponents, type ComponentInfo } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import {
  MAX_SOURCE_WINGS_TRIED,
  MAX_TARGET_SLOTS_TRIED,
  BRIDGE_BFS_MAX_DEPTH,
  BRIDGE_BFS_PER_CANDIDATE_MS,
  type ComponentSelectionStrategy,
} from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

// Verbatim reimplementation of BridgeCandidateGeneration.ts's own private
// `targetedComponentsMerged` -- see that file for the original.
function targetedComponentsMerged(after: Cubie[], compSource: string[], compTarget: string[]): boolean {
  const { componentOfSlot } = detectComponents(after);
  const targetedSlots = [...compSource, ...compTarget].filter((slot) => componentOfSlot.has(slot));
  if (targetedSlots.length === 0) return false;
  const firstComponent = componentOfSlot.get(targetedSlots[0]);
  return targetedSlots.every((slot) => componentOfSlot.get(slot) === firstComponent);
}

export interface DirectionAuditResult {
  pairsAttempted: number; // source wing x target slot combinations actually tried (before deadline cutoff)
  noPathFoundCount: number; // bfsMoveWingToPosition found nothing within its bounded sub-budget/depth
  pathFoundCount: number; // a real move sequence was found
  rejectedCount: number; // path found, but targetedComponentsMerged() rejected it
  validCount: number; // path found AND accepted
  uniqueMoveSequenceCount: number; // among valid candidates, how many distinct move sequences (post-hoc dedupe)
}

function auditDirection(cubies: Cubie[], compSource: string[], compTarget: string[], deadline: number): DirectionAuditResult {
  const wrong = wrongWings5(cubies);
  const sourceCandidates = wrong.filter((w) => compSource.includes(slotKey(w))).slice(0, MAX_SOURCE_WINGS_TRIED);
  const targetSlotWings = wrong.filter((w) => compTarget.includes(slotKey(w)));
  const seenTargetSlots = new Set<string>();
  const targetWingsBySlot: Cubie[] = [];
  for (const w of targetSlotWings) {
    const key = slotKey(w);
    if (seenTargetSlots.has(key)) continue;
    seenTargetSlots.add(key);
    targetWingsBySlot.push(w);
    if (targetWingsBySlot.length >= MAX_TARGET_SLOTS_TRIED) break;
  }

  let pairsAttempted = 0;
  let noPathFoundCount = 0;
  let pathFoundCount = 0;
  let rejectedCount = 0;
  const validMoveSequences: Move[][] = [];

  for (const source of sourceCandidates) {
    for (const targetWing of targetWingsBySlot) {
      if (Date.now() > deadline) break;
      pairsAttempted++;

      const edges = toLiteEdges(cubies);
      const targetEdge = edges.find((e) => e.id === targetWing.id);
      if (!targetEdge) {
        noPathFoundCount++;
        continue;
      }
      const targetPosKey = `${targetEdge.x},${targetEdge.y},${targetEdge.z}`;

      const bfsDeadline = Math.min(deadline, Date.now() + BRIDGE_BFS_PER_CANDIDATE_MS);
      const path = bfsMoveWingToPosition(edges, source.id, targetPosKey, BRIDGE_BFS_MAX_DEPTH, undefined, bfsDeadline);
      if (!path || path.length === 0) {
        noPathFoundCount++;
        continue;
      }
      pathFoundCount++;

      const after = cloneCubies(cubies);
      applySeq(after, path);
      if (targetedComponentsMerged(after, compSource, compTarget)) {
        validMoveSequences.push(path);
      } else {
        rejectedCount++;
      }
    }
  }

  const uniqueKeys = new Set(validMoveSequences.map((seq) => seq.map((m) => `${m[0]}${m[1]}${m[2]}`).join(",")));
  return {
    pairsAttempted,
    noPathFoundCount,
    pathFoundCount,
    rejectedCount,
    validCount: validMoveSequences.length,
    uniqueMoveSequenceCount: uniqueKeys.size,
  };
}

export interface CandidateGenerationAuditCaseResult {
  label: string;
  forward: DirectionAuditResult;
  backward: DirectionAuditResult;
  totalPairsAttempted: number;
  totalValidCount: number;
  totalRejectedCount: number;
  duplicateRatio: number; // 1 - unique/valid across both directions combined, 0 if no valid candidates
  neverGeneratesAnyBridge: boolean; // totalValidCount === 0 -- the case genuinely has no reachable bridge under this bounded search
}

const BRIDGE_SUB_BUDGET_MS = 300; // matches genParityGatedCycle()'s own bridgeDeadline sub-budget

export function auditCandidateGeneration(hole: HoleCase, components: ComponentInfo, strategy: ComponentSelectionStrategy = "largestTwo"): CandidateGenerationAuditCaseResult {
  const start = Date.now();
  const deadline = start + BRIDGE_SUB_BUDGET_MS;
  const bySize = [...components.components].sort((a, b) => b.length - a.length);
  if (bySize.length < 2) {
    const empty: DirectionAuditResult = { pairsAttempted: 0, noPathFoundCount: 0, pathFoundCount: 0, rejectedCount: 0, validCount: 0, uniqueMoveSequenceCount: 0 };
    return { label: hole.label, forward: empty, backward: empty, totalPairsAttempted: 0, totalValidCount: 0, totalRejectedCount: 0, duplicateRatio: 0, neverGeneratesAnyBridge: true };
  }
  const [compX, compY] = strategy === "largestTwo" ? bySize : [...bySize].reverse();

  const forward = auditDirection(hole.cubies, compX, compY, deadline);
  const backward = auditDirection(hole.cubies, compY, compX, deadline);

  const totalValidCount = forward.validCount + backward.validCount;
  const totalUnique = forward.uniqueMoveSequenceCount + backward.uniqueMoveSequenceCount;
  return {
    label: hole.label,
    forward,
    backward,
    totalPairsAttempted: forward.pairsAttempted + backward.pairsAttempted,
    totalValidCount,
    totalRejectedCount: forward.rejectedCount + backward.rejectedCount,
    duplicateRatio: totalValidCount > 0 ? 1 - totalUnique / totalValidCount : 0,
    neverGeneratesAnyBridge: totalValidCount === 0,
  };
}

export interface CandidateGenerationAuditSummary {
  totalCases: number;
  avgPairsAttempted: number;
  avgValidCount: number;
  avgRejectedCount: number;
  avgDuplicateRatio: number;
  neverGeneratesAnyBridgeCount: number;
  neverGeneratesAnyBridgePercent: number;
}

export function summarizeCandidateGenerationAudit(perCase: readonly CandidateGenerationAuditCaseResult[]): CandidateGenerationAuditSummary {
  const n = perCase.length;
  const sum = (f: (c: CandidateGenerationAuditCaseResult) => number) => perCase.reduce((s, c) => s + f(c), 0);
  const neverGeneratesAnyBridgeCount = perCase.filter((c) => c.neverGeneratesAnyBridge).length;
  return {
    totalCases: n,
    avgPairsAttempted: n > 0 ? sum((c) => c.totalPairsAttempted) / n : 0,
    avgValidCount: n > 0 ? sum((c) => c.totalValidCount) / n : 0,
    avgRejectedCount: n > 0 ? sum((c) => c.totalRejectedCount) / n : 0,
    avgDuplicateRatio: n > 0 ? sum((c) => c.duplicateRatio) / n : 0,
    neverGeneratesAnyBridgeCount,
    neverGeneratesAnyBridgePercent: n > 0 ? (neverGeneratesAnyBridgeCount / n) * 100 : 0,
  };
}
