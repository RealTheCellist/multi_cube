// --- GateSpecification (Production Integration Blueprint Sprint v1,
// RQ-3) -------------------------------------------------------------------
// Formalizes the Prototype's own implicit precondition (detectCycle
// returning non-null) into a PRODUCTION GATE, matching the SAME pattern
// CCR's own analyzeCcrGate (cycleLength 5-6, conflictEdgeCount=0) and
// REPAIR's W2_widerHop Gate (cycleLength 2-4 AND conflictEdgeCount>0)
// already establish -- derived EMPIRICALLY by cross-referencing which of
// the 28 PRIMARY cases' own measured structural profiles (cycleLength/
// conflictEdgeCount/etc, from primitiveSetCompleteness's own
// residualClassified data) correlate with Mixed Commutator actually
// finding an improving construction, not assumed.
export interface CaseProfile {
  label: string;
  cycleLength: number;
  conflictEdgeCount: number;
  componentCount: number;
  hasParity: boolean;
}

export interface GateFeatureComparison {
  feature: string;
  avgAmongSolved: number;
  avgAmongUnsolved: number;
}

export interface GateSpecificationResult {
  solvedCount: number;
  unsolvedCount: number;
  featureComparisons: GateFeatureComparison[];
  proposedGate: string;
  rationale: string;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function deriveGateSpecification(profiles: CaseProfile[], solvedLabels: Set<string>): GateSpecificationResult {
  const solved = profiles.filter((p) => solvedLabels.has(p.label));
  const unsolved = profiles.filter((p) => !solvedLabels.has(p.label));

  const featureComparisons: GateFeatureComparison[] = [
    { feature: "cycleLength", avgAmongSolved: avg(solved.map((p) => p.cycleLength)), avgAmongUnsolved: avg(unsolved.map((p) => p.cycleLength)) },
    { feature: "conflictEdgeCount", avgAmongSolved: avg(solved.map((p) => p.conflictEdgeCount)), avgAmongUnsolved: avg(unsolved.map((p) => p.conflictEdgeCount)) },
    { feature: "componentCount", avgAmongSolved: avg(solved.map((p) => p.componentCount)), avgAmongUnsolved: avg(unsolved.map((p) => p.componentCount)) },
    {
      feature: "hasParity(0/1)",
      avgAmongSolved: avg(solved.map((p) => (p.hasParity ? 1 : 0))),
      avgAmongUnsolved: avg(unsolved.map((p) => (p.hasParity ? 1 : 0))),
    },
  ];

  const conflictAllZeroAmongSolved = solved.every((p) => p.conflictEdgeCount === 0);
  const componentAllOneAmongSolved = solved.every((p) => p.componentCount === 1);

  const proposedGate =
    conflictAllZeroAmongSolved && componentAllOneAmongSolved
      ? "cycleCount===1 (single dominant cycle, already required by detectCycle/analyzeMultiCycle) AND conflictEdgeCount===0 AND componentCount===1"
      : "cycleCount===1 (single dominant cycle, already required by detectCycle/analyzeMultiCycle) -- no additional structural gate found to cleanly separate solved from unsolved among the measured PRIMARY population";

  const rationale = conflictAllZeroAmongSolved
    ? `${solved.length}건의 해결 케이스 전원이 conflictEdgeCount=0, componentCount=1을 만족함 (실측) -- CCR의 Gate(conflictEdgeCount=0)와 동일한 조건이 Mixed Commutator에도 자연스럽게 성립한다는 뜻이지만, 표본이 작아(${solved.length}건) 강한 통계적 결론은 아니다.`
      : `해결/미해결 케이스 사이에 단일 구조 특징으로 깔끔히 분리되는 Gate 조건을 찾지 못했다 -- Cycle Detection 자체(cycleCount===1) 외에는 추가 Gate를 강제하지 않는 것을 제안한다.`;

  return { solvedCount: solved.length, unsolvedCount: unsolved.length, featureComparisons, proposedGate, rationale };
}
