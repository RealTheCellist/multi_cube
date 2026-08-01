// --- CompetitionAttribution (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP2) -----------------------------------------------
// For each successMismatch case's CompetitionTimeline (STEP1), lists every
// Primitive that ran BEFORE MULTI_COMPONENT_MERGE and separates what each
// one actually did into 3 disjoint effects the Directive itself names:
// "시간 소비"(time consumption on the shared outer deadline, always true for
// any prior segment), "후보 소비"(candidate consumption -- did it survive to
// become an offered candidate in chooseBestRecovery's own input array), and
// "선택 경쟁"(selection competition -- did it WIN chooseBestRecovery's argmax
// over MCM, when MCM was also offered).
import type { CaseCompetitionTimeline, CandidateSegment } from "./CompetitionTimeline";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export interface PriorPrimitiveEffect {
  type: RecoveryType;
  seq: number;
  timeConsumedMs: number; // 시간 소비
  producedCandidate: boolean; // 후보 소비 (finalPhase === "generated")
  wonSelection: boolean; // 선택 경쟁 (this type is the chosenType AND MCM was also offered)
}

export interface CaseAttribution {
  label: string;
  primitivesBeforeMcm: PriorPrimitiveEffect[];
  totalTimeConsumedBeforeMcmMs: number;
  candidateProducingCount: number; // how many of the prior Primitives actually produced a candidate (real competition for chooseBestRecovery, not just wasted time)
  mcmOffered: boolean;
  mcmChosen: boolean;
  mcmOwnBudgetMs: number | null; // remainingTimeAtStartMs for MCM's own segment -- the effective cap it was given
  chosenType: RecoveryType | "none";
}

function classifySegments(timeline: CaseCompetitionTimeline): CaseAttribution {
  const mcm = timeline.mcmSegment;
  const priorSegments: CandidateSegment[] = mcm ? timeline.segments.filter((s) => s.startMs < mcm.startMs) : timeline.segments.filter((s) => s.type !== "MULTI_COMPONENT_MERGE");

  const primitivesBeforeMcm: PriorPrimitiveEffect[] = priorSegments.map((s) => ({
    type: s.type,
    seq: s.seq,
    timeConsumedMs: s.ownRuntimeMs ?? 0,
    producedCandidate: s.finalPhase === "generated",
    wonSelection: timeline.mcmOffered && timeline.chosenType === s.type,
  }));

  return {
    label: timeline.label,
    primitivesBeforeMcm,
    totalTimeConsumedBeforeMcmMs: primitivesBeforeMcm.reduce((sum, p) => sum + p.timeConsumedMs, 0),
    candidateProducingCount: primitivesBeforeMcm.filter((p) => p.producedCandidate).length,
    mcmOffered: timeline.mcmOffered,
    mcmChosen: timeline.mcmChosen,
    mcmOwnBudgetMs: mcm?.remainingTimeAtStartMs ?? null,
    chosenType: timeline.chosenType,
  };
}

export function buildAttributions(timelines: readonly CaseCompetitionTimeline[]): CaseAttribution[] {
  return timelines.map(classifySegments);
}
