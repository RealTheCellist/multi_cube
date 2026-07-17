// --- PolicyReport (Policy Generalization Sprint v1) -------------------------
// Formats the required deliverables (spec section 13): Policy Database
// summary, Cluster별 Policy, Replay Benchmark, Coverage/Regression analysis.
// Success-criteria/failure-condition judgment and the driver's own console
// output stay in runPolicyGeneralization.ts, matching this whole series'
// convention of keeping the verdict logic in the driver script.
import type { GoalCluster } from "../policyAnalysis/GoalClusterer";
import type { Policy, PolicyBenchmarkResult } from "../policyAnalysis/PolicyTypes";

export function formatPolicyDatabaseSection(clusters: readonly GoalCluster[], policies: readonly Policy[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- Policy Database ---");
  push(`분석한 GoalCluster (상태 시그니처) 수: ${clusters.length}`);
  push(`추출된 Policy 수: ${policies.length} (majority 없어 Policy 없음: ${clusters.length - policies.length}개)`);
  push();
  for (const cluster of clusters) {
    const policy = policies.find((p) => p.stateSignature === cluster.stateSignature);
    push(`Cluster ${cluster.stateSignature} (distinct Replay ${cluster.distinctReplayCount}개, Goal Candidate ${cluster.records.length}개)`);
    if (policy) {
      push(`  -> Policy: [${policy.primitiveSequence.join(" > ")}]`);
      push(`     단계별 동의 Replay 수: ${policy.agreementCounts.join(", ")} / 투표 Replay 수: ${policy.votingReplayCounts.join(", ")}`);
    } else {
      push(`  -> Policy 없음 (첫 단계부터 과반 동의 실패)`);
    }
  }
  return lines;
}

export function formatBenchmarkSection(results: readonly PolicyBenchmarkResult[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- Replay Benchmark (Policy별, 75건 전체) ---");
  for (const r of results) {
    push(`Policy ${r.stateSignature} [${r.primitiveSequence.join(">")}]`);
    push(`  적용 가능율 (Level 1): ${(r.appliedRate * 100).toFixed(1)}% (${r.appliedCount}/${r.totalTested})`);
    push(
      `  적용된 것 중 성공률 (Level 2): ${(r.successRateAmongApplied * 100).toFixed(1)}% (${r.successCount}/${r.appliedCount || 0})  ` +
        `Regression율 (Level 3): ${(r.regressionRateAmongApplied * 100).toFixed(1)}% (${r.regressionCount}/${r.appliedCount || 0})`
    );
    push(`  평균 WrongWing 변화 (적용된 것 중): ${r.avgWrongWingDelta.toFixed(2)}, 평균 Pair 변화: ${r.avgPairDelta.toFixed(2)}`);
    push();
  }
  return lines;
}

export function formatCoverageSection(coverage: { coverage: number; coveredCount: number; totalCount: number }, usageFreq: Record<string, number>): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- Coverage 분석 ---");
  push(`Coverage (75개 Replay 중 자기 자신의 상태가 어떤 Policy와도 일치하는 비율): ${(coverage.coverage * 100).toFixed(1)}% (${coverage.coveredCount}/${coverage.totalCount})`);
  push();
  push("--- Primitive 사용 빈도 (모든 Policy의 primitiveSequence 합산) ---");
  const entries = Object.entries(usageFreq).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) push("  (Policy 없음)");
  for (const [primitive, count] of entries) push(`  ${primitive}: ${count}`);
  return lines;
}
