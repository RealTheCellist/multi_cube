// --- FirstHopBFSDiagnostic (First-Hop Failure Analysis Sprint v1) ----------
// Spec STEP 2 + half of STEP 5: for the small subset of FIRST_HOP_FAIL
// Replays where enumerateWingCandidates() found NOTHING at all
// ("candidateCount === 0"), determine WHY -- no color-matching donor wing
// exists at all, or a donor exists but ShadowBFS.ts's own depth-6 search
// (mirroring the real bfsMoveWingToPosition) can't reach it -- and test
// the STEP 5 counterfactual "what if maxDepth were 6+2=8" directly.
//
// Reads the EXPORTED WingLibrary's own `entries`/`effect` fields directly
// (never modifying the library or fiveByFiveEdges.ts) to compute exactly
// the same target position (p2Key) tryFixWing() itself would use for a
// given wrong wing -- this is READING the library's existing, already-built
// data, not reimplementing its construction.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { colorKeyOf, slotKey, wrongWings5, type WingLibrary } from "../fiveByFiveEdges";
import { pieceType5 } from "../fiveByFivePieces";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { shadowBFSMoveToPosition, type ShadowBFSResult } from "./ShadowBFS";

function posKeyOf(c: Cubie): string {
  const r = (n: number) => Math.round(n * 2) / 2;
  return `${r(c.position.x)},${r(c.position.y)},${r(c.position.z)}`;
}

export interface NoValidPathDiagnostic {
  replayHash: string;
  hasColorMatchingDonor: boolean;
  depth6: ShadowBFSResult | null;
  depth8: ShadowBFSResult | null; // spec STEP 5's own suggested counterfactual: "Depth +2"
}

export function diagnoseNoValidPath(snapshot: FailureSnapshot, startSlot: string, lib: WingLibrary): NoValidPathDiagnostic {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongHere = wrongWings5(cubies).find((w) => slotKey(w) === startSlot);
  if (!wrongHere) return { replayHash: snapshot.hash, hasColorMatchingDonor: false, depth6: null, depth8: null };

  const p1 = posKeyOf(wrongHere);
  const trueEdge = cubies.find((c) => pieceType5(c) === "trueEdge" && slotKey(c) === startSlot);
  if (!trueEdge) return { replayHash: snapshot.hash, hasColorMatchingDonor: false, depth6: null, depth8: null };
  const neededColorKey = colorKeyOf(trueEdge);

  const entry = lib.entries.find((e) => e.effect.has(p1));
  if (!entry) return { replayHash: snapshot.hash, hasColorMatchingDonor: false, depth6: null, depth8: null };
  const eff = entry.effect.get(p1)!;
  const p2Key = `${eff.pos[0]},${eff.pos[1]},${eff.pos[2]}`;

  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const donor = cubies.find((c) => pieceType5(c) === "wingEdge" && c.id !== wrongHere.id && wrongIds.has(c.id) && colorKeyOf(c) === neededColorKey);
  if (!donor) return { replayHash: snapshot.hash, hasColorMatchingDonor: false, depth6: null, depth8: null };

  const clone6 = cloneCubies(cubies);
  const depth6 = shadowBFSMoveToPosition(clone6, donor.id, p2Key, wrongHere.id, p1, 6);
  const clone8 = cloneCubies(cubies);
  const depth8 = shadowBFSMoveToPosition(clone8, donor.id, p2Key, wrongHere.id, p1, 8);

  return { replayHash: snapshot.hash, hasColorMatchingDonor: true, depth6, depth8 };
}
