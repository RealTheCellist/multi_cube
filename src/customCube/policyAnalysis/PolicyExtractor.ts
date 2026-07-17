// --- PolicyExtractor (Policy Generalization Sprint v1) ----------------------
// Step 1 of spec section 6's pipeline: "입력 (32 Goal Candidate) -> Replay
// 의존 정보 제거". Reads the EXISTING, unmodified goalPlanner/ Goal Database
// (read-only, exactly like every prior engine in this series reuses a
// previous engine's stored data) -- no new Goal Candidates are generated
// here or anywhere in this Sprint.
import { allGoalCandidates, loadGoalDatabase } from "../goalPlanner/GoalDatabase";
import type { NormalizedGoalRecord } from "./PolicyTypes";

export function extractNormalizedRecords(goalsDbPath: string): NormalizedGoalRecord[] {
  const candidates = allGoalCandidates(loadGoalDatabase(goalsDbPath));
  return candidates.map((c) => ({
    sourceReplayHash: c.replayHash,
    stateSignature: `w${c.wrongWingBefore}|p${c.parityBefore ? 1 : 0}`,
    primitiveSequence: c.primitiveSequence,
    wrongWingDecrease: c.wrongWingBefore - c.wrongWingAfter,
    pairIncrease: c.pairAfter - c.pairBefore,
  }));
}
