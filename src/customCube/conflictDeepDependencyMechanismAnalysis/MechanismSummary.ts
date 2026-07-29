// --- MechanismSummary (CONFLICT_DEEP_DEPENDENCY Structural Mechanism
// Analysis Sprint v1, RQ-1, Deliverable #4) ----------------------------------
// Groups the 16 residual cases by their exact "mechanism signature" -- the
// ordered tuple of each of the 5 Primitives' FailureReason for that case
// (PRIMITIVE_ORDER: DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR). If ONE
// signature covers >=MEANINGFUL_DOMINANT_SHARE (0.60, the Directive's own
// stated threshold) of the 16 cases, RQ-1 answers "single common failure
// mechanism"; otherwise the population splits into >=2 real Subtypes (see
// SubtypeClassification.ts for the structural-feature-driven explanation
// of WHY they differ).
import { PRIMITIVE_ORDER } from "./FailureMatrix";
import type { PrimitiveFailurePointResult } from "./FailurePointProbe";

export const MEANINGFUL_DOMINANT_SHARE = 0.6; // Directive's own explicit ">=60%"

export function computeMechanismSignature(caseResults: readonly PrimitiveFailurePointResult[]): string {
  const byPrimitive = new Map(caseResults.map((r) => [r.primitive, r.failureReason]));
  return PRIMITIVE_ORDER.map((p) => byPrimitive.get(p) ?? "?").join("|");
}

export interface MechanismSignatureGroup {
  signature: string;
  labels: string[];
  count: number;
  share: number;
}

export interface MechanismSummaryResult {
  totalCases: number;
  groups: MechanismSignatureGroup[];
  dominantGroup: MechanismSignatureGroup;
  isSingleDominantMechanism: boolean; // dominantGroup.share >= MEANINGFUL_DOMINANT_SHARE
}

export function summarizeMechanism(caseLabels: readonly string[], allResults: readonly (readonly PrimitiveFailurePointResult[])[]): MechanismSummaryResult {
  const totalCases = caseLabels.length;
  const bySignature = new Map<string, string[]>();
  for (let i = 0; i < totalCases; i++) {
    const sig = computeMechanismSignature(allResults[i]);
    const list = bySignature.get(sig) ?? [];
    list.push(caseLabels[i]);
    bySignature.set(sig, list);
  }
  const groups: MechanismSignatureGroup[] = Array.from(bySignature.entries())
    .map(([signature, labels]) => ({ signature, labels, count: labels.length, share: totalCases ? labels.length / totalCases : 0 }))
    .sort((a, b) => b.count - a.count);
  const dominantGroup = groups[0] ?? { signature: "", labels: [], count: 0, share: 0 };
  return { totalCases, groups, dominantGroup, isSingleDominantMechanism: dominantGroup.share >= MEANINGFUL_DOMINANT_SHARE };
}
