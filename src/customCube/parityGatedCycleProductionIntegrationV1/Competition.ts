// --- Competition (Parity-Gated Cycle Production Integration Sprint v1,
// STEP5) --------------------------------------------------------------------
// Directive names BP-1 and Multi-Hop Bridge among the competitors to
// measure against -- disclosed: neither is wired into the real Production
// Recovery Scheduler at all (fiveByFiveEdgeRecovery.ts's own RecoveryType
// union has exactly 6 members: DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR/
// PARITY_GATED_CYCLE -- confirmed by direct source inspection, same file
// this Sprint itself just extended). "경쟁" at the PRODUCTION layer can
// only be measured among candidates that actually compete in the real
// chooseBestRecovery() argmax, so this module measures PARITY_GATED_CYCLE's
// real competition against the 5 OTHER real, wired RecoveryTypes -- the
// same substitution this whole arc's own prior Production Integration
// Sprints (CCR/MixedCommutator) already made for the identical reason.
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { ReplayOutcome } from "./Replay";
import { parseScoredCandidates } from "./Replay";

export const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE"];

export interface CompetitionTypeStats {
  type: RecoveryType;
  offeredCount: number;
  chosenCount: number;
  chosenRate: number;
  replacedByParityGatedCycleCount: number; // rounds where this type was offered but PARITY_GATED_CYCLE won instead
}

export interface CompetitionSummary {
  stats: CompetitionTypeStats[];
  avgScoreGapWhenParityGatedCycleChosen: number; // PARITY_GATED_CYCLE's own score minus the runner-up's score, averaged over rounds it won
  avgScoreGapWhenParityGatedCycleLost: number; // runner-up's score minus PARITY_GATED_CYCLE's own score, averaged over rounds it was offered but lost
}

export function summarizeCompetition(integrated: readonly ReplayOutcome[]): CompetitionSummary {
  const stats: CompetitionTypeStats[] = ALL_RECOVERY_TYPES.map((type) => {
    const offeredRounds = integrated.filter((o) => o.candidatesOffered.includes(type));
    const chosenRounds = integrated.filter((o) => o.chosenType === type);
    const replacedByParityGatedCycleCount = integrated.filter((o) => o.candidatesOffered.includes(type) && o.chosenType === "PARITY_GATED_CYCLE").length;
    return {
      type,
      offeredCount: offeredRounds.length,
      chosenCount: chosenRounds.length,
      chosenRate: offeredRounds.length ? chosenRounds.length / offeredRounds.length : 0,
      replacedByParityGatedCycleCount,
    };
  });

  const wonGaps: number[] = [];
  const lostGaps: number[] = [];
  for (const o of integrated) {
    const scored = parseScoredCandidates(o.candidatesDetail);
    const pgc = scored.find((s) => s.type === "PARITY_GATED_CYCLE");
    if (!pgc) continue;
    const others = scored.filter((s) => s.type !== "PARITY_GATED_CYCLE");
    if (others.length === 0) continue;
    const runnerUp = Math.max(...others.map((s) => s.score));
    if (o.chosenType === "PARITY_GATED_CYCLE") wonGaps.push(pgc.score - runnerUp);
    else lostGaps.push(runnerUp - pgc.score);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

  return { stats, avgScoreGapWhenParityGatedCycleChosen: avg(wonGaps), avgScoreGapWhenParityGatedCycleLost: avg(lostGaps) };
}
