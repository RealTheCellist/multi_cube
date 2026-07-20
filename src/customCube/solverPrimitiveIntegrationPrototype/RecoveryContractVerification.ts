// --- RecoveryContractVerification (Solver Primitive Integration Prototype
// Sprint v1) -- STEP2: measures 생성 여부/호출 횟수/성공 횟수/Deferred
// Reject/실제 채택 횟수 across the real 150-replay Dataset using the REAL
// production generateRecoveryStrategies/chooseBestRecovery, and compares
// against Integration Blueprint Sprint v1's own IntegrationContract.ts
// predictions (deferredValidation/primitivePriority sections).
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { collectGenerationRecord, RECOVERY_DEADLINE_MS, type RecoveryGenerationRecord } from "./RecoveryBenchmark";

export interface ContractVerificationSummary {
  n: number;
  repairGeneratedCount: number;
  repairGeneratedRate: number;
  repairChosenCount: number; // among generated, how many times REPAIR actually won chooseBestRecovery
  repairChosenRateAmongGenerated: number;
  deferredRejectCount: number; // Gate matched (analyzeMultiCycle+conflictEdgeCount) but runSuccessV2 returned matched:true, moves:null (rejected by validateDeferred or search exhausted)
  avgCandidateCount: number;
  records: RecoveryGenerationRecord[];
}

/** A record counts as a "Deferred Reject" candidate when REPAIR was NOT
 * generated (add() drops null/empty moves) even though this snapshot is
 * one Recovery was actually invoked on -- i.e. runSuccessV2 either failed
 * its own Gate (matched:false) or found no net-improving leaf
 * (moves:null). We can't distinguish those two from the generation
 * record alone (add() only sees the final moves), so this summary
 * reports the combined "not generated" rate as its own column and lets
 * STEP2's own report note the distinction transparently. */
export function verifyRecoveryContract(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): ContractVerificationSummary {
  const records = snapshots.map((s) => collectGenerationRecord(s, libs, RECOVERY_DEADLINE_MS));
  const n = records.length;
  const repairGeneratedCount = records.filter((r) => r.repairGenerated).length;
  const repairChosenCount = records.filter((r) => r.repairChosen).length;
  const deferredRejectCount = n - repairGeneratedCount;
  const avgCandidateCount = records.reduce((a, r) => a + r.candidateCount, 0) / n;

  return {
    n,
    repairGeneratedCount,
    repairGeneratedRate: repairGeneratedCount / n,
    repairChosenCount,
    repairChosenRateAmongGenerated: repairGeneratedCount > 0 ? repairChosenCount / repairGeneratedCount : 0,
    deferredRejectCount,
    avgCandidateCount,
    records,
  };
}
