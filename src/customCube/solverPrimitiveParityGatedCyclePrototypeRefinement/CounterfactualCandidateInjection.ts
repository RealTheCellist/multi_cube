// --- CounterfactualCandidateInjection (Parity-Gated Cycle Primitive
// Prototype Refinement Sprint v1, STEP4) ---------------------------------------
// Directive: "Primitive 알고리즘은 수정하지 않는다. Candidate만 강제로
// 추가한다" -- the SAME real mechanism BridgeCandidateGeneration.ts
// already uses (relocate an existing wrong wing from one component into a
// slot of the other, verified via targetedComponentsMerged, unmodified,
// reimplemented here identically per this Sprint's own protected-file
// list) is reused verbatim; only its own BOUNDED search WIDTH is widened
// -- ALL wrong wings in the source component x ALL slots in the target
// component (not capped at MAX_SOURCE_WINGS_TRIED=5/
// MAX_TARGET_SLOTS_TRIED=5), both directions, under a larger deadline
// (matching the Primitive's own overall 2000ms budget rather than the
// 300ms bridge sub-budget). No new algorithm, no new success criterion --
// this isolates whether Candidate Generation's failure is a SEARCH-WIDTH
// limit (more candidates recover it) or a genuine structural limit (widening
// changes nothing, no such relocation exists for this graph topology).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bfsMoveWingToPosition, slotKey, toLiteEdges, wrongWings5, type Move } from "../fiveByFiveEdges";
import { detectComponents, type ComponentInfo } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { BRIDGE_BFS_MAX_DEPTH, type ComponentSelectionStrategy } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
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

const WIDENED_BFS_PER_CANDIDATE_MS = 150; // same per-candidate sub-budget as production -- only the CAP on how many pairs are tried is widened, not the per-pair search itself
const INJECTION_TOTAL_BUDGET_MS = 2000; // matches the Primitive's own overall reserved-slice budget, not the tight 300ms bridge sub-budget

function widenedCandidatesForDirection(cubies: Cubie[], compSource: string[], compTarget: string[], deadline: number): { moves: Move[] }[] {
  const wrong = wrongWings5(cubies);
  const sourceCandidates = wrong.filter((w) => compSource.includes(slotKey(w))); // uncapped -- ALL wrong wings in source
  const targetSlotWings = wrong.filter((w) => compTarget.includes(slotKey(w)));
  const seenTargetSlots = new Set<string>();
  const targetWingsBySlot: Cubie[] = [];
  for (const w of targetSlotWings) {
    const key = slotKey(w);
    if (seenTargetSlots.has(key)) continue;
    seenTargetSlots.add(key);
    targetWingsBySlot.push(w); // uncapped -- ALL target slots
  }

  const candidates: { moves: Move[] }[] = [];
  for (const source of sourceCandidates) {
    for (const targetWing of targetWingsBySlot) {
      if (Date.now() > deadline) return candidates;
      const edges = toLiteEdges(cubies);
      const targetEdge = edges.find((e) => e.id === targetWing.id);
      if (!targetEdge) continue;
      const targetPosKey = `${targetEdge.x},${targetEdge.y},${targetEdge.z}`;

      const bfsDeadline = Math.min(deadline, Date.now() + WIDENED_BFS_PER_CANDIDATE_MS);
      const path = bfsMoveWingToPosition(edges, source.id, targetPosKey, BRIDGE_BFS_MAX_DEPTH, undefined, bfsDeadline);
      if (!path || path.length === 0) continue;

      const after = cloneCubies(cubies);
      applySeq(after, path);
      if (targetedComponentsMerged(after, compSource, compTarget)) candidates.push({ moves: path });
    }
  }
  return candidates;
}

export function injectWidenedBridgeCandidates(cubies: Cubie[], components: ComponentInfo, deadline: number, strategy: ComponentSelectionStrategy = "largestTwo"): { moves: Move[] }[] {
  const bySize = [...components.components].sort((a, b) => b.length - a.length);
  if (bySize.length < 2) return [];
  const [compX, compY] = strategy === "largestTwo" ? bySize : [...bySize].reverse();

  const forward = widenedCandidatesForDirection(cubies, compX, compY, deadline);
  if (Date.now() > deadline) return forward;
  const backward = widenedCandidatesForDirection(cubies, compY, compX, deadline);
  return [...forward, ...backward];
}

export interface CandidateInjectionCaseResult {
  label: string;
  originalBridgeCandidateCount: number; // real, bounded generateBridgeCandidates() result on this case
  widenedBridgeCandidateCount: number; // this file's widened, uncapped search
  recoveredByWidening: boolean; // original found 0, widened found >=1
}

export function evaluateCandidateInjection(hole: HoleCase, originalBridgeCandidateCount: number): CandidateInjectionCaseResult {
  const components = detectComponents(hole.cubies);
  const deadline = Date.now() + INJECTION_TOTAL_BUDGET_MS;
  const widened = injectWidenedBridgeCandidates(hole.cubies, components, deadline, "largestTwo");
  return {
    label: hole.label,
    originalBridgeCandidateCount,
    widenedBridgeCandidateCount: widened.length,
    recoveredByWidening: originalBridgeCandidateCount === 0 && widened.length > 0,
  };
}

export interface CandidateInjectionSummary {
  totalCases: number;
  originalZeroCandidateCount: number; // how many of these cases had 0 real bridge candidates
  recoveredByWideningCount: number; // of those, how many the widened search DOES find >=1 candidate for
  recoveryRatePercent: number; // recoveredByWideningCount / originalZeroCandidateCount
}

export function summarizeCandidateInjection(perCase: readonly CandidateInjectionCaseResult[]): CandidateInjectionSummary {
  const originalZeroCandidateCount = perCase.filter((c) => c.originalBridgeCandidateCount === 0).length;
  const recoveredByWideningCount = perCase.filter((c) => c.recoveredByWidening).length;
  return {
    totalCases: perCase.length,
    originalZeroCandidateCount,
    recoveredByWideningCount,
    recoveryRatePercent: originalZeroCandidateCount > 0 ? (recoveredByWideningCount / originalZeroCandidateCount) * 100 : 0,
  };
}
