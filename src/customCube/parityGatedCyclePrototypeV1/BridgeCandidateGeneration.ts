// --- BridgeCandidateGeneration (Parity-Gated Cycle Prototype Sprint v1,
// STEP1 "bridge 후보 생성" + "temporary bridge") -----------------------------
// Genuinely new logic (the gap this whole Sprint targets: no code anywhere
// in this arc has ever physically relocated a wing to MERGE two WANTS-graph
// components). Grounded in how buildStateGraph itself defines an edge
// (capabilityAnalysis/stateGraphBuilder.ts, cited not modified): a WANTS
// edge A->B exists exactly when the WRONG wing currently sitting in slot A
// carries slot B's true-edge color.
//
// Disclosed dead end, kept here for the record (STEP4's Root Cause
// analysis references it): this Sprint's FIRST hypothesis was to instead
// "sacrifice" a color-matched wing from elsewhere on the cube into the
// source component. Direct inspection (via a throwaway debug script,
// deleted after use) proved this structurally impossible for THIS
// puzzle's wing model: a disconnected WANTS-graph component is, by
// construction, "color-closed" -- every wing-color pair whose slot
// participates in component Y has its OTHER physical half ALSO already
// inside Y (verified across every slot of a real Unknown case). If any
// color's two halves were split across X and Y, that alone would already
// create the connecting edge, contradicting "X and Y are disconnected" in
// the first place. So there is never a "donor piece" elsewhere to sacrifice.
//
// The mechanism actually implemented: take an EXISTING wrong wing from
// component X and physically relocate it (bfsMoveWingToPosition,
// fiveByFiveEdges.ts, already exported for exactly this "move THIS piece
// to THIS position" reachability search) into a slot occupied by component
// Y. That wing's own true-color destination doesn't change -- it's still
// somewhere in X -- so once it sits in a Y slot, a new edge (Y-slot -> its
// X destination) is created, merging the components. Both directions
// (X-wing-into-Y, Y-wing-into-X) are tried.
//
// Disclosed measurement-bug fix (found via direct before/after
// buildStateGraph edge inspection on a real case, worstCase:4549b041,
// source id=57 slot y2,z-2 -> target id=40 slot y2,z2): the FIRST
// verification attempt checked whether GLOBAL componentCount decreased.
// That check produced false negatives -- the intended merge of compSource
// and compTarget DID happen locally every time it was inspected directly,
// but a single face turn moves a whole layer, so the SAME move can also
// break an unrelated, previously-solved pair elsewhere on the cube. That
// side effect creates a brand-new small component elsewhere, which
// offsets/cancels the net global count regardless of whether the intended
// merge succeeded. The corrected check below instead asks the narrower,
// causally-correct question: do the slots that originally belonged to
// compSource/compTarget (restricted to whichever of them are still
// unfinished graph nodes after the move) now all belong to a SINGLE
// component? Unrelated new components created elsewhere as collateral are
// accepted, not counted as failure. Each candidate is still verified
// EMPIRICALLY (not assumed): the move sequence is applied to a real clone
// and re-measured via ComponentDetection.ts. Because a single face turn
// moves a whole layer (not just the tracked piece), the OTHER wrong wings
// can get shuffled unpredictably along the BFS path, so success is not
// guaranteed even though the mechanism is theoretically sound -- this
// Sprint reports whatever the empirical rate actually is, per the
// Directive's own "실패하더라도 설계 변경 없이 실측 결과를 그대로
// 보고한다."
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bfsMoveWingToPosition, slotKey, toLiteEdges, wrongWings5, type Move } from "../fiveByFiveEdges";
import { detectComponents, countComponents, type ComponentInfo } from "./ComponentDetection";

// Bounded, disclosed constants -- same "small, cheap-to-exhaust" discipline
// this arc's own BoundedResolver/CCRPrototype/GateSweepSimulator files use.
export const MAX_SOURCE_WINGS_TRIED = 5;
export const MAX_TARGET_SLOTS_TRIED = 5;
export const BRIDGE_BFS_MAX_DEPTH = 8;
export const BRIDGE_BFS_PER_CANDIDATE_MS = 150;

export interface BridgeCandidate {
  moves: Move[];
  componentCountAfter: number;
}

export type ComponentSelectionStrategy = "largestTwo" | "smallestTwo";

// Corrected success check (see file-header disclosure): the slots
// originally in compSource/compTarget that are still unfinished graph
// nodes after the move must now all belong to a single component --
// unrelated new components created elsewhere as collateral are accepted.
function targetedComponentsMerged(after: Cubie[], compSource: string[], compTarget: string[]): boolean {
  const { componentOfSlot } = detectComponents(after);
  const targetedSlots = [...compSource, ...compTarget].filter((slot) => componentOfSlot.has(slot));
  if (targetedSlots.length === 0) return false;
  const firstComponent = componentOfSlot.get(targetedSlots[0]);
  return targetedSlots.every((slot) => componentOfSlot.get(slot) === firstComponent);
}

function candidatesForDirection(cubies: Cubie[], compSource: string[], compTarget: string[], deadline: number): BridgeCandidate[] {
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

  const candidates: BridgeCandidate[] = [];
  for (const source of sourceCandidates) {
    for (const targetWing of targetWingsBySlot) {
      if (Date.now() > deadline) return candidates;

      const edges = toLiteEdges(cubies);
      const targetEdge = edges.find((e) => e.id === targetWing.id);
      if (!targetEdge) continue;
      const targetPosKey = `${targetEdge.x},${targetEdge.y},${targetEdge.z}`;

      const bfsDeadline = Math.min(deadline, Date.now() + BRIDGE_BFS_PER_CANDIDATE_MS);
      const path = bfsMoveWingToPosition(edges, source.id, targetPosKey, BRIDGE_BFS_MAX_DEPTH, undefined, bfsDeadline);
      if (!path || path.length === 0) continue;

      const after = cloneCubies(cubies);
      applySeq(after, path);
      if (targetedComponentsMerged(after, compSource, compTarget)) {
        const componentCountAfter = countComponents(after);
        candidates.push({ moves: path, componentCountAfter });
      }
    }
  }
  return candidates;
}

// Tries BOTH directions (source-in-X targeting a slot in Y, AND source-in-Y
// targeting a slot in X) within the same bounded budget -- a disclosed
// fairness measure, not tuning toward a pre-decided outcome (every
// candidate is still verified empirically above).
export function generateBridgeCandidates(cubies: Cubie[], components: ComponentInfo, deadline: number, strategy: ComponentSelectionStrategy = "largestTwo"): BridgeCandidate[] {
  const bySize = [...components.components].sort((a, b) => b.length - a.length);
  if (bySize.length < 2) return [];
  const [compX, compY] = strategy === "largestTwo" ? bySize : [...bySize].reverse();

  const forward = candidatesForDirection(cubies, compX, compY, deadline);
  if (Date.now() > deadline) return forward;
  const backward = candidatesForDirection(cubies, compY, compX, deadline);
  return [...forward, ...backward];
}
