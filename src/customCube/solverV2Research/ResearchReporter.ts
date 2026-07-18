// --- ResearchReporter (Solver v2 Research Kickoff Sprint v1) ---------------
// Deliverable 5: assembles the Capability Matrix, Gap, Requirement, and
// Blueprint data into the final Research Report text. Success/failure
// verdict logic stays in the driver (runSolverV2Research.ts), matching this
// whole series' convention.
import type { ClusterCapabilityRow, PrimitiveName } from "./CapabilityMatrix";
import { ALL_PRIMITIVES } from "./CapabilityMatrix";
import type { GapCommonFeatures } from "./GapDetector";
import type { CapabilityRequirementStatement } from "./CapabilityRequirement";
import type { PrimitiveBlueprintDraft } from "./PrimitiveBlueprint";

export function formatCapabilityMatrixSection(rows: readonly ClusterCapabilityRow[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- Primitive Capability Matrix (전체 22개 Cluster) ---");
  push(`Cluster           Size  WrongWing  Cycle  ${ALL_PRIMITIVES.join("  ")}`);
  for (const r of rows) {
    const flags = ALL_PRIMITIVES.map((p: PrimitiveName) => (r.succeeded[p] ? "O" : "X")).join("      ");
    push(`${r.clusterKey.padEnd(16)}  ${String(r.size).padEnd(4)}  ${String(r.wrongWingCount).padEnd(9)}  ${String(r.longestCycleLength).padEnd(5)}  ${flags}`);
  }
  return lines;
}

export function formatGapSection(features: GapCommonFeatures, clusterGapCoverage: { totalClusters: number; clustersWithGapMember: number }): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- Gap Detector 결과 ---");
  push(`Hard Gap Replay (6개 능력 전부 실패): ${features.count}/${features.totalReplays} (${(features.gapShare * 100).toFixed(1)}%)`);
  push(`평균 WrongWing: ${features.avgWrongWing.toFixed(2)} (범위 ${features.wrongWingRange[0]}-${features.wrongWingRange[1]})`);
  push(`Parity 비율: ${(features.parityRate * 100).toFixed(1)}%`);
  push(`평균 Cycle 길이: ${features.avgCycleLength.toFixed(2)}`);
  push(`평균 Pair: ${features.avgPairCount.toFixed(2)}`);
  push(`Cluster 커버리지: ${clusterGapCoverage.clustersWithGapMember}/${clusterGapCoverage.totalClusters}개 Cluster가 Hard Gap Replay를 최소 1건 포함`);
  return lines;
}

export function formatRequirementSection(requirements: readonly CapabilityRequirementStatement[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- Required Capability (정량적 Need) ---");
  for (const r of requirements) {
    push(`[${r.id}] ${r.need}`);
    push(`  근거: ${r.evidence}`);
  }
  return lines;
}

export function formatBlueprintSection(blueprints: readonly PrimitiveBlueprintDraft[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push(`--- Primitive Blueprint 후보 (${blueprints.length}개) ---`);
  for (const bp of blueprints) {
    push();
    push(`[${bp.id}] ${bp.name} (from ${bp.derivedFromRequirement})`);
    push(`  Input: ${bp.input}`);
    push(`  Expected Effect: ${bp.expectedEffect}`);
    push(`  Forbidden Effect: ${bp.forbiddenEffect}`);
    push(`  Activation Condition: ${bp.activationCondition}`);
    push(`  기존과의 차이: ${bp.differsFromExisting}`);
  }
  return lines;
}
