// --- CapabilityRequirement (Solver v2 Research Kickoff Sprint v1) ----------
// Deliverable 3: turns GapDetector's real measured features into
// human-readable, QUANTITATIVE "Need" statements -- spec's own example
// shape ("Need: Decrease WrongWing without breaking Pair"), grounded in
// actual numbers rather than left as an abstract description.
import type { GapCommonFeatures, ReplayGapProfile } from "./GapDetector";

export interface CapabilityRequirementStatement {
  id: string;
  need: string; // one-line, human-readable, quantitative
  evidence: string; // the specific measured numbers behind it
  targetWrongWingRange: [number, number];
  targetParity: "true" | "false" | "either";
  targetCycleLengthMin: number;
}

export function generateRequirements(features: GapCommonFeatures, profiles: readonly ReplayGapProfile[]): CapabilityRequirementStatement[] {
  const gaps = profiles.filter((p) => p.isHardGap);
  const parityGaps = gaps.filter((p) => p.parity);
  const nonParityGaps = gaps.filter((p) => !p.parity);
  const longCycleGaps = gaps.filter((p) => p.longestCycleLength >= 4);

  const requirements: CapabilityRequirementStatement[] = [];

  requirements.push({
    id: "REQ-1-GENERAL",
    need: `WrongWing을 감소시키되, 이미 맞춰진 Pair를 깨지 않아야 함 (전체 실패의 ${(features.gapShare * 100).toFixed(1)}%가 기존 6개 능력(BASE/FLIP/CASE/PARITY/RECOVERY/CycleChase) 전부에서 실패)`,
    evidence: `Hard Gap ${features.count}/${features.totalReplays}건, 평균 WrongWing ${features.avgWrongWing.toFixed(2)} (범위 ${features.wrongWingRange[0]}-${features.wrongWingRange[1]}), 평균 Pair ${features.avgPairCount.toFixed(2)}`,
    targetWrongWingRange: features.wrongWingRange,
    targetParity: "either",
    targetCycleLengthMin: 0,
  });

  if (parityGaps.length >= gaps.length * 0.3) {
    requirements.push({
      id: "REQ-2-PARITY",
      need: `Parity가 존재하는 상태에서 WrongWing을 감소시켜야 함 (Hard Gap 중 ${(features.parityRate * 100).toFixed(1)}%가 Parity=true)`,
      evidence: `Parity Gap ${parityGaps.length}/${gaps.length}건, 평균 WrongWing ${(parityGaps.reduce((s, p) => s + p.wrongWingCount, 0) / (parityGaps.length || 1)).toFixed(2)}`,
      targetWrongWingRange: features.wrongWingRange,
      targetParity: "true",
      targetCycleLengthMin: 0,
    });
  }

  if (nonParityGaps.length >= gaps.length * 0.3) {
    requirements.push({
      id: "REQ-3-NONPARITY",
      need: `Parity 없이도 WrongWing이 감소하지 않는 상태를 풀어야 함 (Hard Gap 중 ${(((gaps.length - parityGaps.length) / (gaps.length || 1)) * 100).toFixed(1)}%가 Parity=false)`,
      evidence: `Non-Parity Gap ${nonParityGaps.length}/${gaps.length}건`,
      targetWrongWingRange: features.wrongWingRange,
      targetParity: "false",
      targetCycleLengthMin: 0,
    });
  }

  if (longCycleGaps.length >= gaps.length * 0.3) {
    requirements.push({
      id: "REQ-4-MULTICYCLE",
      need: `Pair를 유지하면서 길이 4 이상의 WANTS-Cycle을 한 번에(또는 소수의 결정적 단계로) 줄일 수 있어야 함 (Hard Gap 중 평균 Cycle 길이 ${features.avgCycleLength.toFixed(2)})`,
      evidence: `길이 4+ Cycle을 가진 Hard Gap ${longCycleGaps.length}/${gaps.length}건 -- Solver Contract Analysis Sprint v1이 측정한 "즉시 개선 필수" 계약의 실측 비용(depth=2 전수 탐색 ~1.46초, 예산 초과)과 정확히 같은 구조`,
      targetWrongWingRange: features.wrongWingRange,
      targetParity: "either",
      targetCycleLengthMin: 4,
    });
  }

  return requirements;
}
